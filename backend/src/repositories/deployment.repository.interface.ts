import { Deployment } from "../types/deployment";
import { DeploymentStatus } from "../constants/deploymentStatus";

export interface IDeploymentRepository {
  /** `overwriteSlug` re-points an existing custom-slug reservation at this deployment instead of requiring it be unclaimed — used for push-triggered redeploys of a project that already owns the slug. */
  save(deployment: Deployment, options?: { overwriteSlug?: boolean }): Promise<Deployment>;
  findById(id: string): Promise<Deployment | null>;
  updateStatus(id: string, status: DeploymentStatus, options?: {
    liveUrl?: string;
    expectedVersion?: number;
    failureCategory?: Deployment["failureCategory"];
    failureMessage?: string;
    buildId?: string;
  }): Promise<Deployment>;
  listByUser(userId: string, limit?: number): Promise<Deployment[]>;
  delete(id: string): Promise<void>;
  /** Finds the most recently created deployment for a repo+branch, used to bind an incoming push webhook to an existing project. */
  findLatestByRepo(repoUrl: string, branch: string): Promise<Deployment | null>;
}
