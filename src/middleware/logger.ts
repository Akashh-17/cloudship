import pinoHttp from "pino-http";
import { logger as pinoLogger } from "../logger/logger";

export const logger = pinoHttp({
  logger: pinoLogger,
  autoLogging: true, // Automatically logs requests/responses
  customLogLevel: (req, res, err) => {
    if (res.statusCode >= 400 && res.statusCode < 500) return "warn";
    if (res.statusCode >= 500 || err) return "error";
    return "info";
  },
});