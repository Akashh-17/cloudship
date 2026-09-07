import { Deployment } from "../types/deployment";
import { DeploymentStatus } from "../constants/deploymentStatus";

export interface IDeploymentRepository {
  save(deployment: Deployment): Promise<Deployment>;
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
}
