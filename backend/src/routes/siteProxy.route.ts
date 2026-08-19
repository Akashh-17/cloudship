import { Router, Request, Response } from "express";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { s3Client } from "../aws/config";
import { env } from "../config/env";
import { getContentType } from "../aws/s3.service";
import { logger } from "../logger/logger";

const router = Router();

// File extensions that should NEVER fall back to index.html.
// If a JS/CSS/SVG asset is missing, return 404 — NOT index.html —
// because browsers enforce strict MIME types on module scripts.
const ASSET_EXTENSIONS = /\.(js|mjs|cjs|css|svg|png|jpg|jpeg|gif|ico|webp|woff2?|ttf|eot|otf|json|map|gz|br|txt|xml)$/i;

async function fetchFromS3(
  bucket: string,
  key: string
): Promise<{ body: Buffer; contentType: string } | null> {
  try {
    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    const response = await s3Client.send(command);
    if (!response.Body) return null;
    const byteArray = await response.Body.transformToByteArray();
    const contentType = response.ContentType || getContentType(key);
    return { body: Buffer.from(byteArray), contentType };
  } catch (err: any) {
    logger.debug(`[SiteProxy] S3 miss for key="${key}" reason="${err?.Code || err?.message || err}"`);
    return null;
  }
}

async function handleSiteProxy(req: Request, res: Response) {
  // ── Parse URL manually from req.path for Express 5 compatibility ─────────
  // Do NOT rely on req.params.filepath — Express 5 / path-to-regexp v8
  // wildcard params behave differently from Express 4.
  //
  // router is mounted at /sites, so req.path = "/:id" or "/:id/some/asset.js"
  // req.path examples:
  //   /dep_abc123              → serve index.html
  //   /dep_abc123/assets/a.js → serve assets/a.js
  const pathSegments = req.path.replace(/^\//, "").split("/");
  const deploymentId = pathSegments[0];
  const subpath = pathSegments.slice(1).join("/") || "index.html";

  const bucketName = env.S3_BUCKET_NAME!;
  const key = `deployments/${deploymentId}/${subpath}`;

  logger.info(`[SiteProxy] → s3://${bucketName}/${key}`);

  // ── 1. Try exact S3 key ──────────────────────────────────────────────────
  const result = await fetchFromS3(bucketName, key);
  if (result) {
    res.setHeader("Content-Type", result.contentType);
    res.setHeader(
      "Cache-Control",
      subpath === "index.html" ? "no-cache, no-store, must-revalidate" : "max-age=31536000, immutable"
    );
    return res.status(200).send(result.body);
  }

  // ── 2. SPA fallback: ONLY for route-like paths, NEVER for static assets ──
  // If .js/.css/.svg etc. is not found → 404 (prevents MIME type errors).
  // If a React Router path like /dashboard is not found → serve index.html.
  const isAsset = ASSET_EXTENSIONS.test(subpath);
  if (!isAsset && subpath !== "index.html") {
    logger.debug(`[SiteProxy] SPA fallback for route: ${subpath}`);
    const fallback = await fetchFromS3(bucketName, `deployments/${deploymentId}/index.html`);
    if (fallback) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      return res.status(200).send(fallback.body);
    }
  }

  logger.warn(`[SiteProxy] 404 Not Found: ${key}`);
  return res.status(404).send(`File not found: ${subpath}`);
}

// Express 5 compatible — we use ONE wildcard route that catches all sub-paths.
// req.path is used internally so the exact wildcard format doesn't matter.
router.get("/:id", handleSiteProxy);
router.get("/:id/*filepath", handleSiteProxy);

export default router;
