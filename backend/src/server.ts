import { ListTablesCommand } from "@aws-sdk/client-dynamodb";
import app from "./app";
import { env } from "./config/env";
import { logger } from "./logger/logger";
import { dynamoClient } from "./aws/config";

async function start() {
  try {
    await dynamoClient.send(new ListTablesCommand({}));
    logger.info("✅ DynamoDB connected");
  } catch (err) {
    logger.error(err, "❌ DynamoDB unreachable — check credentials. Exiting.");
    process.exit(1);
  }

  app.listen(env.PORT, () => {
    logger.info(`🚀 CloudShip Backend running on port ${env.PORT}`);
  });
}

start();