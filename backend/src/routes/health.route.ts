import { Router, Request, Response } from "express";
import { ListTablesCommand } from "@aws-sdk/client-dynamodb";
import { sqsService } from "../aws/sqs.service";
import { dynamoClient } from "../aws/config";

const router = Router();

// Basic health check
router.get("/", (req: Request, res: Response) => {
  res.status(200).json({
    status: "OK",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    service: "CloudShip Platform API",
  });
});

// Detailed system health check & queue metrics
router.get("/detailed", async (req: Request, res: Response) => {
  const memoryUsage = process.memoryUsage();
  
  let dbStatus = "HEALTHY";
  try {
    await dynamoClient.send(new ListTablesCommand({}));
  } catch {
    dbStatus = "UNHEALTHY";
  }

  let queueMetrics = { messagesAvailable: 0, messagesInFlight: 0 };
  try {
    queueMetrics = await sqsService.getQueueMetrics();
  } catch {
    // Queue metrics fallback
  }

  res.status(200).json({
    status: dbStatus === "HEALTHY" ? "HEALTHY" : "DEGRADED",
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    memory: {
      rssMb: (memoryUsage.rss / 1024 / 1024).toFixed(2),
      heapTotalMb: (memoryUsage.heapTotal / 1024 / 1024).toFixed(2),
      heapUsedMb: (memoryUsage.heapUsed / 1024 / 1024).toFixed(2),
    },
    services: {
      dynamoDb: dbStatus,
      sqsQueue: queueMetrics,
    },
  });
});

export default router;
