import type { S3Handler } from "aws-lambda";
import { GetObjectCommand, PutObjectCommand, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { s3Client } from "../aws/config";
import { env } from "../config/env";
import { DeploymentService } from "../services/deployment.service";
import { DeploymentStatus } from "../constants/deploymentStatus";
import { getContentType } from "../aws/s3.service";
import unzipper from "unzipper";
import { Readable } from "stream";

const deployments = new DeploymentService();
const MAX_TOTAL_BYTES = 1024 * 1024 * 1024;
const MAX_FILE_BYTES = 50 * 1024 * 1024;

function deploymentIdFromKey(key: string): string | null {
  const match = /^deployments\/(dep_[0-9a-f-]+)(?:\.zip)?$/i.exec(key);
  return match?.[1] || null;
}

async function readEntry(entry: Readable, size: number): Promise<Buffer> {
  if (size > MAX_FILE_BYTES) throw new Error("Artifact contains a file larger than 50 MB");
  const chunks: Buffer[] = [];
  for await (const chunk of entry) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

/** Publishes only validated CodeBuild artifacts. CodeBuild never writes to the served bucket. */
export const handler: S3Handler = async (event) => {
  if (!env.ARTIFACT_BUCKET_NAME || !env.S3_BUCKET_NAME) throw new Error("Artifact publishing buckets are not configured");
  for (const record of event.Records) {
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));
    const deploymentId = deploymentIdFromKey(key);
    if (!deploymentId) continue;
    const deployment = await deployments.getDeploymentStatus(deploymentId);
    if (deployment.status === DeploymentStatus.CANCELLED) continue;

    const object = await s3Client.send(new GetObjectCommand({ Bucket: env.ARTIFACT_BUCKET_NAME, Key: key }));
    if (!object.Body || object.ContentLength === undefined || object.ContentLength > MAX_TOTAL_BYTES) {
      throw new Error("Deployment artifact is missing or exceeds 1 GB");
    }

    let totalBytes = 0;
    let uploaded = 0;
    const parser = (object.Body as Readable).pipe(unzipper.Parse({ forceStream: true }));
    for await (const entry of parser as AsyncIterable<any>) {
      const path = String(entry.path).replace(/\\/g, "/");
      if (entry.type !== "File") { entry.autodrain(); continue; }
      if (!path || path.startsWith("/") || path.split("/").includes("..") || path.startsWith("build-meta")) {
        entry.autodrain();
        throw new Error("Artifact contains an unsafe path");
      }
      const body = await readEntry(entry, Number(entry.vars?.uncompressedSize || 0));
      totalBytes += body.byteLength;
      if (totalBytes > MAX_TOTAL_BYTES) throw new Error("Deployment artifact exceeds 1 GB after extraction");
      await s3Client.send(new PutObjectCommand({
        Bucket: env.S3_BUCKET_NAME,
        Key: `deployments/${deployment.publicKey}/${path}`,
        Body: body,
        ContentType: getContentType(path),
        CacheControl: path.endsWith(".html") ? "no-cache, no-store, must-revalidate" : "max-age=31536000, immutable",
      }));
      uploaded++;
    }
    if (!uploaded) throw new Error("CodeBuild artifact did not contain deployable files");
    const current = await deployments.getDeploymentStatus(deploymentId);
    if (current.status !== DeploymentStatus.CANCELLED) {
      const liveUrl = `${(process.env.PUBLIC_SITE_URL || "").replace(/\/$/, "")}/sites/${deployment.publicKey}`;
      await deployments.updateDeploymentStatus(deploymentId, DeploymentStatus.SUCCESS, liveUrl || undefined, current.statusVersion);
    }
  }
};
