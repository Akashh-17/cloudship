export class DeploymentService {
  createDeployment(repoUrl: string) {
    return {
      deploymentId: "temp-id",
      repoUrl,
      status: "QUEUED",
    };
  }
}