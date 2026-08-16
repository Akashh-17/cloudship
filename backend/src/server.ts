import app from "./app";
import { env } from "./config/env";
import { logger } from "./logger/logger";

app.listen(env.PORT, () => {
  logger.info(`🚀 CloudShip Backend running on port ${env.PORT}`);
});