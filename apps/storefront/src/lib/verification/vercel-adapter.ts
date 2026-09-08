import { isNormalizedVerificationOrigin } from "./contract";
import {
  AuthVerifyInputError,
  AUTH_VERIFY_MAX_BODY_BYTES,
  AUTH_VERIFY_SUBPROCESS_MAX_BUFFER,
  AUTH_VERIFY_SUBPROCESS_TIMEOUT_MS,
  type GitHubVerificationDescriptorForRunner,
  type VercelMetadataObservation,
} from "./runner";
import {
  isSafeCommitSha,
  isSafeDeploymentId,
  isSupportId,
  parseVerificationAttemptSummary,
  type VerificationAttemptSummary,
} from "./events";

export const VERCEL_PROJECT_ID = "prj_zCHRH4oj7PVh6oXtyNFXF8yrQdRD" as const;
export const VERCEL_TEAM_ID = "team_HR4tb4WB0KZsKxqroSCTQrof" as const;
export const VERCEL_PROJECT_NAME = "cambridgetcg-storefront" as const;

const REQUIRED_ENV_KEYS = Object.freeze(["AUTH_GITHUB_ID", "AUTH_GITHUB_SECRET"] as const);
const LOG_WINDOW_MS = 60 * 60 * 1_000;
const LOG_LIMIT = 50;
const MAX_CANDIDATE_DEPLOYMENTS = 2;

type VercelTarget = "production" | "preview";

export interface VercelExecFileOptions {
  readonly encoding: "utf8";
  readonly timeout: number;
  readonly maxBuffer: number;
  readonly env: NodeJS.ProcessEnv;
  readonly shell: false;
}

export type VercelExecFile = (
  file: "vercel",
  args: readonly string[],
  options: VercelExecFileOptions,
) => Promise<Readonly<{ stdout: string }>>;

export interface VercelAdapterOptions {
  readonly execFile: VercelExecFile;
  /** Supply only the existing CLI allowlist, never the inherited environment wholesale. */
  readonly env: NodeJS.ProcessEnv;
  readonly now?: () => Date;
}

interface ParsedDeployment {
  readonly id: string;
  readonly sha: string;
  readonly target: VercelTarget;
  readonly createdAt: number;
  readonly branch: string | null;
}

interface ParsedEnvRow {
  readonly key: (typeof REQUIRED_ENV_KEYS)[number];
  readonly targets: readonly VercelTarget[];
  readonly type: "sensitive" | "encrypted";
  readonly createdAt: number;
  readonly updatedAt: number | null;
  readonly gitBranch: string | null;
}

