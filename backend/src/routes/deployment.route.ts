import { Router } from "express";
import rateLimit from "express-rate-limit";
import { createDeployment, getDeploymentStatus, listDeployments, deleteDeployment, getDeploymentLogs } from "../controllers/deployment.controller";
import { validate } from "../middleware/validate";
import { requireAuth } from "../middleware/requireAuth";
import { deploymentSchema } from "../schemas/deployment.schema";
import { env } from "../config/env";

const router = Router();

const deployLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
  max: env.RATE_LIMIT_MAX_REQUESTS,
  message: { success: false, message: "Too many deployment requests. Try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

router.get("/", requireAuth, listDeployments);
router.post("/deploy", deployLimiter, requireAuth, validate(deploymentSchema), createDeployment);
router.get("/:id", requireAuth, getDeploymentStatus);
router.get("/:id/logs", requireAuth, getDeploymentLogs);
router.delete("/:id", requireAuth, deleteDeployment);

export default router;