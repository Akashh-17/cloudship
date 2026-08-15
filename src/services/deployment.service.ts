import { Deployment } from "../types/deployment";
import { DeploymentStatus } from "../constants/deploymentStatus";
import { generateDeploymentID } from "../utils/idGenerator";
import { AppError } from "../utils/AppError";
import { sqsService } from "../aws/sqs.service";
import { IDeploymentRepository } from "../repositories/deployment.repository.interface";
import { DynamoDBDeploymentRepository } from "../repositories/dynamodb.repository";

// State machine: defines which transitions are valid for each status
const VALID_TRANSITIONS: Record<DeploymentStatus, DeploymentStatus[]> = {
  [DeploymentStatus.QUEUED]:     [DeploymentStatus.CLONING,    DeploymentStatus.FAILED],
  [DeploymentStatus.CLONING]:    [DeploymentStatus.INSTALLING, DeploymentStatus.FAILED],
  [DeploymentStatus.INSTALLING]: [DeploymentStatus.BUILDING,   DeploymentStatus.FAILED],
  [DeploymentStatus.BUILDING]:   [DeploymentStatus.UPLOADING,  DeploymentStatus.FAILED],
  [DeploymentStatus.UPLOADING]:  [DeploymentStatus.SUCCESS,    DeploymentStatus.FAILED],
  [DeploymentStatus.SUCCESS]:    [],
  [DeploymentStatus.FAILED]:     [],
};

export class DeploymentService {
  constructor(
    private repository: IDeploymentRepository = new DynamoDBDeploymentRepository()
  ) {}

  async listDeployments(): Promise<Deployment[]> {
    return await this.repository.listAll();
  }

  async createDeployment(repoUrl: string): Promise<Deployment> {
    const id = generateDeploymentID();

    const newDeployment: Deployment = {
      id,
      repoUrl,
      status: DeploymentStatus.QUEUED,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Save to persistent database
    await this.repository.save(newDeployment);

    // Asynchronously publish deployment job to SQS queue
    await sqsService.sendDeploymentJob({
      deploymentId: id,
      repoUrl,
    });

    return newDeployment;
  }

  async getDeploymentStatus(id: string): Promise<Deployment> {
    const deployment = await this.repository.findById(id);

    if (!deployment) {
      throw new AppError(404, "Deployment not found");
    }

    return deployment;
  }

  async updateDeploymentStatus(
    id: string,
    newStatus: DeploymentStatus,
    liveUrl?: string
  ): Promise<Deployment> {
    const deployment = await this.repository.findById(id);

    if (!deployment) {
      throw new AppError(404, "Deployment not found");
    }

    const allowedTransitions = VALID_TRANSITIONS[deployment.status];

    if (!allowedTransitions.includes(newStatus)) {
      throw new AppError(
        400,
        `Invalid status transition: ${deployment.status} → ${newStatus}`
      );
    }

    return await this.repository.updateStatus(id, newStatus, liveUrl);
  }
}