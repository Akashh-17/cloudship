import { Deployment } from "../types/deployment";
import { DeploymentStatus } from "../constants/deploymentStatus";
import { generateDeploymentID } from "../utils/idGenerator";
import { AppError } from "../utils/AppError";
import { sqsService } from "../aws/sqs.service";
import { s3Service } from "../aws/s3.service";
import { IDeploymentRepository } from "../repositories/deployment.repository.interface";
import { DynamoDBDeploymentRepository } from "../repositories/dynamodb.repository";
import { DeploymentInput } from "../schemas/deployment.schema";

// State machine: defines which transitions are valid for each status
const VALID_TRANSITIONS: Record<DeploymentStatus, DeploymentStatus[]> = {
  [DeploymentStatus.QUEUED]:     [DeploymentStatus.CLONING,    DeploymentStatus.FAILED],
  [DeploymentStatus.CLONING]:    [DeploymentStatus.INSTALLING, DeploymentStatus.FAILED],
  [DeploymentStatus.INSTALLING]: [DeploymentStatus.BUILDING,   DeploymentStatus.FAILED],
  [DeploymentStatus.BUILDING]:   [DeploymentStatus.UPLOADING,  DeploymentStatus.FAILED],
  [DeploymentStatus.UPLOADING]:  [DeploymentStatus.SUCCESS,    DeploymentStatus.FAILED],
  [DeploymentStatus.SUCCESS]:    [],
  [DeploymentStatus.FAILED]:     [],
  [DeploymentStatus.CANCELLED]:  [],
};

export class DeploymentService {
  constructor(
    private repository: IDeploymentRepository = new DynamoDBDeploymentRepository()
  ) {}

  async listDeployments(userId: string): Promise<Deployment[]> {
    return await this.repository.listByUser(userId);
  }

  async createDeployment(input: DeploymentInput, userId: string): Promise<Deployment> {
    const id = generateDeploymentID();

    const newDeployment: Deployment = {
      id,
      repoUrl: input.repoUrl,
      branch: input.branch,
      frontendDir: input.frontendDir,
      customSlug: input.customSlug,
      publicKey: input.customSlug || id,
      envVars: input.envVars,
      userId,
      status: DeploymentStatus.QUEUED,
      statusVersion: 0,
      attempt: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Save to persistent database
    await this.repository.save(newDeployment);

    // Asynchronously publish deployment job to SQS queue
    try {
      await sqsService.sendDeploymentJob({ deploymentId: id, repoUrl: input.repoUrl, branch: input.branch, frontendDir: input.frontendDir, customSlug: input.customSlug, envVars: input.envVars });
    } catch (error) {
      await this.repository.updateStatus(id, DeploymentStatus.FAILED, {
        expectedVersion: 0,
        failureCategory: "PLATFORM",
        failureMessage: "The deployment could not be queued. Please try again.",
      }).catch(() => undefined);
      throw error;
    }

    return newDeployment;
  }

  async getDeploymentStatus(id: string): Promise<Deployment> {
    const deployment = await this.repository.findById(id);

    if (!deployment) {
      throw new AppError(404, "Deployment not found");
    }

    return deployment;
  }

  async getDeploymentForUser(id: string, userId: string): Promise<Deployment> {
    const deployment = await this.getDeploymentStatus(id);
    // Return 404 rather than 403 so deployment identifiers cannot be enumerated.
    if (deployment.userId !== userId) throw new AppError(404, "Deployment not found");
    return deployment;
  }

  async updateDeploymentStatus(
    id: string,
    newStatus: DeploymentStatus,
    liveUrl?: string,
    expectedVersion?: number
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

    return await this.repository.updateStatus(id, newStatus, { liveUrl, expectedVersion: expectedVersion ?? deployment.statusVersion });
  }

  async deleteDeployment(id: string, userId: string): Promise<void> {
    const deployment = await this.getDeploymentForUser(id, userId);

    if (![DeploymentStatus.SUCCESS, DeploymentStatus.FAILED, DeploymentStatus.CANCELLED].includes(deployment.status)) {
      await this.repository.updateStatus(id, DeploymentStatus.CANCELLED, {
        expectedVersion: deployment.statusVersion,
        failureCategory: "CANCELLED",
        failureMessage: "Deployment cancelled by its owner",
      }).catch(() => undefined);
    }

    await s3Service.deleteDeploymentArtifacts(id);
    await this.repository.delete(id);
  }
}
