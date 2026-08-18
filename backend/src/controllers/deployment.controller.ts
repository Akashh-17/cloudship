import { Request, Response } from "express";
import { DeploymentService } from "../services/deployment.service";
import { success } from "../utils/apiResponse";
import { asyncHandler } from "../utils/asyncHandler";

const deploymentService = new DeploymentService();

export const listDeployments = asyncHandler(async (req: Request, res: Response) => {
  const result = await deploymentService.listDeployments();
  res.json(success(result));
});

export const createDeployment = asyncHandler(async (req: Request, res: Response) => {
  const result = await deploymentService.createDeployment(req.body);
  res.json(success(result));
});

export const getDeploymentStatus = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await deploymentService.getDeploymentStatus(id as string);
  res.json(success(result));
});
