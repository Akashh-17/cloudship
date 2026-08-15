import { PutCommand, GetCommand, UpdateCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { docClient } from "../aws/config";
import { env } from "../config/env";
import { Deployment } from "../types/deployment";
import { DeploymentStatus } from "../constants/deploymentStatus";
import { IDeploymentRepository } from "./deployment.repository.interface";
import { AppError } from "../utils/AppError";
import { logger } from "../logger/logger";

export class DynamoDBDeploymentRepository implements IDeploymentRepository {
  private tableName = env.DYNAMODB_TABLE_NAME;

  async save(deployment: Deployment): Promise<Deployment> {
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
      return deployment;
    } catch (error) {
      logger.error(error, `❌ [DynamoDB] Failed to save deployment: ${deployment.id}`);
      throw new AppError(500, "Database error saving deployment");
    }
  }

  async findById(id: string): Promise<Deployment | null> {
    try {
      const response = await docClient.send(
        new GetCommand({
          TableName: this.tableName,
          Key: { id },
        })
      );

      if (!response.Item) return null;

      const item = response.Item;
      return {
        id: item.id,
        repoUrl: item.repoUrl,
        status: item.status as DeploymentStatus,
        liveUrl: item.liveUrl,
        createdAt: new Date(item.createdAt),
        updatedAt: new Date(item.updatedAt),
      };
    } catch (error) {
      logger.error(error, `❌ [DynamoDB] Failed to fetch deployment: ${id}`);
      throw new AppError(500, "Database error fetching deployment");
    }
  }

  async updateStatus(id: string, status: DeploymentStatus, liveUrl?: string): Promise<Deployment> {
    const updatedAt = new Date().toISOString();

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

      if (!response.Attributes) {
        throw new AppError(404, "Deployment not found");
      }

      const item = response.Attributes;
      logger.info(`💾 [DynamoDB] Updated deployment ${id} status ➔ ${status}${liveUrl ? ` (URL: ${liveUrl})` : ""}`);
      return {
        id: item.id,
        repoUrl: item.repoUrl,
        status: item.status as DeploymentStatus,
        liveUrl: item.liveUrl,
        createdAt: new Date(item.createdAt),
        updatedAt: new Date(item.updatedAt),
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error(error, `❌ [DynamoDB] Failed to update deployment status: ${id}`);
      throw new AppError(500, "Database error updating deployment status");
    }
  }

  async listAll(): Promise<Deployment[]> {
    try {
      const response = await docClient.send(
        new ScanCommand({
          TableName: this.tableName,
        })
      );

      const items = response.Items || [];
      const deployments: Deployment[] = items.map((item) => ({
        id: item.id,
        repoUrl: item.repoUrl,
        status: item.status as DeploymentStatus,
        liveUrl: item.liveUrl,
        createdAt: new Date(item.createdAt),
        updatedAt: new Date(item.updatedAt),
      }));

      // Sort by createdAt descending (newest first)
      return deployments.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    } catch (error) {
      logger.error(error, "❌ [DynamoDB] Failed to list all deployments");
      throw new AppError(500, "Database error listing deployments");
    }
  }
}
