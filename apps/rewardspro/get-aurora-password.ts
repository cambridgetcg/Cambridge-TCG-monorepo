/** Check that the configured Aurora secret exists without printing it. */

import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import { config } from "dotenv";

config();

async function checkAuroraSecret() {
  if (!process.env.AURORA_SECRET_ARN) {
    console.error("AURORA_SECRET_ARN is required.");
    process.exitCode = 1;
    return;
  }

  const client = new SecretsManagerClient({
    region: process.env.AWS_REGION || "eu-north-1",
  });

  try {
    const command = new GetSecretValueCommand({
      SecretId: process.env.AURORA_SECRET_ARN,
    });

    const response = await client.send(command);

    if (!response.SecretString) throw new Error("secret has no string value");

    const secret = JSON.parse(response.SecretString) as Record<string, unknown>;
    const requiredFields = ["username", "password"];
    const complete = requiredFields.every(
      (field) => typeof secret[field] === "string" && secret[field] !== "",
    );
    if (!complete) throw new Error("secret is missing required fields");

    console.log("Aurora secret is available and has the required fields.");
  } catch {
    console.error("Aurora secret check failed. No secret value was printed.");
    process.exitCode = 1;
  }
}

void checkAuroraSecret();
