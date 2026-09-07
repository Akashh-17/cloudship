import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { s3Client } from "../aws/config";
import { env } from "../config/env";
import { logger } from "../logger/logger";

const FLUSH_INTERVAL_MS = 2000;

function logKey(deploymentId: string): string {
  return `deployments/${deploymentId}/build.log`;
}

/**
 * Buffers real build output (npm install / npm run build stdout+stderr) in
 * memory during a build and periodically flushes the full accumulated log
 * to S3, so failed builds leave real diagnostic output behind instead of
 * hardcoded placeholder strings.
 */
export class BuildLogService {
  private lines: string[] = [];
  private flushedLineCount = 0;
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(private deploymentId: string) {}

  append(line: string): void {
    const timestamp = new Date().toISOString();
    for (const part of line.split(/\r?\n/)) {
      if (part.trim().length === 0) continue;
      this.lines.push(`[${timestamp}] ${part}`);
    }
  }

  start(): void {
    this.flushTimer = setInterval(() => {
      this.flush().catch((err) => logger.warn(`⚠️ [LogService] Flush failed for ${this.deploymentId}: ${err.message}`));
    }, FLUSH_INTERVAL_MS);
  }

  async flush(): Promise<void> {
    if (!env.S3_BUCKET_NAME) return;
    if (this.lines.length === this.flushedLineCount) return; // nothing new

    this.flushedLineCount = this.lines.length;
    const body = this.lines.join("\n") + "\n";

    await s3Client.send(
      new PutObjectCommand({
        Bucket: env.S3_BUCKET_NAME,
        Key: logKey(this.deploymentId),
        Body: body,
        ContentType: "text/plain; charset=utf-8",
        CacheControl: "no-cache, no-store, must-revalidate",
      })
    );
  }

  async stop(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
  }
}

/**
 * Reads the current build log for a deployment from S3. Used both by the
 * SSE endpoint (polled while a build is active) and to return the final
 * log once a build has reached a terminal state.
 */
export async function getBuildLogText(deploymentId: string): Promise<string> {
  if (!env.S3_BUCKET_NAME) return "";

  try {
    const response = await s3Client.send(
      new GetObjectCommand({ Bucket: env.S3_BUCKET_NAME, Key: logKey(deploymentId) })
    );
    if (!response.Body) return "";
    return await response.Body.transformToString("utf-8");
  } catch {
    return "";
  }
}
