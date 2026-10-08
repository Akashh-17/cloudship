import { Router, Request, Response } from "express";
import express from "express";
import crypto from "crypto";
import { DeploymentService } from "../services/deployment.service";
import { deploymentSchema } from "../schemas/deployment.schema";
import { env } from "../config/env";
import { logger } from "../logger/logger";
import { success, failure } from "../utils/apiResponse";

const router = Router();
const deploymentService = new DeploymentService();

function verifyGitHubSignature(rawBody: Buffer, sigHeader: string, secret: string): boolean {
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(sigHeader);
  if (expectedBuf.length !== actualBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}

// Raw body is required to verify the HMAC signature — must run before express.json().
router.post(
  "/github",
  express.raw({ type: "application/json" }),
  async (req: Request, res: Response) => {
    if (!env.GITHUB_WEBHOOK_SECRET) {
      return res.status(503).json(failure("Webhook is not configured on this server"));
    }

    const signature = req.get("x-hub-signature-256");
    if (!signature || !verifyGitHubSignature(req.body, signature, env.GITHUB_WEBHOOK_SECRET)) {
      logger.warn("[Webhook] Rejected GitHub webhook — invalid or missing signature");
      return res.status(401).json(failure("Invalid signature"));
    }

    const event = req.get("x-github-event");
    if (event !== "push") {
      return res.status(200).json(success(null, `Ignored event: ${event}`));
    }

    let payload: any;
    try {
      payload = JSON.parse(req.body.toString("utf-8"));
    } catch {
      return res.status(400).json(failure("Invalid JSON payload"));
    }

    const repoUrl: string | undefined = payload?.repository?.clone_url?.replace(/\.git$/, "");
    const ref: string | undefined = payload?.ref; // e.g. "refs/heads/main"
    const branch = ref?.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : undefined;

    if (!repoUrl || !branch) {
      return res.status(400).json(failure("Payload missing repository.clone_url or ref"));
    }

    const parsed = deploymentSchema.safeParse({ repoUrl, branch });
    if (!parsed.success) {
      return res.status(400).json(failure("Repository rejected: " + parsed.error.message));
    }

    logger.info(`[Webhook] Push received for ${repoUrl} (${branch}) — looking up linked project`);

    // Push-to-redeploy binds to whichever CloudShip project most recently
    // deployed this exact repo+branch — there is no separate webhook
    // subscription table, so a repo must be deployed once through the
    // dashboard before pushes to it will trigger anything.
    const deployment = await deploymentService.redeployFromRepoPush(repoUrl, branch);
    if (!deployment) {
      logger.info(`[Webhook] No CloudShip project is linked to ${repoUrl} (${branch}) — ignoring`);
      return res.status(200).json(
        success(null, "No CloudShip project has deployed this repository/branch yet. Deploy it once via the dashboard to enable push-to-deploy.")
      );
    }

    logger.info(`[Webhook] Redeploying ${deployment.id} for ${repoUrl} (${branch})`);
    return res.status(202).json(success(deployment, "Redeployment queued"));
  }
);

export default router;
