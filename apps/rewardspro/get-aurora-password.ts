/**
 * Get Aurora database password from Secrets Manager
 */

import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { config } from "dotenv";

config();

async function getAuroraPassword() {
  const client = new SecretsManagerClient({
    region: process.env.AWS_REGION || "eu-north-1",
  });

  try {
    const command = new GetSecretValueCommand({
      SecretId: process.env.AURORA_SECRET_ARN,
    });

    const response = await client.send(command);
    
    if (response.SecretString) {
      const secret = JSON.parse(response.SecretString);
      
      console.log("🔐 Aurora Database Credentials:");
      console.log("================================");
      console.log(`Username: ${secret.username}`);
      console.log(`Password: ${secret.password}`);
      console.log(`Host: rewardspro-dev.cluster-cj06ko4ko87d.eu-north-1.rds.amazonaws.com`);
      console.log(`Database: rewardspro`);
      console.log(`Port: 5432`);
      console.log("\n📝 Connection String for Prisma:");
      console.log(`DATABASE_URL=postgresql://${secret.username}:${secret.password}@rewardspro-dev.cluster-cj06ko4ko87d.eu-north-1.rds.amazonaws.com:5432/rewardspro`);
      
      return secret;
    }
  } catch (error) {
    console.error("❌ Failed to retrieve secret:", error);
  }
}

getAuroraPassword();