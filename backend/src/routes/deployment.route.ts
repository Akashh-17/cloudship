import { Router } from "express";
import { createDeployment, getDeploymentStatus, listDeployments } from "../controllers/deployment.controller";
import { validate } from "../middleware/validate";
import { deploymentSchema } from "../schemas/deployment.schema";

const router = Router();

router.get("/", listDeployments);
router.post("/deploy", validate(deploymentSchema), createDeployment);
router.get("/:id", getDeploymentStatus);

export default router;