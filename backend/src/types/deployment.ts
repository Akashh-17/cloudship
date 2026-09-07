import { DeploymentStatus } from "../constants/deploymentStatus";

export interface Deployment {
  id: string;
  repoUrl: string;
  status: DeploymentStatus;
  liveUrl?: string;
  branch?: string;
  frontendDir?: string;
  customSlug?: string;
  /** The immutable public URL segment. Uses customSlug when supplied. */
  publicKey: string;
  envVars?: Record<string, string>;
  /** Every dashboard deployment is owned by exactly one GitHub user. */
  userId: string;
  statusVersion: number;
  attempt: number;
  buildId?: string;
  failureCategory?: "BUILD" | "PLATFORM" | "VALIDATION" | "CANCELLED";
  failureMessage?: string;
  cancelledAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
