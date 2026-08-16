import { z } from "zod";

export const deploymentSchema = z.object({
  repoUrl: z
    .string()
    .url("Repository URL must be a valid URL")
    .refine(
      (url) => url.startsWith("https://github.com/"),
      "Only GitHub repositories are supported"
    ),
});

export type DeploymentInput = z.infer<typeof deploymentSchema>;