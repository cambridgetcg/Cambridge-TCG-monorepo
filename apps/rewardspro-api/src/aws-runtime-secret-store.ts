import { randomUUID } from "node:crypto";

import {
  DescribeSecretCommand,
  GetSecretValueCommand,
  PutSecretValueCommand,
  SecretsManagerClient,
  type DescribeSecretCommandOutput,
  type GetSecretValueCommandOutput,
} from "@aws-sdk/client-secrets-manager";

import type { RuntimeSecretStore } from "./database-role-bootstrap.js";

type RuntimeSecretCommand =
  | DescribeSecretCommand
  | GetSecretValueCommand
  | PutSecretValueCommand;
type RuntimeSecretCommandSender = (
  command: RuntimeSecretCommand,
) => Promise<unknown>;

export class AwsRuntimeSecretStore implements RuntimeSecretStore {
  readonly #send: RuntimeSecretCommandSender;

  constructor(region: string, sender?: RuntimeSecretCommandSender) {
    if (sender) {
      this.#send = sender;
      return;
    }
    const client = new SecretsManagerClient({ region });
    this.#send = async (command) => {
      if (command instanceof DescribeSecretCommand) {
        return client.send(command);
      }
      if (command instanceof GetSecretValueCommand) {
        return client.send(command);
      }
      return client.send(command);
    };
  }

  async readCurrent(secretArn: string): Promise<string | undefined> {
    const description = (await this.#send(
      new DescribeSecretCommand({ SecretId: secretArn }),
    )) as DescribeSecretCommandOutput;
    if (description.ARN !== secretArn) {
      throw new Error("Secrets Manager returned an unexpected secret");
    }
    const hasCurrent = Object.values(description.VersionIdsToStages ?? {}).some(
      (stages) => stages.includes("AWSCURRENT"),
    );
    if (!hasCurrent) {
      return undefined;
    }

    const value = (await this.#send(
      new GetSecretValueCommand({
        SecretId: secretArn,
        VersionStage: "AWSCURRENT",
      }),
    )) as GetSecretValueCommandOutput;
    if (value.SecretString === undefined || value.SecretString.length === 0) {
      throw new Error("Runtime database secret is not a non-empty string");
    }
    return value.SecretString;
  }

  async writeCurrent(secretArn: string, secretValue: string): Promise<void> {
    if ((await this.readCurrent(secretArn)) !== undefined) {
      throw new Error(
        "Runtime database secret became populated during bootstrap; retry safely",
      );
    }
    await this.#send(
      new PutSecretValueCommand({
        ClientRequestToken: randomUUID(),
        SecretId: secretArn,
        SecretString: secretValue,
        VersionStages: ["AWSCURRENT"],
      }),
    );
  }
}
