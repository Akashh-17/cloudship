import { Router, Request, Response } from "express";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { s3Client } from "../aws/config";
import { env } from "../config/env";
import { getContentType } from "../aws/s3.service";
import { logger } from "../logger/logger";

const router = Router();

async function handleSiteProxy(req: Request, res: Response) {
  const deploymentId = req.params.id;
  const rawSubpath = (req.params as any).filepath || (req.params as any)[0] || "";
  let subpath = String(rawSubpath).replace(/^\/+/, "");

  if (!subpath || subpath === "") {
    subpath = "index.html";
  }

  const bucketName = env.S3_BUCKET_NAME;
  const key = `deployments/${deploymentId}/${subpath}`;

  try {
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    });

    const response = await s3Client.send(command);

    const contentType = response.ContentType || getContentType(subpath);
    res.setHeader("Content-Type", contentType);

    if (response.Body) {
      const byteArray = await response.Body.transformToByteArray();
      return res.status(200).send(Buffer.from(byteArray));
    }

    return res.status(404).send("Artifact empty");
  } catch (error: any) {
    // Single Page Application (SPA) fallback: If subpath fails, return index.html
    if (subpath !== "index.html") {
      try {
        const fallbackCommand = new GetObjectCommand({
          Bucket: bucketName,
          Key: `deployments/${deploymentId}/index.html`,
        });
        const fallbackRes = await s3Client.send(fallbackCommand);
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        if (fallbackRes.Body) {
          const byteArray = await fallbackRes.Body.transformToByteArray();
          return res.status(200).send(Buffer.from(byteArray));
        }
      } catch {
        // Continue to 404
      }
    }

    logger.warn(`⚠️ [SiteProxy] Artifact not found for key: ${key}`);
    return res.status(404).send("Deployment or file not found");
  }
}

// Express 5 compatible route parameters
router.get("/:id", handleSiteProxy);
router.get("/:id/*filepath", handleSiteProxy);

export default router;
