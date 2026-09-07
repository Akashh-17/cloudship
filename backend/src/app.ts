import express from "express";
import cors from "cors";
import { logger } from "./middleware/logger";
import { notFound } from "./middleware/notFound";
import { errorHandler } from "./middleware/errorHandler";
import { sessionMiddleware } from "./auth/session.middleware";
import { passport } from "./auth/github.strategy";
import { env } from "./config/env";
import healthRoutes from "./routes/health.route";
import deploymentRoutes from "./routes/deployment.route";
import siteProxyRoutes from "./routes/siteProxy.route";
import authRoutes from "./routes/auth.route";
import webhookRoutes from "./routes/webhook.route";

const app = express();

if (env.TRUST_PROXY) app.set("trust proxy", 1);

const allowedOrigins = env.ALLOWED_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true, // required for session cookies
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  })
);

app.use(logger);

// Webhook route needs the raw body for HMAC signature verification, so it is
// mounted before express.json() parses the body into an object.
app.use("/api/v1/webhooks", webhookRoutes);

app.use(express.json());
app.use(sessionMiddleware);
app.use(passport.initialize());
app.use(passport.session());

app.use("/auth", authRoutes);
app.use("/api/v1/deployments", deploymentRoutes);
app.use("/health", healthRoutes);
app.use("/sites", siteProxyRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
