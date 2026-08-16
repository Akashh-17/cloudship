import express from "express";
import { logger } from "./middleware/logger";
import { notFound } from "./middleware/notFound";
import { errorHandler } from "./middleware/errorHandler";
import healthRoutes from "./routes/health.route";
import deploymentRoutes from "./routes/deployment.route";
import siteProxyRoutes from "./routes/siteProxy.route";

const app = express();

// CORS Middleware to allow requests from any origin (e.g. localhost:5173, localhost:5174, etc.)
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, HEAD");
  res.setHeader("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  next();
});

app.use(logger);
app.use(express.json());
app.use("/api/v1/deployments", deploymentRoutes);
app.use("/health", healthRoutes);
app.use("/sites", siteProxyRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
