import { SQSClient } from "@aws-sdk/client-sqs";
import { S3Client } from "@aws-sdk/client-s3";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { CloudWatchClient } from "@aws-sdk/client-cloudwatch";
import { env } from "../config/env";

export const AWS_REGION = env.AWS_REGION;

// Shared AWS SDK configuration
// Relies on the default AWS credential provider chain (~/.aws/credentials or env vars)
export const awsConfig = {
  region: AWS_REGION,
};

// Reusable AWS Clients
export const sqsClient = new SQSClient(awsConfig);
export const s3Client = new S3Client(awsConfig);
export const dynamoClient = new DynamoDBClient(awsConfig);
export const cloudWatchClient = new CloudWatchClient(awsConfig);

// DocumentClient provides higher-level abstraction for JS objects
export const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: {
    removeUndefinedValues: true,
    convertClassInstanceToMap: true,
  },
});
