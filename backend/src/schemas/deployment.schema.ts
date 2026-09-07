import { z } from "zod";

const githubRepo = z
  .string()
  .url("Repository URL must be a valid URL")
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && url.hostname === "github.com" &&
        !url.username && !url.password && /^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?$/.test(url.pathname);
    } catch {
      return false;
    }
  }, "Use an HTTPS public repository URL in the form https://github.com/owner/repository");

const safeDirectory = z.string().trim().max(160).refine(
  (value) => value === "." || value === "./" ||
    (!value.includes("\\") && !value.split("/").includes("..") && !value.startsWith("/")),
  "Frontend directory must be a relative path inside the repository"
);

const safeEnvName = /^[A-Za-z_][A-Za-z0-9_]*$/;
const reservedEnvNames = new Set([
  "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN", "AWS_REGION",
  "PATH", "HOME", "USER", "COMSPEC", "SYSTEMROOT", "NODE_OPTIONS",
]);

export const deploymentSchema = z.object({
  repoUrl: githubRepo,
  branch: z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9._/-]+$/, "Branch contains unsupported characters").optional().default("main"),
  frontendDir: safeDirectory.optional().default("./"),
  customSlug: z.string().trim().toLowerCase().min(3).max(48).regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, "Slug may contain lowercase letters, digits, and hyphens").optional(),
  envVars: z.record(z.string(), z.string().max(4_000)).refine(
    (values) => Object.keys(values).length <= 30 && Object.entries(values).every(([key]) => safeEnvName.test(key) && !reservedEnvNames.has(key)),
    "Environment variables must use safe names, may not override platform variables, and are limited to 30 entries"
  ).optional(),
}).strict();

export type DeploymentInput = z.infer<typeof deploymentSchema>;
