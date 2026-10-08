import { z } from "zod";

export const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  AWS_REGION: z.string().default("ap-south-1"),
  SQS_QUEUE_URL: z.string().optional(),
  S3_BUCKET_NAME: z.string().optional(),
  DYNAMODB_TABLE_NAME: z.string().default("cloudship-deployments"),
  USERS_TABLE_NAME: z.string().default("cloudship-users"),
  SESSION_TABLE_NAME: z.string().default("cloudship-sessions"),

  // ── Security & CORS ──────────────────────────────────────────────────────
  ALLOWED_ORIGINS: z.string().default("http://localhost:5173"),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(10),
  RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().default(15),

  // ── Worker ────────────────────────────────────────────────────────────────
  WORKER_CONCURRENCY: z.coerce.number().default(3),

  // ── GitHub OAuth ──────────────────────────────────────────────────────────
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  // Empty string (e.g. an unset var left blank in .env) must fall through to
  // the default too — z.default() only replaces `undefined`, not "".
  SESSION_SECRET: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().default("dev_insecure_session_secret_change_me")
  ),
  FRONTEND_URL: z.string().default("http://localhost:5173"),
  GITHUB_CALLBACK_URL: z.string().url().optional(),
  PUBLIC_API_URL: z.string().url().optional(),
  TRUST_PROXY: z.coerce.boolean().default(false),

  // ── Push-to-Deploy Webhook ───────────────────────────────────────────────
  GITHUB_WEBHOOK_SECRET: z.string().optional(),
});

export type EnvSchema = z.infer<typeof envSchema>;
