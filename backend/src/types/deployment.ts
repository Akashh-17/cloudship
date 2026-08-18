import { DeploymentStatus } from "../constants/deploymentStatus";

export interface Deployment {
  id: string;
  repoUrl: string;
  status: DeploymentStatus;
  liveUrl?: string;
  branch?: string;
  frontendDir?: string;
  customSlug?: string;
  envVars?: Record<string, string>;
  createdAt: Date;
  updatedAt: Date;
}