import type { SQSHandler } from "aws-lambda";
import { codeBuildService } from "../aws/codebuild.service";
import { DeploymentService } from "../services/deployment.service";
import { DeploymentStatus } from "../constants/deploymentStatus";
import type { DeploymentJobPayload } from "../aws/sqs.service";

const deployments = new DeploymentService();

/** SQS is deliberately the only component permitted to start a CodeBuild job. */
export const handler: SQSHandler = async (event) => {
  for (const record of event.Records) {
    const job = JSON.parse(record.body) as DeploymentJobPayload;
    const deployment = await deployments.getDeploymentStatus(job.deploymentId);
    if ([DeploymentStatus.SUCCESS, DeploymentStatus.FAILED, DeploymentStatus.CANCELLED].includes(deployment.status)) continue;

    try {
      const buildId = await codeBuildService.startDeploymentBuild(job, deployment.publicKey);
      await deployments.updateDeploymentStatus(job.deploymentId, DeploymentStatus.CLONING, undefined, deployment.statusVersion);
      // Build id is retained by CodeBuild event metadata; the status write makes
      // duplicate SQS deliveries fail their conditional transition safely.
      void buildId;
    } catch (error) {
      await deployments.updateDeploymentStatus(job.deploymentId, DeploymentStatus.FAILED, undefined, deployment.statusVersion)
        .catch(() => undefined);
      throw error; // Lambda/SQS performs the single configured retry and DLQ routing.
    }
  }
};
