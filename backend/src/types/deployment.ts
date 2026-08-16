import { DeploymentStatus } from "../constants/deploymentStatus";

export interface Deployment {
    id: string;
    repoUrl: string;
    status: DeploymentStatus;
    liveUrl?: string;
    createdAt: Date;
    updatedAt: Date;
}