interface NormalizedLogEnvelope {
  readonly project: typeof VERCEL_PROJECT_ID;
  readonly target: VercelTarget;
  readonly path_class: "github_auth";
  readonly origin: string;
  readonly deployment_id: string;
  readonly commit_sha: string;
  readonly event: VerificationAttemptSummary;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function safeNow(options: VercelAdapterOptions): number {
  const time = (options.now?.() ?? new Date()).getTime();
  if (!Number.isFinite(time)) throw new AuthVerifyInputError("tool_output_invalid");
  return time;
}

function isBoundDescriptor(descriptor: GitHubVerificationDescriptorForRunner): boolean {
  return descriptor.vercel?.projectId === VERCEL_PROJECT_ID
    && descriptor.vercel.projectName === VERCEL_PROJECT_NAME
    && descriptor.vercel.teamId === VERCEL_TEAM_ID
    && (descriptor.vercel.target === "production" || descriptor.vercel.target === "preview");
}

function assertBoundDescriptor(descriptor: GitHubVerificationDescriptorForRunner): asserts descriptor is GitHubVerificationDescriptorForRunner & {
  readonly vercel: NonNullable<GitHubVerificationDescriptorForRunner["vercel"]>;
} {
  if (!isBoundDescriptor(descriptor)) throw new AuthVerifyInputError("tool_output_invalid");
}

function mapExecError(error: unknown): never {
  if (error instanceof AuthVerifyInputError) throw error;
  const record = asRecord(error);
  const code = typeof record?.code === "string" ? record.code : null;
  if (code === "ENOENT" || code === "EACCES" || code === "EPERM") {
    throw new AuthVerifyInputError("tool_unavailable");
  }
  if (code === "ETIMEDOUT" || code === "ABORT_ERR" || record?.killed === true) {
    throw new AuthVerifyInputError("tool_timeout");
  }
  if (code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
    throw new AuthVerifyInputError("tool_limit_reached");
  }
  throw new AuthVerifyInputError("verification_internal_error");
}

async function runVercel(options: VercelAdapterOptions, args: readonly string[]): Promise<string> {
  try {
    const result = await options.execFile("vercel", args, {
      encoding: "utf8",
      timeout: AUTH_VERIFY_SUBPROCESS_TIMEOUT_MS,
      maxBuffer: AUTH_VERIFY_SUBPROCESS_MAX_BUFFER,
      env: options.env,
      shell: false,
    });
    if (typeof result.stdout !== "string") throw new AuthVerifyInputError("tool_output_invalid");
    if (result.stdout.length > AUTH_VERIFY_SUBPROCESS_MAX_BUFFER) {
      throw new AuthVerifyInputError("tool_limit_reached");
    }
    return result.stdout;
  } catch (error) {
    return mapExecError(error);
  }
}

async function runJsonApi(
  options: VercelAdapterOptions,
  path: string,
  teamId: string,
): Promise<unknown> {
  const stdout = await runVercel(options, ["api", path, "--scope", teamId, "--raw"]);
  try {
    return JSON.parse(stdout) as unknown;
  } catch {
    throw new AuthVerifyInputError("tool_output_invalid");
  }
}

function integerTimestamp(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function safeBranch(value: unknown): string | null | undefined {
  if (value === null) return null;
  return typeof value === "string" && value.length > 0 && value.length <= 255 && !/[\r\n\0]/.test(value)
    ? value
    : undefined;
}

function normalizeDeploymentTarget(value: unknown): VercelTarget | null {
  if (value === "production") return "production";
  if (value === null) return "preview";
  return null;
}

function parseDeployment(
  value: unknown,
  expected: Readonly<{ id?: string; target: VercelTarget; originHost?: string }>,
  observedAt: number,
): ParsedDeployment {
  const record = asRecord(value);
  const meta = asRecord(record?.meta);
  const id = record?.id;
  const sha = meta?.githubCommitSha;
  const branch = safeBranch(meta?.githubCommitRef);
  const target = normalizeDeploymentTarget(record?.target);
  const createdAt = integerTimestamp(record?.createdAt);
  const aliases = record?.alias;
  const aliasMatches = expected.originHost === undefined
    || (Array.isArray(aliases) && aliases.some((alias) => alias === expected.originHost));
  if (!record
    || record.projectId !== VERCEL_PROJECT_ID
    || record.name !== VERCEL_PROJECT_NAME
    || !isSafeDeploymentId(id)
    || (expected.id !== undefined && id !== expected.id)
    || typeof record.readyState !== "string"
    || target !== expected.target
    || !isSafeCommitSha(sha)
    || branch === undefined
    || createdAt === null
    || createdAt > observedAt
    || !aliasMatches) {
    throw new AuthVerifyInputError("tool_output_invalid");
  }
  if (record.readyState !== "READY") throw new AuthVerifyInputError("deployment_not_ready");
  return Object.freeze({
    id,
    sha: sha.toLowerCase(),
    target,
    createdAt,
    branch,
  });
}

function parseEnvRow(value: unknown, observedAt: number): ParsedEnvRow | null {
  const row = asRecord(value);
  if (!row || !REQUIRED_ENV_KEYS.includes(row.key as (typeof REQUIRED_ENV_KEYS)[number])) return null;
  const targets = row.target;
  const branch = safeBranch(row.gitBranch);
  const createdAt = integerTimestamp(row.createdAt);
  const updatedAt = row.updatedAt === undefined || row.updatedAt === null
    ? null
    : integerTimestamp(row.updatedAt);
  if (!Array.isArray(targets)
    || targets.length < 1
    || targets.length > 2
    || new Set(targets).size !== targets.length
    || targets.some((target) => target !== "production" && target !== "preview")
    || (row.type !== "sensitive" && row.type !== "encrypted")
    || branch === undefined
    || createdAt === null
    || (updatedAt === null && row.updatedAt !== undefined && row.updatedAt !== null)
    || (updatedAt !== null && updatedAt < createdAt)
    || createdAt > observedAt
    || (updatedAt !== null && updatedAt > observedAt)) {
    throw new AuthVerifyInputError("tool_output_invalid");
  }
  return Object.freeze({
    key: row.key as ParsedEnvRow["key"],
    targets: Object.freeze([...targets]) as readonly VercelTarget[],
    type: row.type,
    createdAt,
    updatedAt,
    gitBranch: branch,
  });
}

function selectedEnvironmentRows(
  value: unknown,
  deployment: ParsedDeployment,
  observedAt: number,
): readonly ParsedEnvRow[] {
  const record = asRecord(value);
  if (!record || !Array.isArray(record.envs)) throw new AuthVerifyInputError("tool_output_invalid");
  const rows = record.envs
    .map((row) => parseEnvRow(row, observedAt))
    .filter((row): row is ParsedEnvRow => row !== null);

  return Object.freeze(REQUIRED_ENV_KEYS.map((key) => {
    const targetRows = rows.filter((row) => row.key === key && row.targets.includes(deployment.target));
    let candidates: readonly ParsedEnvRow[];
    if (deployment.target === "production") {
      candidates = targetRows.filter((row) => row.gitBranch === null);
    } else {
      if (deployment.branch === null) throw new AuthVerifyInputError("tool_output_invalid");
      const branchRows = targetRows.filter((row) => row.gitBranch === deployment.branch);
      candidates = branchRows.length > 0
        ? branchRows
        : targetRows.filter((row) => row.gitBranch === null);
    }
    if (candidates.length !== 1) throw new AuthVerifyInputError("tool_output_invalid");
    return candidates[0]!;
  }));
}

function canonicalVercelOrigin(origin: string): Readonly<{ origin: string; host: string }> {
  if (!isNormalizedVerificationOrigin(origin)) throw new AuthVerifyInputError("tool_output_invalid");
  const url = new URL(origin);
  if (url.protocol !== "https:" || url.port) throw new AuthVerifyInputError("tool_output_invalid");
  return Object.freeze({ origin: url.origin, host: url.hostname.toLowerCase() });
}

function logTimestamp(value: unknown): number | null {
  if (typeof value === "number") return integerTimestamp(value);
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function summariesInLogRecord(record: Record<string, unknown>): readonly VerificationAttemptSummary[] {
  const strings: string[] = [];
  if (typeof record.message === "string") strings.push(record.message);
  if (Array.isArray(record.logs)) {
    for (const nested of record.logs) {
      const item = asRecord(nested);
      if (!item) continue;
      if (typeof item.message === "string") strings.push(item.message);
      if (typeof item.text === "string") strings.push(item.text);
    }
  }
  const summaries: VerificationAttemptSummary[] = [];
  for (const text of strings) {
    if (text.length > AUTH_VERIFY_MAX_BODY_BYTES) continue;
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(text) as unknown;
    } catch {
      continue;
    }
    const summary = parseVerificationAttemptSummary(parsedJson);
    if (summary) summaries.push(summary);
  }
  return Object.freeze(summaries);
}

function phaseForRequest(path: unknown, method: unknown): "signin" | "callback" | null {
  if (path === "/api/auth/signin/github" && method === "POST") return "signin";
  if (path === "/api/auth/callback/github" && method === "GET") return "callback";
  return null;
}

function parseJsonLines(stdout: string): readonly unknown[] {
  const lines = stdout.split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length > LOG_LIMIT || lines.some((line) => line.length > AUTH_VERIFY_MAX_BODY_BYTES)) {
    throw new AuthVerifyInputError("tool_limit_reached");
  }
  try {
    return Object.freeze(lines.map((line) => JSON.parse(line) as unknown));
  } catch {
    throw new AuthVerifyInputError("tool_output_invalid");
  }
}

function candidateLogSummaries(
  rows: readonly unknown[],
  supportId: string,
  target: VercelTarget,
  origin: Readonly<{ origin: string; host: string }>,
  observedAt: number,
): readonly Readonly<{ deploymentId: string; summary: VerificationAttemptSummary }>[] {
  const candidates = new Map<string, Readonly<{ deploymentId: string; summary: VerificationAttemptSummary }>>();
  for (const value of rows) {
    const record = asRecord(value);
    const phase = record ? phaseForRequest(record.requestPath, record.requestMethod) : null;
    const timestamp = record ? logTimestamp(record.timestamp) : null;
    if (!record
      || record.projectId !== VERCEL_PROJECT_ID
      || record.domain !== origin.host
      || record.environment !== target
      || phase === null
      || !isSafeDeploymentId(record.deploymentId)
      || timestamp === null
      || timestamp < observedAt - LOG_WINDOW_MS
      || timestamp > observedAt) continue;

    for (const summary of summariesInLogRecord(record)) {
      const startedAt = Date.parse(summary.started_at);
      const completedAt = Date.parse(summary.completed_at);
      if (summary.support_id !== supportId
        || summary.phase !== phase
        || summary.deployment_id !== record.deploymentId
        || !isSafeCommitSha(summary.commit_sha)
        || completedAt < startedAt
        || startedAt < observedAt - LOG_WINDOW_MS
        || completedAt > observedAt) continue;
      const identity = JSON.stringify(summary);
      candidates.set(`${record.deploymentId}:${identity}`, Object.freeze({
        deploymentId: record.deploymentId,
        summary,
      }));
    }
  }
  const result = [...candidates.values()];
  const deploymentIds = new Set(result.map((candidate) => candidate.deploymentId));
  if (deploymentIds.size > MAX_CANDIDATE_DEPLOYMENTS) {
    throw new AuthVerifyInputError("tool_output_invalid");
  }
  const distinctSummaries = new Set(result.map((candidate) => JSON.stringify(candidate.summary)));
  if (distinctSummaries.size > 1) throw new AuthVerifyInputError("tool_output_invalid");
  return Object.freeze(result);
}

export function createVercelAdapter(options: VercelAdapterOptions): Readonly<{
  readVercelMetadata: (
    descriptor: GitHubVerificationDescriptorForRunner,
    origin: string,
  ) => Promise<VercelMetadataObservation | null>;
  readVercelLogs: (
    descriptor: GitHubVerificationDescriptorForRunner,
    origin: string,
    supportId: string,
  ) => Promise<readonly unknown[]>;
}> {
  return Object.freeze({
    async readVercelMetadata(descriptor, requestedOrigin) {
      assertBoundDescriptor(descriptor);
      const origin = canonicalVercelOrigin(requestedOrigin);
      const deploymentOutput = await runJsonApi(
        options,
        `/v13/deployments/${encodeURIComponent(origin.host)}`,
        descriptor.vercel.teamId,
      );
      const deploymentObservedAt = safeNow(options);
      const deployment = parseDeployment(deploymentOutput, {
        target: descriptor.vercel.target,
        originHost: origin.host,
      }, deploymentObservedAt);
      const environmentOutput = await runJsonApi(
        options,
        `/v10/projects/${descriptor.vercel.projectId}/env`,
        descriptor.vercel.teamId,
      );
      const observedAtMs = safeNow(options);
      if (observedAtMs < deploymentObservedAt) throw new AuthVerifyInputError("tool_output_invalid");
      const selected = selectedEnvironmentRows(environmentOutput, deployment, observedAtMs);
      const latestConfigurationAt = Math.max(...selected.map((row) => row.updatedAt ?? row.createdAt));
      return Object.freeze({
        id: deployment.id,
        sha: deployment.sha,
        observedAt: new Date(observedAtMs).toISOString(),
        target: deployment.target,
        configurationFreshness: latestConfigurationAt > deployment.createdAt
          ? "newer_than_deployment"
          : "current",
      });
    },

    async readVercelLogs(descriptor, requestedOrigin, supportId) {
      assertBoundDescriptor(descriptor);
      if (!isSupportId(supportId)) throw new AuthVerifyInputError("config_attempt_required");
      const origin = canonicalVercelOrigin(requestedOrigin);
      const stdout = await runVercel(options, [
        "logs",
        "--project", descriptor.vercel.projectId,
        "--environment", descriptor.vercel.target,
        "--no-follow",
        "--no-branch",
        "--query", supportId,
        "--since", "1h",
        "--limit", String(LOG_LIMIT),
        "--json",
        "--scope", descriptor.vercel.teamId,
      ]);
      const observedAtMs = safeNow(options);
      const candidates = candidateLogSummaries(
        parseJsonLines(stdout), supportId, descriptor.vercel.target, origin, observedAtMs,
      );
      if (candidates.length === 0) return Object.freeze([]);

      const deployments = new Map<string, ParsedDeployment>();
      for (const deploymentId of new Set(candidates.map((candidate) => candidate.deploymentId))) {
        const output = await runJsonApi(
          options,
          `/v13/deployments/${encodeURIComponent(deploymentId)}`,
          descriptor.vercel.teamId,
        );
        const deploymentObservedAt = safeNow(options);
        if (deploymentObservedAt < observedAtMs) throw new AuthVerifyInputError("tool_output_invalid");
        deployments.set(deploymentId, parseDeployment(output, {
          id: deploymentId,
          target: descriptor.vercel.target,
        }, deploymentObservedAt));
      }

      const accepted = candidates.filter((candidate) => {
        const deployment = deployments.get(candidate.deploymentId);
        return deployment !== undefined
          && candidate.summary.commit_sha?.toLowerCase() === deployment.sha;
      });
      if (accepted.length === 0) return Object.freeze([]);
      if (new Set(accepted.map((candidate) => JSON.stringify(candidate.summary))).size !== 1) {
        throw new AuthVerifyInputError("tool_output_invalid");
      }
      const candidate = accepted[0]!;
      const deployment = deployments.get(candidate.deploymentId)!;
      const envelope: NormalizedLogEnvelope = Object.freeze({
        project: VERCEL_PROJECT_ID,
        target: descriptor.vercel.target,
        path_class: "github_auth",
        origin: origin.origin,
        deployment_id: deployment.id,
        commit_sha: deployment.sha,
        event: candidate.summary,
      });
      return Object.freeze([envelope]);
    },
  });
}
