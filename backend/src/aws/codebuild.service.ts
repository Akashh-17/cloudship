import { StartBuildCommand, StopBuildCommand, CodeBuildClient } from "@aws-sdk/client-codebuild";
import { env } from "../config/env";
import { DeploymentJobPayload } from "./sqs.service";

const client = new CodeBuildClient({ region: env.AWS_REGION });

/** Starts an isolated, public-repository CodeBuild job for one deployment. */
export class CodeBuildService {
  async startDeploymentBuild(job: DeploymentJobPayload, publicKey: string): Promise<string> {
    if (!env.CODEBUILD_PROJECT_NAME) throw new Error("CODEBUILD_PROJECT_NAME is not configured");

    const environmentVariablesOverride = [
      { name: "CLOUDSHIP_DEPLOYMENT_ID", value: job.deploymentId, type: "PLAINTEXT" as const },
      { name: "CLOUDSHIP_PUBLIC_KEY", value: publicKey, type: "PLAINTEXT" as const },
      { name: "CLOUDSHIP_FRONTEND_DIR", value: job.frontendDir || "./", type: "PLAINTEXT" as const },
      { name: "CLOUDSHIP_BRANCH", value: job.branch || "main", type: "PLAINTEXT" as const },
      ...Object.entries(job.envVars || {}).map(([name, value]) => ({ name, value, type: "PLAINTEXT" as const })),
    ];

    const response = await client.send(new StartBuildCommand({
      projectName: env.CODEBUILD_PROJECT_NAME,
      sourceTypeOverride: "GITHUB",
      sourceLocationOverride: job.repoUrl,
      sourceVersion: job.branch || "main",
      environmentVariablesOverride,
    }));
    if (!response.build?.id) throw new Error("CodeBuild did not return a build identifier");
    return response.build.id;
  }

  async stopBuild(buildId?: string): Promise<void> {
    if (buildId) await client.send(new StopBuildCommand({ id: buildId }));
  }
}

export const codeBuildService = new CodeBuildService();
