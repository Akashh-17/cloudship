import { z } from "zod";

export const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  AWS_REGION: z.string().default("ap-south-1"),
  SQS_QUEUE_URL: z.string().optional(),
  S3_BUCKET_NAME: z.string().optional(),
  DYNAMODB_TABLE_NAME: z.string().default("cloudship-deployments"),
  CLOUDFRONT_DOMAIN: z.string().optional(),
});

export type EnvSchema = z.infer<typeof envSchema>;
