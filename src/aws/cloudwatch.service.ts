import { PutMetricDataCommand, StandardUnit } from "@aws-sdk/client-cloudwatch";
import { cloudWatchClient } from "./config";
import { env } from "../config/env";
import { logger } from "../logger/logger";

export class CloudWatchService {
  private namespace = "CloudShip/Deployments";

  async recordMetric(
    metricName: string,
    value: number,
    unit: StandardUnit = StandardUnit.Count
  ): Promise<void> {
    try {
      const command = new PutMetricDataCommand({
        Namespace: this.namespace,
        MetricData: [
          {
            MetricName: metricName,
            Value: value,
            Unit: unit,
            Timestamp: new Date(),
            Dimensions: [
              { Name: "Environment", Value: env.NODE_ENV },
              { Name: "Region", Value: env.AWS_REGION },
            ],
          },
        ],
      });

      await cloudWatchClient.send(command);
      logger.info(`📊 [CloudWatch] Recorded metric: ${metricName} = ${value} (${unit})`);
    } catch (error) {
      logger.error(error, `❌ [CloudWatch] Failed to record metric: ${metricName}`);
    }
  }

  async recordDeploymentSuccess(durationMs: number): Promise<void> {
    await this.recordMetric("DeploymentSuccess", 1, StandardUnit.Count);
    await this.recordMetric("DeploymentDuration", durationMs, StandardUnit.Milliseconds);
  }

  async recordDeploymentFailure(): Promise<void> {
    await this.recordMetric("DeploymentFailure", 1, StandardUnit.Count);
  }
}

export const cloudWatchService = new CloudWatchService();
