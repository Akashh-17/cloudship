import type { EventBridgeHandler } from "aws-lambda";
import { DeploymentService } from "../services/deployment.service";
import { DeploymentStatus } from "../constants/deploymentStatus";

type CodeBuildEvent = {
  detail: {
    "build-status": string;
    "additional-information"?: { environment?: { "environment-variables"?: Array<{ name: string; value: string }> } };
  };
};

const deployments = new DeploymentService();

export const handler: EventBridgeHandler<"CodeBuild Build State Change", CodeBuildEvent, void> = async (event) => {
  const variables = event.detail["additional-information"]?.environment?.["environment-variables"] || [];
  const deploymentId = variables.find((variable) => variable.name === "CLOUDSHIP_DEPLOYMENT_ID")?.value;
  if (!deploymentId) return;

  const deployment = await deployments.getDeploymentStatus(deploymentId);
  if ([DeploymentStatus.CANCELLED, DeploymentStatus.SUCCESS, DeploymentStatus.FAILED].includes(deployment.status)) return;
  const status = event.detail["build-status"];
  if (status === "IN_PROGRESS") {
    const installing = await deployments.updateDeploymentStatus(deploymentId, DeploymentStatus.INSTALLING, undefined, deployment.statusVersion);
    await deployments.updateDeploymentStatus(deploymentId, DeploymentStatus.BUILDING, undefined, installing.statusVersion);
  } else if (status === "SUCCEEDED") {
    // Artifact publication is triggered separately by the private artifact bucket.
    await deployments.updateDeploymentStatus(deploymentId, DeploymentStatus.UPLOADING, undefined, deployment.statusVersion);
  } else if (["FAILED", "FAULT", "STOPPED", "TIMED_OUT"].includes(status)) {
    await deployments.updateDeploymentStatus(deploymentId, DeploymentStatus.FAILED, undefined, deployment.statusVersion);
  }
};
