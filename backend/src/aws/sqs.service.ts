import {
  SendMessageCommand,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  ChangeMessageVisibilityCommand,
  GetQueueAttributesCommand,
  Message,
} from "@aws-sdk/client-sqs";
import { sqsClient } from "./config";
import { env } from "../config/env";
import { logger } from "../logger/logger";
import { AppError } from "../utils/AppError";

export interface DeploymentJobPayload {
  deploymentId: string;
  repoUrl: string;
  branch?: string;
  frontendDir?: string;
  customSlug?: string;
  envVars?: Record<string, string>;
}

export class SQSService {
  private queueUrl = env.SQS_QUEUE_URL;

  async sendDeploymentJob(payload: DeploymentJobPayload): Promise<string | undefined> {
    if (!this.queueUrl) {
      logger.warn("⚠️ SQS_QUEUE_URL is not configured in environment variables.");
      return undefined;
    }

    try {
      const command = new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify(payload),
      });

      const response = await sqsClient.send(command);
      logger.info(
        `📨 SQS Message Sent Successfully! MessageId: ${response.MessageId} for Deployment: ${payload.deploymentId}`
      );

      return response.MessageId;
    } catch (error) {
      logger.error(error, `❌ Failed to send SQS message for deployment: ${payload.deploymentId}`);
      throw new AppError(500, "Failed to enqueue deployment job");
    }
  }

  async receiveDeploymentJobs(maxMessages = 1, waitTimeSeconds = 20): Promise<Message[]> {
    if (!this.queueUrl) {
      logger.warn("⚠️ SQS_QUEUE_URL is not configured in environment variables.");
      return [];
    }

    try {
      const command = new ReceiveMessageCommand({
        QueueUrl: this.queueUrl,
        MaxNumberOfMessages: maxMessages,
        WaitTimeSeconds: waitTimeSeconds, // Long-polling to reduce empty responses
        VisibilityTimeout: 60, // Initial 60s visibility timeout
        AttributeNames: ["All"], // Retrieve system attributes like ApproximateReceiveCount
      });

      const response = await sqsClient.send(command);
      return response.Messages || [];
    } catch (error) {
      logger.error(error, "❌ Error receiving messages from SQS queue");
      return [];
    }
  }

  async changeMessageVisibility(receiptHandle: string, visibilityTimeoutSeconds: number): Promise<boolean> {
    if (!this.queueUrl) return false;

    try {
      const command = new ChangeMessageVisibilityCommand({
        QueueUrl: this.queueUrl,
        ReceiptHandle: receiptHandle,
        VisibilityTimeout: visibilityTimeoutSeconds,
      });

      await sqsClient.send(command);
      logger.info(`⏱️ [SQS] Heartbeat: Extended visibility timeout by ${visibilityTimeoutSeconds}s`);
      return true;
    } catch (error: any) {
      logger.warn(`⚠️ [SQS] Heartbeat visibility ping note: ${error.message || error}`);
      return false;
    }
  }

  async deleteDeploymentJob(receiptHandle: string): Promise<boolean> {
    if (!this.queueUrl) return false;

    try {
      const command = new DeleteMessageCommand({
        QueueUrl: this.queueUrl,
        ReceiptHandle: receiptHandle,
      });

      await sqsClient.send(command);
      logger.info("🗑️ SQS Message Deleted Successfully!");
      return true;
    } catch (error) {
      logger.error(error, "❌ Error deleting message from SQS queue");
      return false;
    }
  }

  async getQueueMetrics(): Promise<{ messagesAvailable: number; messagesInFlight: number }> {
    if (!this.queueUrl) return { messagesAvailable: 0, messagesInFlight: 0 };

    try {
      const command = new GetQueueAttributesCommand({
        QueueUrl: this.queueUrl,
        AttributeNames: [
          "ApproximateNumberOfMessages",
          "ApproximateNumberOfMessagesNotVisible",
        ],
      });

      const response = await sqsClient.send(command);
      return {
        messagesAvailable: parseInt(
          response.Attributes?.ApproximateNumberOfMessages || "0",
          10
        ),
        messagesInFlight: parseInt(
          response.Attributes?.ApproximateNumberOfMessagesNotVisible || "0",
          10
        ),
      };
    } catch (error) {
      logger.error(error, "❌ Error fetching SQS queue metrics");
      return { messagesAvailable: 0, messagesInFlight: 0 };
    }
  }
}

export const sqsService = new SQSService();
