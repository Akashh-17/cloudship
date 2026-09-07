import { PutCommand, GetCommand, UpdateCommand, QueryCommand, DeleteCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { docClient } from "../aws/config";
import { env } from "../config/env";
import { Deployment } from "../types/deployment";
import { DeploymentStatus } from "../constants/deploymentStatus";
import { IDeploymentRepository } from "./deployment.repository.interface";
import { AppError } from "../utils/AppError";
import { logger } from "../logger/logger";

export const USER_CREATED_AT_INDEX = "userId-createdAt-index";

function toDeployment(item: Record<string, any>): Deployment {
  return {
    id: item.id,
    repoUrl: item.repoUrl,
    status: item.status as DeploymentStatus,
    liveUrl: item.liveUrl,
    branch: item.branch,
    frontendDir: item.frontendDir,
    customSlug: item.customSlug,
    publicKey: item.publicKey || item.id,
    envVars: item.envVars,
    userId: item.userId,
    statusVersion: item.statusVersion || 0,
    attempt: item.attempt || 1,
    buildId: item.buildId,
    failureCategory: item.failureCategory,
    failureMessage: item.failureMessage,
    cancelledAt: item.cancelledAt ? new Date(item.cancelledAt) : undefined,
    createdAt: new Date(item.createdAt),
    updatedAt: new Date(item.updatedAt),
  };
}

export class DynamoDBDeploymentRepository implements IDeploymentRepository {
  private tableName = env.DYNAMODB_TABLE_NAME;

  async save(deployment: Deployment): Promise<Deployment> {
    const item = {
      ...deployment,
      createdAt: deployment.createdAt.toISOString(),
      updatedAt: deployment.updatedAt.toISOString(),
    };

    try {
      const transactItems: any[] = [{
        Put: {
          TableName: this.tableName,
          Item: item,
          ConditionExpression: "attribute_not_exists(id)",
        },
      }];
      if (deployment.customSlug) {
        transactItems.push({
          Put: {
            TableName: this.tableName,
            Item: { id: `slug#${deployment.customSlug}`, deploymentId: deployment.id, type: "SLUG_RESERVATION" },
            ConditionExpression: "attribute_not_exists(id)",
          },
        });
      }
      await docClient.send(new TransactWriteCommand({ TransactItems: transactItems }));
      logger.info(`💾 [DynamoDB] Saved deployment: ${deployment.id}`);
      return deployment;
    } catch (error: any) {
      logger.error(error, `❌ [DynamoDB] Failed to save deployment ${deployment.id}`);
      throw new AppError(503, "Failed to persist deployment — database unavailable");
    }
  }

  async findById(id: string): Promise<Deployment | null> {
    try {
      const response = await docClient.send(new GetCommand({ TableName: this.tableName, Key: { id } }));
      if (!response.Item) return null;
      return toDeployment(response.Item);
    } catch (error: any) {
      logger.error(error, `❌ [DynamoDB] Failed to fetch deployment ${id}`);
      throw new AppError(503, "Failed to read deployment — database unavailable");
    }
  }

  async updateStatus(id: string, status: DeploymentStatus, options: {
    liveUrl?: string;
    expectedVersion?: number;
    failureCategory?: Deployment["failureCategory"];
    failureMessage?: string;
    buildId?: string;
  } = {}): Promise<Deployment> {
    const updatedAt = new Date().toISOString();

    const sets = ["#status = :status", "#updatedAt = :updatedAt", "#statusVersion = #statusVersion + :one"];
    if (options.liveUrl) sets.push("#liveUrl = :liveUrl");
    if (options.failureCategory) sets.push("#failureCategory = :failureCategory");
    if (options.failureMessage) sets.push("#failureMessage = :failureMessage");
    if (options.buildId) sets.push("#buildId = :buildId");

    const expressionAttributeNames: Record<string, string> = {
      "#status": "status",
      "#updatedAt": "updatedAt",
      "#statusVersion": "statusVersion",
    };
    if (options.liveUrl) expressionAttributeNames["#liveUrl"] = "liveUrl";
    if (options.failureCategory) expressionAttributeNames["#failureCategory"] = "failureCategory";
    if (options.failureMessage) expressionAttributeNames["#failureMessage"] = "failureMessage";
    if (options.buildId) expressionAttributeNames["#buildId"] = "buildId";

    const expressionAttributeValues: Record<string, any> = {
      ":status": status,
      ":updatedAt": updatedAt,
      ":one": 1,
    };
    if (options.liveUrl) expressionAttributeValues[":liveUrl"] = options.liveUrl;
    if (options.failureCategory) expressionAttributeValues[":failureCategory"] = options.failureCategory;
    if (options.failureMessage) expressionAttributeValues[":failureMessage"] = options.failureMessage.slice(0, 500);
    if (options.buildId) expressionAttributeValues[":buildId"] = options.buildId;

    try {
      const response = await docClient.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { id },
          UpdateExpression: `SET ${sets.join(", ")}`,
          ExpressionAttributeNames: expressionAttributeNames,
          ExpressionAttributeValues: expressionAttributeValues,
          ...(options.expectedVersion === undefined ? {} : {
            ConditionExpression: "#statusVersion = :expectedVersion",
            ExpressionAttributeValues: { ...expressionAttributeValues, ":expectedVersion": options.expectedVersion },
          }),
          ReturnValues: "ALL_NEW",
        })
      );

      if (!response.Attributes) {
        throw new AppError(404, `Deployment ${id} not found`);
      }

      const updated = toDeployment(response.Attributes);
      logger.info(`💾 [DynamoDB] Updated deployment ${id} status ➔ ${status}${options.liveUrl ? ` (URL: ${options.liveUrl})` : ""}`);
      return updated;
    } catch (error: any) {
      if (error instanceof AppError) throw error;
      logger.error(error, `❌ [DynamoDB] Failed to update status for ${id}`);
      throw new AppError(503, "Failed to update deployment — database unavailable");
    }
  }

  async listByUser(userId: string, limit = 50): Promise<Deployment[]> {
    try {
      const response = await docClient.send(
        new QueryCommand({
          TableName: this.tableName,
          IndexName: USER_CREATED_AT_INDEX,
          KeyConditionExpression: "userId = :uid",
          ExpressionAttributeValues: { ":uid": userId },
          ScanIndexForward: false, // newest first
          Limit: limit,
        })
      );

      const items = response.Items || [];
      return items.map(toDeployment);
    } catch (error: any) {
      logger.error(error, `❌ [DynamoDB] Failed to query deployments for user ${userId}`);
      throw new AppError(503, "Failed to list deployments — database unavailable");
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await docClient.send(new DeleteCommand({ TableName: this.tableName, Key: { id } }));
      logger.info(`🗑️ [DynamoDB] Deleted deployment: ${id}`);
    } catch (error: any) {
      logger.error(error, `❌ [DynamoDB] Failed to delete deployment ${id}`);
      throw new AppError(503, "Failed to delete deployment — database unavailable");
    }
  }
}
