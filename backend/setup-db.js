require("dotenv").config();
const {
  DynamoDBClient,
  CreateTableCommand,
  UpdateTableCommand,
  DescribeTableCommand,
} = require("@aws-sdk/client-dynamodb");

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || "ap-south-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

async function run() {
  console.log("🚀 Provisioning DynamoDB tables and indexes...\n");

  // 1. cloudship-users
  try {
    process.stdout.write("1/3 Creating table 'cloudship-users'... ");
    await client.send(
      new CreateTableCommand({
        TableName: "cloudship-users",
        KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
        AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
        BillingMode: "PAY_PER_REQUEST",
      })
    );
    console.log("✅ Created!");
  } catch (err) {
    if (err.name === "ResourceInUseException") {
      console.log("ℹ️ Already exists.");
    } else {
      console.log("❌ Error:", err.message);
    }
  }

  // 2. cloudship-sessions
  try {
    process.stdout.write("2/3 Creating table 'cloudship-sessions'... ");
    await client.send(
      new CreateTableCommand({
        TableName: "cloudship-sessions",
        KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
        AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
        BillingMode: "PAY_PER_REQUEST",
      })
    );
    console.log("✅ Created!");
  } catch (err) {
    if (err.name === "ResourceInUseException") {
      console.log("ℹ️ Already exists.");
    } else {
      console.log("❌ Error:", err.message);
    }
  }

  // 3. userId-createdAt-index on cloudship-deployments
  try {
    process.stdout.write("3/3 Adding index 'userId-createdAt-index' to 'cloudship-deployments'... ");
    const desc = await client.send(
      new DescribeTableCommand({ TableName: "cloudship-deployments" })
    );
    const hasIndex = desc.Table?.GlobalSecondaryIndexes?.some(
      (gsi) => gsi.IndexName === "userId-createdAt-index"
    );

    if (hasIndex) {
      console.log("ℹ️ Already exists.");
    } else {
      await client.send(
        new UpdateTableCommand({
          TableName: "cloudship-deployments",
          AttributeDefinitions: [
            { AttributeName: "userId", AttributeType: "S" },
            { AttributeName: "createdAt", AttributeType: "S" },
          ],
          GlobalSecondaryIndexUpdates: [
            {
              Create: {
                IndexName: "userId-createdAt-index",
                KeySchema: [
                  { AttributeName: "userId", KeyType: "HASH" },
                  { AttributeName: "createdAt", KeyType: "RANGE" },
                ],
                Projection: { ProjectionType: "ALL" },
              },
            },
          ],
        })
      );
      console.log("✅ Index creation initiated!");
    }
  } catch (err) {
    console.log("❌ Error:", err.message);
  }

  console.log("\n🎉 DynamoDB setup complete!\n");
}

run();
