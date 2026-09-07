import { Request, Response } from "express";
import { DeploymentService } from "../services/deployment.service";
import { getBuildLogText } from "../services/log.service";
import { DeploymentStatus } from "../constants/deploymentStatus";
import { success } from "../utils/apiResponse";
import { asyncHandler } from "../utils/asyncHandler";

const deploymentService = new DeploymentService();
const TERMINAL_STATUSES: DeploymentStatus[] = [DeploymentStatus.SUCCESS, DeploymentStatus.FAILED];
const LOG_POLL_INTERVAL_MS = 1000;

export const listDeployments = asyncHandler(async (req: Request, res: Response) => {
  const result = await deploymentService.listDeployments(req.user!.id);
  res.json(success(result));
});

export const createDeployment = asyncHandler(async (req: Request, res: Response) => {
  const result = await deploymentService.createDeployment(req.body, req.user!.id);
  res.json(success(result));
});

export const getDeploymentStatus = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await deploymentService.getDeploymentForUser(id as string, req.user!.id);
  res.json(success(result));
});

export const deleteDeployment = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  await deploymentService.deleteDeployment(id as string, req.user!.id);
  res.json(success(null, "Deployment deleted"));
});

export const getDeploymentLogs = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const deployment = await deploymentService.getDeploymentForUser(id, req.user!.id);

  // Lambda-compatible log polling. `cursor` is the number of characters the
  // caller has already rendered; returning only the delta keeps active log
  // responses small and avoids holding open API Gateway connections.
  const cursor = Math.max(0, Number.parseInt(String(req.query.cursor || "0"), 10) || 0);
  if (req.query.cursor !== undefined) {
    const text = await getBuildLogText(id);
    const nextCursor = text.length;
    return res.json(success({
      lines: text.slice(cursor).split("\n").filter(Boolean),
      cursor: nextCursor,
      done: TERMINAL_STATUSES.includes(deployment.status),
      status: deployment.status,
    }));
  }

  // Terminal builds: return the full log as plain text, no streaming needed.
  if (TERMINAL_STATUSES.includes(deployment.status)) {
    const text = await getBuildLogText(id);
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    return res.status(200).send(text);
  }

  // Active build: stream new lines as Server-Sent Events, polling S3 every second.
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  let sentLength = 0;

  const tick = async () => {
    try {
      const text = await getBuildLogText(id);
      if (text.length > sentLength) {
        const chunk = text.slice(sentLength);
        sentLength = text.length;
        for (const line of chunk.split("\n")) {
          if (line.length === 0) continue;
          res.write(`data: ${line}\n\n`);
        }
      }

      const current = await deploymentService.getDeploymentStatus(id);
      if (TERMINAL_STATUSES.includes(current.status)) {
        res.write(`event: done\ndata: ${current.status}\n\n`);
        clearInterval(interval);
        res.end();
      }
    } catch {
      // Ignore transient S3/DynamoDB read errors — retried on next tick.
    }
  };

  const interval = setInterval(tick, LOG_POLL_INTERVAL_MS);
  tick();

  req.on("close", () => clearInterval(interval));
});
