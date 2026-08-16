import { PutCommand, GetCommand, UpdateCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { docClient } from "../aws/config";
import { env } from "../config/env";
import { Deployment } from "../types/deployment";
import { DeploymentStatus } from "../constants/deploymentStatus";
import { IDeploymentRepository } from "./deployment.repository.interface";
import { AppError } from "../utils/AppError";
import { logger } from "../logger/logger";

// Fallback in-memory store for local testing when IAM permissions are restricted
const inMemoryStore = new Map<string, Deployment>();

export class DynamoDBDeploymentRepository implements IDeploymentRepository {
  private tableName = env.DYNAMODB_TABLE_NAME;

  async save(deployment: Deployment): Promise<Deployment> {
    inMemoryStore.set(deployment.id, deployment);

    const item = {
      ...deployment,
      createdAt: deployment.createdAt.toISOString(),
      updatedAt: deployment.updatedAt.toISOString(),
    };

    try {
      await docClient.send(
        new PutCommand({
          TableName: this.tableName,
          Item: item,
        })
      );
      logger.info(`💾 [DynamoDB] Saved deployment: ${deployment.id}`);
    } catch (error: any) {
      logger.warn(
        `⚠️ [DynamoDB] Could not save to Cloud DynamoDB (${error.name || error.message}). Falling back to local memory store.`
      );
    }
    return deployment;
  }

  async findById(id: string): Promise<Deployment | null> {
    try {
      const response = await docClient.send(
        new GetCommand({
          TableName: this.tableName,
          Key: { id },
        })
      );

      if (!response.Item) {
        return inMemoryStore.get(id) || null;
      }

      const item = response.Item;
      const deployment: Deployment = {
        id: item.id,
        repoUrl: item.repoUrl,
        status: item.status as DeploymentStatus,
        liveUrl: item.liveUrl,
        createdAt: new Date(item.createdAt),
        updatedAt: new Date(item.updatedAt),
      };
      inMemoryStore.set(id, deployment);
      return deployment;
    } catch (error: any) {
      logger.warn(
        `⚠️ [DynamoDB] Fetch failed (${error.name || error.message}). Returning local memory record.`
      );
      return inMemoryStore.get(id) || null;
    }
  }

  async updateStatus(id: string, status: DeploymentStatus, liveUrl?: string): Promise<Deployment> {
    const existing = inMemoryStore.get(id);
    const updated: Deployment = {
      id,
      repoUrl: existing ? existing.repoUrl : "",
      status,
      liveUrl: liveUrl || (existing ? existing.liveUrl : undefined),
      createdAt: existing ? existing.createdAt : new Date(),
      updatedAt: new Date(),
    };
    inMemoryStore.set(id, updated);

    const updatedAt = updated.updatedAt.toISOString();

    const updateExpression = liveUrl
      ? "SET #status = :status, #updatedAt = :updatedAt, #liveUrl = :liveUrl"
      : "SET #status = :status, #updatedAt = :updatedAt";

    const expressionAttributeNames: Record<string, string> = {
      "#status": "status",
      "#updatedAt": "updatedAt",
    };
    if (liveUrl) expressionAttributeNames["#liveUrl"] = "liveUrl";

    const expressionAttributeValues: Record<string, any> = {
      ":status": status,
      ":updatedAt": updatedAt,
    };
    if (liveUrl) expressionAttributeValues[":liveUrl"] = liveUrl;

    try {
      const response = await docClient.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { id },
          UpdateExpression: updateExpression,
          ExpressionAttributeNames: expressionAttributeNames,
          ExpressionAttributeValues: expressionAttributeValues,
          ReturnValues: "ALL_NEW",
        })
      );

      if (response.Attributes) {
        const item = response.Attributes;
        logger.info(`💾 [DynamoDB] Updated deployment ${id} status ➔ ${status}${liveUrl ? ` (URL: ${liveUrl})` : ""}`);
      }
    } catch (error: any) {
      logger.warn(
        `⚠️ [DynamoDB] Status update to Cloud DynamoDB failed (${error.name || error.message}). Status updated in local memory store.`
      );
    }

    return updated;
  }

  async listAll(): Promise<Deployment[]> {
    try {
      const response = await docClient.send(
        new ScanCommand({
          TableName: this.tableName,
        })
      );

      const items = response.Items || [];
      const cloudDeployments: Deployment[] = items.map((item) => ({
        id: item.id,
        repoUrl: item.repoUrl,
        status: item.status as DeploymentStatus,
        liveUrl: item.liveUrl,
        createdAt: new Date(item.createdAt),
        updatedAt: new Date(item.updatedAt),
      }));

      // Merge cloud items into in-memory store
      for (const item of cloudDeployments) {
        inMemoryStore.set(item.id, item);
      }

      return Array.from(inMemoryStore.values()).sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
      );
    } catch (error: any) {
      logger.warn(
        `⚠️ [DynamoDB] Scan failed (${error.name || error.message}). Returning local memory deployments list.`
      );
      return Array.from(inMemoryStore.values()).sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
      );
    }
  }
}
