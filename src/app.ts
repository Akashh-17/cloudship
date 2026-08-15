//app.ts does not start the server or listen to port
//it justs create express app , register middleware , register routes , export the app
import express from "express";
import {logger} from "./middleware/logger";
import {notFound} from "./middleware/notFound";
import {errorHandler} from "./middleware/errorHandler";
import healthRoutes from "./routes/health.route";
import deploymentRoutes from "./routes/deployment.route";

const app = express();

app.use(logger);
app.use(express.json());
app.use("/api/v1/deployments", deploymentRoutes);
app.use("/health", healthRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
