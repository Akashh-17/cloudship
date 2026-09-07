import serverless from "serverless-http";
import app from "./app";

// API Gateway HTTP API adapter. Express remains usable locally through server.ts.
export const handler = serverless(app);
