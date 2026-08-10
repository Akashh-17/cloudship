import { Router } from "express";
import { createDeployment } from "../controllers/deployment.controller";
import { validate } from "../middleware/validate";
import { deploymentSchema } from "../schemas/deployment.schema";

const router = Router();

router.post("/deploy", validate(deploymentSchema), createDeployment);

export default router;