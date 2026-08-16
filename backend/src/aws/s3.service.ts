import {
  PutObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { s3Client } from "./config";
import { env } from "../config/env";
import { logger } from "../logger/logger";

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
  content: string | Buffer;
  contentType?: string;
}

export class S3Service {
  private bucketName = env.S3_BUCKET_NAME;

  async uploadArtifact(
    deploymentId: string,
    filename: string,
    content: string | Buffer,
    contentType?: string
  ): Promise<string | undefined> {
    if (!this.bucketName) {
      logger.warn("⚠️ S3_BUCKET_NAME is not configured in environment variables.");
      return undefined;
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
      return undefined;
    }
  }

  getPublicUrl(deploymentId: string, filename: string = ""): string {
    if (env.CLOUDFRONT_DOMAIN) {
      const key = `deployments/${deploymentId}/${filename.replace(/^\/+/, "")}`;
      return `https://${env.CLOUDFRONT_DOMAIN}/${key}`;
    }
    const baseUrl = process.env.PUBLIC_API_URL || "http://localhost:3000";
    return `${baseUrl.replace(/\/+$/, "")}/sites/${deploymentId}`;
  }

  async uploadDeploymentBundle(
    deploymentId: string,
    files: DeploymentFile[]
  ): Promise<string[]> {
    const uploadedUrls: string[] = [];

    for (const file of files) {
      const url = await this.uploadArtifact(
        deploymentId,
        file.relativePath,
        file.content,
        file.contentType
      );
      if (url) uploadedUrls.push(url);
    }

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
      return objectCount > 0;
    } catch (error) {
      logger.error(error, `❌ [S3] Error verifying deployment artifacts for ${deploymentId}`);
      return false;
    }
  }
}

export const s3Service = new S3Service();
