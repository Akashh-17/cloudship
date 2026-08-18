import { sqsService, DeploymentJobPayload } from "../aws/sqs.service";
import { s3Service } from "../aws/s3.service";
import { cloudWatchService } from "../aws/cloudwatch.service";
import { buildExecutorService } from "../services/buildExecutor.service";
import { DeploymentService } from "../services/deployment.service";
import { DeploymentStatus } from "../constants/deploymentStatus";
import { logger } from "../logger/logger";
import { Message } from "@aws-sdk/client-sqs";

const deploymentService = new DeploymentService();
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function processJob(message: Message) {
  const receiptHandle = message.ReceiptHandle;
  const receiveCount = message.Attributes?.ApproximateReceiveCount || "1";
  let payload: DeploymentJobPayload;

  if (!receiptHandle || !message.Body) {
    logger.error("❌ Invalid SQS message received (missing receipt handle or body)");
    return;
  }

  try {
    payload = JSON.parse(message.Body);
  } catch (err) {
    logger.error("❌ Failed to parse SQS message body. Message will be deleted to avoid poison pill.");
    await sqsService.deleteDeploymentJob(receiptHandle);
    return;
  }

  const { deploymentId, repoUrl } = payload;
  logger.info(
    `🛠️ [Worker] Starting build for Deployment: ${deploymentId} (${repoUrl}) | Attempt: ${receiveCount}`
  );

  // Idempotency check: Fetch existing deployment from DynamoDB
  let existingDeployment;
  try {
    existingDeployment = await deploymentService.getDeploymentStatus(deploymentId);
    if (
      existingDeployment.status === DeploymentStatus.SUCCESS ||
      existingDeployment.status === DeploymentStatus.FAILED
    ) {
      logger.info(
        `⏭️ [Worker] [${deploymentId}] Already in terminal state: ${existingDeployment.status}. Deleting duplicate SQS message.`
      );
      await sqsService.deleteDeploymentJob(receiptHandle);
      return;
    }
  } catch {
    logger.info(`ℹ️ [Worker] [${deploymentId}] Record not found yet, starting fresh build processing.`);
  }

  // Start Visibility Heartbeat timer (every 25 seconds extend SQS visibility by 60 seconds)
  const heartbeatInterval = setInterval(async () => {
    logger.info(`💓 [Worker] [${deploymentId}] Heartbeat ping extending SQS visibility timeout...`);
    await sqsService.changeMessageVisibility(receiptHandle, 60);
  }, 25000);

  const startTime = Date.now();

  try {
    // Execute real build (git clone -> npm install -> npm build -> collect dist files)
    const result = await buildExecutorService.executeBuild(
      deploymentId,
      repoUrl,
      async (status) => {
        logger.info(`⚙️ [Worker] [${deploymentId}] Status ➔ ${status}`);
        await deploymentService.updateDeploymentStatus(
          deploymentId,
          status as DeploymentStatus
        );
      },
      {
        branch: payload.branch,
        frontendDir: payload.frontendDir,
        envVars: payload.envVars,
      }
    );

    // 4. UPLOADING
    logger.info(`☁️ [Worker] [${deploymentId}] Status ➔ UPLOADING artifacts to Amazon S3`);
    await deploymentService.updateDeploymentStatus(deploymentId, DeploymentStatus.UPLOADING);

    await s3Service.uploadDeploymentBundle(deploymentId, result.files);
    await s3Service.verifyDeploymentArtifacts(deploymentId);

    // 5. SUCCESS
    const liveUrl = s3Service.getPublicUrl(deploymentId, "index.html");
    logger.info(`✅ [Worker] [${deploymentId}] Status ➔ SUCCESS | Live URL: ${liveUrl}`);
    await deploymentService.updateDeploymentStatus(
      deploymentId,
      DeploymentStatus.SUCCESS,
      liveUrl
    );

    const durationMs = Date.now() - startTime;
    await cloudWatchService.recordDeploymentSuccess(durationMs);

    // Stop heartbeat timer and delete message from SQS ONLY on success
    clearInterval(heartbeatInterval);
    await sqsService.deleteDeploymentJob(receiptHandle);
  } catch (error) {
    clearInterval(heartbeatInterval);
    logger.error(error, `❌ [Worker] [${deploymentId}] Build failed on attempt ${receiveCount}!`);
    await cloudWatchService.recordDeploymentFailure();

    try {
      await deploymentService.updateDeploymentStatus(deploymentId, DeploymentStatus.FAILED);
      // Clean up message upon confirmed terminal failure so SQS DLQ redrive policies manage unhandled retries
      await sqsService.deleteDeploymentJob(receiptHandle);
    } catch (statusErr) {
      logger.error(
        statusErr,
        `⚠️ Failed to set status to FAILED for ${deploymentId}. Message left in queue for retry/DLQ.`
      );
    }
  }
}

async function startWorker() {
  logger.info("⚡ CloudShip Deployment Build Worker Started! Polling AWS SQS with Reliability Layer...");

  while (true) {
    try {
      const messages = await sqsService.receiveDeploymentJobs(1, 20);
      if (messages.length > 0) {
        for (const message of messages) {
          await processJob(message);
        }
      }
    } catch (error) {
      logger.error(error, "❌ Error polling SQS queue in worker loop");
      await delay(5000);
    }
  }
}

startWorker();
