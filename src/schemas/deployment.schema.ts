import { z } from "zod";

export const deploymentSchema = z.object({
  repoUrl: z.string().url("Must be a valid URL"),
  // Easily extendable later:
  // branch: z.string().optional(),
  // commit: z.string().optional(),
  // framework: z.string().optional(),
  // buildCommand: z.string().optional(),
});

export type DeploymentSchema = z.infer<typeof deploymentSchema>;
