import {
  PutObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import pLimit from "p-limit";
import { s3Client } from "./config";
import { env } from "../config/env";
import { logger } from "../logger/logger";

// Caps simultaneous PutObject requests to avoid exhausting Node's socket pool
// and spiking memory when a deployment has hundreds of files.
const UPLOAD_CONCURRENCY = 20;

const MIME_TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "application/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  svg: "image/svg+xml",
  ico: "image/x-icon",
};

export function getContentType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  return MIME_TYPES[ext] || "application/octet-stream";
}

export interface DeploymentFile {
  relativePath: string;
  content: string | Uint8Array;
  contentType?: string;
}

export class S3Service {
  private bucketName = env.S3_BUCKET_NAME;

  async uploadArtifact(
    deploymentId: string,
    filename: string,
    content: string | Uint8Array,
    contentType?: string
  ): Promise<string> {
    if (!this.bucketName) {
      throw new Error("S3_BUCKET_NAME is not configured");
    }

    const key = `deployments/${deploymentId}/${filename.replace(/^\/+/, "")}`;
    const resolvedContentType = contentType || getContentType(filename);

    try {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: content,
        ContentType: resolvedContentType,
        CacheControl: filename.endsWith(".html") ? "no-cache" : "max-age=31536000, immutable",
      });

      await s3Client.send(command);
      logger.info(
        `☁️ [S3] Uploaded: s3://${this.bucketName}/${key} [Content-Type: ${resolvedContentType}]`
      );

      return this.getPublicUrl(deploymentId, filename);
    } catch (error) {
      logger.error(error, `❌ [S3] Failed to upload artifact: ${key}`);
      throw error;
    }
  }

  getPublicUrl(deploymentId: string, filename: string = ""): string {
    // Sites are served by this server's own /sites/:id reverse proxy
    // (siteProxy.route.ts) — there is no CDN in front of it, so the live
    // URL is always this server's own public address.
    const baseUrl = process.env.PUBLIC_API_URL || "http://localhost:3000";
    const pathSuffix = filename ? `/${filename.replace(/^\/+/, "")}` : "";
    return `${baseUrl.replace(/\/+$/, "")}/sites/${deploymentId}${pathSuffix}`;
  }

  /**
   * Uploads all deployment files concurrently in parallel to minimize upload latency.
   */
  async uploadDeploymentBundle(
    deploymentId: string,
    files: DeploymentFile[]
  ): Promise<string[]> {
    logger.info(`⚡ [S3] Starting upload of ${files.length} artifacts for ${deploymentId} (max ${UPLOAD_CONCURRENCY} concurrent)...`);
    const limit = pLimit(UPLOAD_CONCURRENCY);
    const uploadPromises = files.map((file) =>
      limit(() =>
        this.uploadArtifact(
          deploymentId,
          file.relativePath,
          file.content,
          file.contentType
        )
      )
    );

    const uploadedUrls = await Promise.all(uploadPromises);
    if (uploadedUrls.length !== files.length) throw new Error("Not all deployment artifacts were uploaded");
    logger.info(`✅ [S3] Finished parallel upload of ${uploadedUrls.length}/${files.length} artifacts!`);
    return uploadedUrls;
  }

  async verifyDeploymentArtifacts(deploymentId: string): Promise<boolean> {
    if (!this.bucketName) return false;

    try {
      const command = new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: `deployments/${deploymentId}/`,
      });

      const response = await s3Client.send(command);
      const objectCount = response.Contents?.length || 0;
      logger.info(`🔍 [S3] Verified deployment ${deploymentId}: ${objectCount} files in S3 prefix`);
      if (objectCount === 0) throw new Error("Deployment artifact verification found no objects");
      return true;
    } catch (error) {
      logger.error(error, `❌ [S3] Error verifying deployment artifacts for ${deploymentId}`);
      throw error;
    }
  }

  /**
   * Deletes every object under deployments/<id>/ from S3, batching in
   * groups of 1000 (the DeleteObjects API limit).
   */
  async deleteDeploymentArtifacts(deploymentId: string): Promise<void> {
    if (!this.bucketName) return;

    const prefix = `deployments/${deploymentId}/`;
    let continuationToken: string | undefined;
    let deletedCount = 0;

    try {
      do {
        const listResponse = await s3Client.send(
          new ListObjectsV2Command({
            Bucket: this.bucketName,
            Prefix: prefix,
            ContinuationToken: continuationToken,
          })
        );

        const objects = (listResponse.Contents || [])
          .filter((obj): obj is { Key: string } => Boolean(obj.Key))
          .map((obj) => ({ Key: obj.Key }));

        for (let i = 0; i < objects.length; i += 1000) {
          const batch = objects.slice(i, i + 1000);
          if (batch.length === 0) continue;
          await s3Client.send(
            new DeleteObjectsCommand({
              Bucket: this.bucketName,
              Delete: { Objects: batch },
            })
          );
          deletedCount += batch.length;
        }

        continuationToken = listResponse.IsTruncated ? listResponse.NextContinuationToken : undefined;
      } while (continuationToken);

      logger.info(`🗑️ [S3] Deleted ${deletedCount} artifacts for deployment ${deploymentId}`);
    } catch (error) {
      logger.error(error, `❌ [S3] Failed to delete artifacts for deployment ${deploymentId}`);
      throw error;
    }
  }
}

export const s3Service = new S3Service();
