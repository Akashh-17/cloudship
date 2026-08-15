import { Deployment } from "../types/deployment";
import { DeploymentStatus } from "../constants/deploymentStatus";

export interface IDeploymentRepository {
  save(deployment: Deployment): Promise<Deployment>;
  findById(id: string): Promise<Deployment | null>;
  updateStatus(id: string, status: DeploymentStatus, liveUrl?: string): Promise<Deployment>;
  listAll(): Promise<Deployment[]>;
}
