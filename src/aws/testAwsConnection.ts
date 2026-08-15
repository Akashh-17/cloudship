import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";
import { awsConfig } from "./config";
import { logger } from "../logger/logger";

async function testConnection() {
  const stsClient = new STSClient(awsConfig);

  try {
    const command = new GetCallerIdentityCommand({});
    const response = await stsClient.send(command);

    console.log("\n============================================");
    console.log("🚀 AWS Authentication Verification Successful!");
    console.log("============================================");
    console.log(`Account ID : ${response.Account}`);
    console.log(`User ARN   : ${response.Arn}`);
    console.log(`User ID    : ${response.UserId}`);
    console.log("============================================\n");
  } catch (error) {
    logger.error(error, "❌ AWS Authentication Failed. Check your CLI configuration or credentials.");
    process.exit(1);
  }
}

testConnection();
