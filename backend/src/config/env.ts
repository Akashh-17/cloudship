import dotenv from "dotenv";
import { envSchema } from "./env.schema";

dotenv.config();

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error("❌ Invalid environment variables:", parsedEnv.error.format());
  process.exit(1);
}

export const env = parsedEnv.data;

const INSECURE_DEFAULT_SESSION_SECRET = "dev_insecure_session_secret_change_me";
if (env.NODE_ENV === "production" && env.SESSION_SECRET === INSECURE_DEFAULT_SESSION_SECRET) {
  console.error("❌ Refusing to start in production with the default SESSION_SECRET. Set a real secret in the environment.");
  process.exit(1);
}