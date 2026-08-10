import { Request, Response } from "express";
import { DeploymentService } from "../services/deployment.service";
import { success } from "../utils/apiResponse";

const deploymentService = new DeploymentService();

export const createDeployment = (
  req: Request,
  res: Response
) => {

  const result = deploymentService.createDeployment(
    req.body.repoUrl
  );

  res.json(success(result));

};
