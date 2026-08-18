import { z } from "zod";

export const deploymentSchema = z.object({
  repoUrl: z
    .string()
    .url("Repository URL must be a valid URL")
    .refine(
      (url) => url.startsWith("https://github.com/"),
      "Only GitHub repositories are supported"
    ),
  branch: z.string().optional().default("main"),
  frontendDir: z.string().optional().default("./"),
  customSlug: z.string().optional(),
  envVars: z.record(z.string(), z.string()).optional(),
});

export type DeploymentInput = z.infer<typeof deploymentSchema>;