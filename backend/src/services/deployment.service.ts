import { Deployment } from "../types/deployment";
import { DeploymentStatus } from "../constants/deploymentStatus";
import { generateDeploymentID } from "../utils/idGenerator";
import { AppError } from "../utils/AppError";
import { sqsService } from "../aws/sqs.service";
import { s3Service } from "../aws/s3.service";
import { IDeploymentRepository } from "../repositories/deployment.repository.interface";
import { DynamoDBDeploymentRepository } from "../repositories/dynamodb.repository";
import { DeploymentInput } from "../schemas/deployment.schema";

// State machine: defines which transitions are valid for each status.
// CLONING can go straight to UPLOADING because buildExecutorService skips
// INSTALLING/BUILDING entirely for a repo with no package.json (static
// HTML sites) — see BuildExecutorService.executeBuild's static-site branch.
const VALID_TRANSITIONS: Record<DeploymentStatus, DeploymentStatus[]> = {
  [DeploymentStatus.QUEUED]:     [DeploymentStatus.CLONING,    DeploymentStatus.FAILED],
  [DeploymentStatus.CLONING]:    [DeploymentStatus.INSTALLING, DeploymentStatus.UPLOADING, DeploymentStatus.FAILED],
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

  async createDeployment(
    input: DeploymentInput,
    userId: string,
    options: { overwriteSlug?: boolean } = {}
  ): Promise<Deployment> {
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
    await this.repository.save(newDeployment, options);

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

  /**
   * Binds an incoming GitHub push webhook to an existing CloudShip project by
   * finding the most recent deployment for the same repo+branch and
   * redeploying it under its original owner and settings (slug, env vars,
   * frontend dir). Returns null when the repo has never been deployed
   * through CloudShip, so the webhook has nothing to bind to yet.
   */
  async redeployFromRepoPush(repoUrl: string, branch: string): Promise<Deployment | null> {
    const previous = await this.repository.findLatestByRepo(repoUrl, branch);
    if (!previous) return null;

    return this.createDeployment(
      {
        repoUrl,
        branch,
        frontendDir: previous.frontendDir || "./",
        customSlug: previous.customSlug,
        envVars: previous.envVars,
      },
      previous.userId,
      { overwriteSlug: Boolean(previous.customSlug) }
    );
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

    // A no-op: some build paths (e.g. the static-site branch in
    // BuildExecutorService, which sets UPLOADING itself) and the worker's
    // own subsequent call can legitimately report the same status twice.
    // Treat that as idempotent rather than an invalid transition.
    if (newStatus === deployment.status) {
      if (!liveUrl) return deployment;
      return await this.repository.updateStatus(id, newStatus, { liveUrl, expectedVersion: expectedVersion ?? deployment.statusVersion });
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

  /**
   * Resets a deployment back to QUEUED, bypassing the normal transition
   * table. Used only when the worker picks up a redelivered SQS message
   * (ApproximateReceiveCount > 1) for a deployment that got stuck mid-build
   * on a previous, interrupted attempt (worker crash/restart, expired
   * visibility timeout, etc.) — the retried build always restarts from
   * CLONING, so the status record must go back to QUEUED first or that
   * first onStatusChange("CLONING") call fails as an invalid transition.
   */
  async restartForRetry(id: string): Promise<Deployment> {
    const deployment = await this.getDeploymentStatus(id);
    if (deployment.status === DeploymentStatus.QUEUED) return deployment;
    return await this.repository.updateStatus(id, DeploymentStatus.QUEUED, {
      expectedVersion: deployment.statusVersion,
    });
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
