#!/usr/bin/env node

/**
 * Bounded operator surface for the PRISM Signals Stripe sandbox cohort.
 *
 * This command never accepts an email address or a Stripe identifier. Its only
 * writes target the exact test-only invitation row. Production writes require
 * a witness copied from a prior read-only plan and an action-specific token.
 *
 * Examples (the database URL is intentionally env-only):
 *   PRISM_OPERATOR_DATABASE_URL='postgresql://<role>@...' PRISM_OPERATOR_PRODUCTION_TARGET_WITNESS='sha256:<provisioned-pin>' pnpm prism-stripe:operator -- status --target production --ca-file /secure/rds-ca.pem
 *   PRISM_OPERATOR_DATABASE_URL='postgresql://<role>@...' PRISM_OPERATOR_PRODUCTION_TARGET_WITNESS='sha256:<provisioned-pin>' pnpm prism-stripe:operator -- plan-grant --target production --ca-file /secure/rds-ca.pem --user-id <uuid> --expires-at 2026-10-01T00:00:00.000Z --reason initial_sandbox_cohort
 *   PRISM_OPERATOR_DATABASE_URL='postgresql://<role>@...' PRISM_OPERATOR_PRODUCTION_TARGET_WITNESS='sha256:<provisioned-pin>' pnpm prism-stripe:operator -- grant --target production --ca-file /secure/rds-ca.pem --user-id <uuid> --expires-at 2026-10-01T00:00:00.000Z --reason initial_sandbox_cohort --planned-at <timestamp-from-plan> --database-witness sha256:<digest> --confirm PRISM_GRANT_<digest>
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { Pool, type PoolClient, type PoolConfig } from "pg";

export const PRISM_OPERATOR_ENVIRONMENT = "test" as const;
export const PRISM_OPERATOR_PRODUCT_ID = "prism-signals" as const;
export const PRISM_OPERATOR_SCOPE = "stripe_all_sandbox_v1" as const;
export const PRISM_OPERATOR_SCHEMA =
  "cambridgetcg.prism-stripe-operator/1" as const;
export const PRISM_OPERATOR_MAX_INVITATION_MS = 31 * 24 * 60 * 60 * 1_000;
export const PRISM_OPERATOR_MIN_INVITATION_MS = 5 * 60 * 1_000;
export const PRISM_OPERATOR_PLAN_TTL_MS = 10 * 60 * 1_000;

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const REASON_PATTERN = /^[a-z][a-z0-9_]{2,63}$/;
const WITNESS_PATTERN = /^sha256:[0-9a-f]{64}$/;
const CONFIRM_PATTERN = /^PRISM_(?:GRANT|REVOKE)_[0-9A-F]{24}$/;
const RAW_STRIPE_ID_PATTERN =
  /\b(?:acct|cus|sub|in|pi|re|evt|price|prod|cs|bpc|ch|pm|src|seti|si|we|ip|tok|card|ba|btok|txn)_[A-Za-z0-9_]{8,}\b/;
const STRIPE_SECRET_PATTERN =
  /\b(?:(?:sk|rk|pk)_(?:test|live)_[A-Za-z0-9]{8,}|whsec_[A-Za-z0-9]{8,})\b/;
const UUID_LEAK_PATTERN =
  /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/;
const EMAIL_LEAK_PATTERN = /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/;

export type PrismOperatorTarget = "production" | "test";
export type PrismOperatorAction =
  | "status"
  | "reconciliation"
  | "plan-grant"
  | "plan-revoke"
  | "grant"
  | "revoke";

export interface ParsedPrismOperatorCommand {
  readonly action: PrismOperatorAction;
  readonly target: PrismOperatorTarget;
  readonly caFile: string | null;
  readonly userId: string | null;
  readonly expiresAt: string | null;
  readonly reason: string | null;
  readonly plannedAt: string | null;
  readonly databaseWitness: string | null;
  readonly confirmation: string | null;
}

export interface PreparedPrismOperatorTarget {
  readonly target: PrismOperatorTarget;
  readonly database: string;
  readonly role: string;
  readonly witness: string;
  readonly poolConfig: Readonly<PoolConfig>;
  readonly requiresTls: boolean;
}

export interface PrismOperatorPool {
  connect(): Promise<PoolClient>;
  end(): Promise<void>;
}

export interface PrismOperatorDependencies {
  readonly pool?: PrismOperatorPool;
  readonly now?: () => Date;
}

interface ReconciliationSummary {
  readonly required: number;
  readonly resolved: number;
  readonly required_full_refund: number;
  readonly required_refund_before_grant: number;
}

interface InvitationSummary {
  readonly active: number;
  readonly expired: number;
  readonly revoked: number;
}

type InvitationState = "none" | "active" | "expired" | "revoked";

interface InvitationObservation {
  readonly exists: boolean;
  readonly invitation: InvitationState;
  readonly rowStatus: "active" | "revoked" | null;
  readonly witness: string;
}

interface ReconciliationFingerprint extends ReconciliationSummary {
  readonly fingerprint: string;
}

export class PrismOperatorError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "PrismOperatorError";
    this.code = code;
  }
}

function fail(code: string, message: string): never {
  throw new PrismOperatorError(code, message);
}

function optionMap(argv: readonly string[]): Map<string, string> {
  const result = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      fail("invalid_arguments", "Every operator option must use --name value syntax.");
    }
    if (token.includes("=")) {
      fail("invalid_arguments", "Operator options do not accept --name=value syntax.");
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      fail("invalid_arguments", "Every operator option requires one explicit value.");
    }
    if (result.has(token)) {
      fail("invalid_arguments", "Duplicate operator options are not accepted.");
    }
    result.set(token, value);
    index += 1;
  }
  return result;
}

function exactUuid(value: string): string {
  if (!UUID_PATTERN.test(value)) {
    fail("invalid_user_id", "--user-id must be one canonical lowercase UUID.");
  }
  return value;
}

export function canonicalUtcTimestamp(value: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.valueOf()) || parsed.toISOString() !== value) {
    fail(
      "invalid_expiry",
      "--expires-at must be a canonical UTC timestamp with milliseconds and Z.",
    );
  }
  return value;
}

function exactReason(value: string): string {
  if (!REASON_PATTERN.test(value)) {
    fail(
      "invalid_reason",
      "--reason must be a 3-64 character lowercase snake_case operator reason.",
    );
  }
  return value;
}

function knownAction(value: string): PrismOperatorAction {
  if (
    value !== "status" &&
    value !== "reconciliation" &&
    value !== "plan-grant" &&
    value !== "plan-revoke" &&
    value !== "grant" &&
    value !== "revoke"
  ) {
    fail("invalid_action", "Unknown PRISM operator action.");
  }
  return value;
}

export function parsePrismOperatorCommand(
  argv: readonly string[],
  environment: Readonly<Record<string, string | undefined>> = process.env,
): ParsedPrismOperatorCommand {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const action = knownAction(
    normalizedArgv[0]?.startsWith("--") || !normalizedArgv[0]
      ? "status"
      : normalizedArgv[0],
  );
  const options = optionMap(
    normalizedArgv[0]?.startsWith("--") || !normalizedArgv[0]
      ? normalizedArgv
      : normalizedArgv.slice(1),
  );
  const known = new Set([
    "--target",
    "--ca-file",
    "--user-id",
    "--expires-at",
    "--reason",
    "--planned-at",
    "--database-witness",
    "--confirm",
  ]);
  for (const name of options.keys()) {
    if (!known.has(name)) fail("invalid_arguments", "Unknown PRISM operator option.");
  }

  const targetValue = options.get("--target");
  if (targetValue !== "production" && targetValue !== "test") {
    fail("invalid_target", "--target must be exactly production or test.");
  }
  const userValue = options.get("--user-id") ?? null;
  const expiryValue = options.get("--expires-at") ?? null;
  const reasonValue = options.get("--reason") ?? null;
  const plannedAtValue = options.get("--planned-at") ?? null;
  const witnessValue = options.get("--database-witness") ?? null;
  const confirmationValue = options.get("--confirm") ?? null;
  const caFile = options.get("--ca-file") ?? environment.PGSSLROOTCERT?.trim() ?? null;
  const needsUser =
    action === "plan-grant" ||
    action === "plan-revoke" ||
    action === "grant" ||
    action === "revoke";
  const isGrant = action === "plan-grant" || action === "grant";
  const isWrite = action === "grant" || action === "revoke";

  if (needsUser && userValue === null) {
    fail("missing_user_id", "This action requires --user-id.");
  }
  if (!needsUser && action !== "status" && userValue !== null) {
    fail("invalid_arguments", "This read-only action does not accept --user-id.");
  }
  if (isGrant !== (expiryValue !== null)) {
    fail("invalid_arguments", "Only grant actions require --expires-at.");
  }
  if (needsUser !== (reasonValue !== null)) {
    fail("invalid_arguments", "Plan and write actions require --reason.");
  }
  if (isWrite !== (witnessValue !== null) || isWrite !== (confirmationValue !== null)) {
    fail(
      "invalid_arguments",
      "Writes require --database-witness and --confirm; read-only actions reject them.",
    );
  }
  if (isWrite !== (plannedAtValue !== null)) {
    fail(
      "invalid_arguments",
      "Writes require --planned-at from a fresh plan; read-only actions reject it.",
    );
  }
  if (witnessValue !== null && !WITNESS_PATTERN.test(witnessValue)) {
    fail("invalid_witness", "--database-witness has an invalid format.");
  }
  if (confirmationValue !== null && !CONFIRM_PATTERN.test(confirmationValue)) {
    fail("invalid_confirmation", "--confirm has an invalid format.");
  }

  return Object.freeze({
    action,
    target: targetValue,
    caFile: caFile || null,
    userId: userValue === null ? null : exactUuid(userValue),
    expiresAt: expiryValue === null ? null : canonicalUtcTimestamp(expiryValue),
    reason: reasonValue === null ? null : exactReason(reasonValue),
    plannedAt:
      plannedAtValue === null ? null : canonicalUtcTimestamp(plannedAtValue),
    databaseWitness: witnessValue,
    confirmation: confirmationValue,
  });
}

function decodedUrlPart(value: string, code: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    fail(code, "The database URL contains invalid percent encoding.");
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function databaseTimestamp(value: unknown, label: string): string {
  let timestamp: string;
  if (value instanceof Date) timestamp = value.toISOString();
  else if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.valueOf())) {
      fail("invalid_database_result", `The stored ${label} timestamp is invalid.`);
    }
    timestamp = parsed.toISOString();
  } else {
    fail("invalid_database_result", `The stored ${label} timestamp is invalid.`);
  }
  return timestamp;
}

export function buildPrismOperatorInvitationWitness(
  input: Readonly<{
    status: "active" | "revoked";
    invitedAt: string;
    expiresAt: string;
    revokedAt: string | null;
    updatedAt: string;
  }> | null,
): string {
  if (input === null) {
    return `sha256:${sha256("prism-stripe-invitation:none:v1")}`;
  }
  const invitedAt = canonicalUtcTimestamp(input.invitedAt);
  const expiresAt = canonicalUtcTimestamp(input.expiresAt);
  const updatedAt = canonicalUtcTimestamp(input.updatedAt);
  const revokedAt =
    input.revokedAt === null ? null : canonicalUtcTimestamp(input.revokedAt);
  if (
    (input.status === "active" && revokedAt !== null) ||
    (input.status === "revoked" && revokedAt === null)
  ) {
    fail("invalid_database_result", "The invitation row has inconsistent revocation state.");
  }
  return `sha256:${sha256(
    JSON.stringify({
      schema: "cambridgetcg.prism-stripe-invitation-witness/1",
      status: input.status,
      invited_at: invitedAt,
      expires_at: expiresAt,
      revoked_at: revokedAt,
      updated_at: updatedAt,
    }),
  )}`;
}

export function preparePrismOperatorTarget(input: Readonly<{
  databaseUrl: string;
  target: PrismOperatorTarget;
  caPem?: string | null;
  expectedProductionWitness?: string | null;
}>): PreparedPrismOperatorTarget {
  let url: URL;
  try {
    url = new URL(input.databaseUrl);
  } catch {
    fail("invalid_database_url", "PRISM_OPERATOR_DATABASE_URL is not a valid URL.");
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    fail("invalid_database_url", "PRISM operator access requires PostgreSQL.");
  }
  if (url.hash !== "") {
    fail("invalid_database_url", "Database URL fragments are not accepted.");
  }
  const queryKeys = [...url.searchParams.keys()];
  if (queryKeys.some((key) => key !== "sslmode") || queryKeys.filter((key) => key === "sslmode").length > 1) {
    fail("invalid_database_url", "Database URL target or session overrides are not accepted.");
  }
  url.search = "";
  const rawHostname = url.hostname.toLowerCase().replace(/\.$/, "");
  const hostname = rawHostname === "[::1]" ? "::1" : rawHostname;
  if (!hostname) fail("invalid_database_url", "The database host must be explicit.");
  const loopback = LOOPBACK_HOSTS.has(hostname);
  const localOrUnspecified =
    loopback ||
    hostname === "0.0.0.0" ||
    hostname === "::" ||
    hostname.startsWith("127.") ||
    hostname.endsWith(".localhost") ||
    hostname.startsWith("::ffff:127.");
  const database = decodedUrlPart(url.pathname.slice(1), "invalid_database_url");
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$/.test(database) || database.includes("/")) {
    fail("invalid_database_url", "The database name is invalid.");
  }
  const port = url.port === "" ? 5432 : Number(url.port);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    fail("invalid_database_url", "The database port is invalid.");
  }
  if (!url.username) {
    fail(
      "missing_database_role",
      "The database URL must contain one explicit role; ambient PGUSER is not accepted.",
    );
  }
  const username = decodedUrlPart(url.username, "invalid_database_role");
  if (
    username !== url.username ||
    !/^[A-Za-z_][A-Za-z0-9_.-]{0,62}$/.test(username)
  ) {
    fail(
      "invalid_database_role",
      "The database URL role must be canonical unescaped ASCII.",
    );
  }

  let ssl: PoolConfig["ssl"] = false;
  let caDigest = "loopback-test";
  if (input.target === "test") {
    if (!loopback || !database.endsWith("_test")) {
      fail(
        "unsafe_test_target",
        "A test target must be explicit loopback and its database must end in _test.",
      );
    }
    if (input.caPem) {
      fail("unsafe_test_target", "Loopback test targets do not accept a TLS CA override.");
    }
    if (input.expectedProductionWitness) {
      fail(
        "unsafe_test_target",
        "A loopback test target does not accept a production witness pin.",
      );
    }
  } else {
    if (
      localOrUnspecified ||
      database.endsWith("_test") ||
      database === "postgres" ||
      database === "template0" ||
      database === "template1"
    ) {
      fail(
        "unsafe_production_target",
        "A production target cannot be local, maintenance, or a _test database.",
      );
    }
    if (!input.caPem || !input.caPem.includes("-----BEGIN CERTIFICATE-----")) {
      fail("missing_tls_ca", "A valid PEM CA is required for a production target.");
    }
    caDigest = sha256(input.caPem);
    ssl = Object.freeze({ ca: input.caPem, rejectUnauthorized: true });
  }

  const witness = `sha256:${sha256(
    JSON.stringify({
      version: 1,
      target: input.target,
      hostname,
      port,
      database,
      username,
      ca_sha256: caDigest,
    }),
  )}`;
  if (input.target === "production") {
    if (
      !input.expectedProductionWitness ||
      !WITNESS_PATTERN.test(input.expectedProductionWitness)
    ) {
      fail(
        "missing_production_target_pin",
        "Set the independently provisioned PRISM_OPERATOR_PRODUCTION_TARGET_WITNESS.",
      );
    }
    if (input.expectedProductionWitness !== witness) {
      fail(
        "production_target_pin_mismatch",
        "The database URL, role, or CA does not match the pinned production target.",
      );
    }
  }
  const poolConfig: PoolConfig = {
    host: hostname,
    port,
    database,
    user: username,
    ...(url.password ? { password: decodedUrlPart(url.password, "invalid_database_url") } : {}),
    ssl,
    max: 2,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 5_000,
    application_name: "cambridgetcg-prism-stripe-operator",
    options: "-c search_path=public",
  };
  return Object.freeze({
    target: input.target,
    database,
    role: username,
    witness,
    poolConfig: Object.freeze(poolConfig),
    requiresTls: input.target === "production",
  });
}

export function buildPrismOperatorConfirmation(input: Readonly<{
  action: "grant" | "revoke";
  userId: string;
  expiresAt: string | null;
  reason: string;
  plannedAt: string;
  invitationWitness: string;
  databaseWitness: string;
}>): string {
  if (
    (input.action === "grant" && input.expiresAt === null) ||
    (input.action === "revoke" && input.expiresAt !== null)
  ) {
    fail(
      "invalid_expiry",
      "Grant confirmation requires one expiry; revoke confirmation forbids it.",
    );
  }
  const digest = sha256(
    JSON.stringify({
      schema: PRISM_OPERATOR_SCHEMA,
      action: input.action,
      environment: PRISM_OPERATOR_ENVIRONMENT,
      product_id: PRISM_OPERATOR_PRODUCT_ID,
      scope: PRISM_OPERATOR_SCOPE,
      user_id: exactUuid(input.userId),
      expires_at:
        input.action === "grant" && input.expiresAt !== null
          ? canonicalUtcTimestamp(input.expiresAt)
          : null,
      reason: exactReason(input.reason),
      planned_at: canonicalUtcTimestamp(input.plannedAt),
      invitation_witness: WITNESS_PATTERN.test(input.invitationWitness)
        ? input.invitationWitness
        : fail("invalid_witness", "The invitation witness is invalid."),
      database_witness: WITNESS_PATTERN.test(input.databaseWitness)
        ? input.databaseWitness
        : fail("invalid_witness", "The database witness is invalid."),
    }),
  );
  return `PRISM_${input.action.toUpperCase()}_${digest.slice(0, 24).toUpperCase()}`;
}

function boundedExpiry(expiresAt: string, now: Date): string {
  const nowMs = now.valueOf();
  if (!Number.isFinite(nowMs)) fail("invalid_clock", "The operator clock is invalid.");
  const expiryMs = Date.parse(canonicalUtcTimestamp(expiresAt));
  const lifetime = expiryMs - nowMs;
  if (
    lifetime < PRISM_OPERATOR_MIN_INVITATION_MS ||
    lifetime > PRISM_OPERATOR_MAX_INVITATION_MS
  ) {
    fail(
      "expiry_out_of_bounds",
      "Invitation expiry must be at least five minutes and no more than 31 days ahead.",
    );
  }
  return expiresAt;
}

function freshPlanTimestamp(plannedAt: string, now: Date): string {
  const canonical = canonicalUtcTimestamp(plannedAt);
  const age = now.valueOf() - Date.parse(canonical);
  if (!Number.isFinite(age) || age < 0 || age > PRISM_OPERATOR_PLAN_TTL_MS) {
    fail(
      "stale_plan",
      "The plan timestamp must be no more than ten minutes old and not in the future.",
    );
  }
  return canonical;
}

function integerCount(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    fail("invalid_database_result", "The database returned an invalid aggregate count.");
  }
  return parsed;
}

async function verifyConnectedTarget(
  client: PoolClient,
  target: PreparedPrismOperatorTarget,
): Promise<void> {
  const result = await client.query<{
    database: string;
    role: string;
    tls: boolean;
  }>(
    `SELECT current_database()::TEXT AS database,
            current_user::TEXT AS role,
            EXISTS (
              SELECT 1 FROM pg_stat_ssl
               WHERE pid = pg_backend_pid() AND ssl = TRUE
            ) AS tls`,
  );
  const row = result.rows[0];
  if (row?.database !== target.database) {
    fail("database_witness_mismatch", "The connected database does not match the guarded target.");
  }
  if (row.role !== target.role) {
    fail(
      "database_role_mismatch",
      "The connected database role does not match the explicitly pinned URL role.",
    );
  }
  if (target.requiresTls && row.tls !== true) {
    fail("tls_not_verified", "The production database connection did not attest TLS.");
  }
}

async function invitationSummary(client: PoolClient, now: string): Promise<InvitationSummary> {
  const result = await client.query(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'active' AND expires_at > $1::TIMESTAMPTZ)::INTEGER AS active,
       COUNT(*) FILTER (WHERE status = 'active' AND expires_at <= $1::TIMESTAMPTZ)::INTEGER AS expired,
       COUNT(*) FILTER (WHERE status = 'revoked')::INTEGER AS revoked
     FROM product_flow_prism_stripe_invitations
     WHERE environment = $2 AND product_id = $3 AND scope = $4`,
    [now, PRISM_OPERATOR_ENVIRONMENT, PRISM_OPERATOR_PRODUCT_ID, PRISM_OPERATOR_SCOPE],
  );
  const row = result.rows[0] as Record<string, unknown> | undefined;
  return Object.freeze({
    active: integerCount(row?.active),
    expired: integerCount(row?.expired),
    revoked: integerCount(row?.revoked),
  });
}

async function reconciliationFingerprint(
  client: PoolClient,
): Promise<ReconciliationFingerprint> {
  const result = await client.query(
    `SELECT
       COUNT(*) FILTER (WHERE reconciliation_status = 'required')::INTEGER AS required,
       COUNT(*) FILTER (WHERE reconciliation_status = 'resolved')::INTEGER AS resolved,
       COUNT(*) FILTER (
         WHERE reconciliation_status = 'required' AND reconciliation_reason = 'full_refund'
       )::INTEGER AS required_full_refund,
       COUNT(*) FILTER (
         WHERE reconciliation_status = 'required' AND reconciliation_reason = 'refund_before_grant'
       )::INTEGER AS required_refund_before_grant,
       COALESCE(
         MD5(STRING_AGG(
           CONCAT_WS(E'\\x1f',
             stripe_subscription_id,
             COALESCE(reconciliation_status, ''),
             COALESCE(reconciliation_action, ''),
             COALESCE(reconciliation_reason, ''),
             COALESCE(reconciliation_stripe_event_id, ''),
             COALESCE(reconciliation_stripe_invoice_id, ''),
             COALESCE(reconciliation_stripe_payment_intent_id, ''),
             COALESCE(reconciliation_stripe_refund_id, ''),
             COALESCE(reconciliation_required_at::TEXT, ''),
             COALESCE(reconciliation_resolved_event_id, ''),
             COALESCE(reconciliation_resolved_at::TEXT, '')
           ),
           E'\\x1e' ORDER BY stripe_subscription_id
         )),
         MD5('')
       ) AS fingerprint
     FROM product_flow_stripe_subscriptions
     WHERE environment = $1 AND product_id = $2`,
    [PRISM_OPERATOR_ENVIRONMENT, PRISM_OPERATOR_PRODUCT_ID],
  );
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (typeof row?.fingerprint !== "string" || !/^[0-9a-f]{32}$/.test(row.fingerprint)) {
    fail("invalid_database_result", "The reconciliation fingerprint is invalid.");
  }
  return Object.freeze({
    required: integerCount(row.required),
    resolved: integerCount(row.resolved),
    required_full_refund: integerCount(row.required_full_refund),
    required_refund_before_grant: integerCount(row.required_refund_before_grant),
    fingerprint: row.fingerprint,
  });
}

function publicReconciliation(value: ReconciliationFingerprint): ReconciliationSummary {
  return Object.freeze({
    required: value.required,
    resolved: value.resolved,
    required_full_refund: value.required_full_refund,
    required_refund_before_grant: value.required_refund_before_grant,
  });
}

async function accountStatus(
  client: PoolClient,
  userId: string,
  now: string,
): Promise<InvitationObservation> {
  const result = await client.query(
    `SELECT EXISTS (SELECT 1 FROM users WHERE id = $1::UUID) AS account_exists,
            invitation.status,
            invitation.invited_at,
            invitation.expires_at,
            invitation.revoked_at,
            invitation.updated_at
       FROM (SELECT 1) anchor
       LEFT JOIN product_flow_prism_stripe_invitations invitation
         ON invitation.environment = $2
        AND invitation.product_id = $3
        AND invitation.user_id = $1::UUID
        AND invitation.scope = $4`,
    [userId, PRISM_OPERATOR_ENVIRONMENT, PRISM_OPERATOR_PRODUCT_ID, PRISM_OPERATOR_SCOPE],
  );
  const row = result.rows[0] as
    | {
        account_exists?: unknown;
        status?: unknown;
        invited_at?: unknown;
        expires_at?: unknown;
        revoked_at?: unknown;
        updated_at?: unknown;
      }
    | undefined;
  if (typeof row?.account_exists !== "boolean") {
    fail("invalid_database_result", "The account lookup returned invalid state.");
  }
  if (row.status === null || row.status === undefined) {
    return Object.freeze({
      exists: row.account_exists,
      invitation: "none",
      rowStatus: null,
      witness: buildPrismOperatorInvitationWitness(null),
    });
  }
  if (row.status !== "active" && row.status !== "revoked") {
    fail("invalid_database_result", "The invitation status is invalid.");
  }
  const invitedAt = databaseTimestamp(row.invited_at, "invited_at");
  const expiresAt = databaseTimestamp(row.expires_at, "expires_at");
  const updatedAt = databaseTimestamp(row.updated_at, "updated_at");
  const revokedAt =
    row.revoked_at === null
      ? null
      : databaseTimestamp(row.revoked_at, "revoked_at");
  const invitation =
    row.status === "revoked"
      ? "revoked"
      : Date.parse(expiresAt) > Date.parse(now)
        ? "active"
        : "expired";
  return Object.freeze({
    exists: row.account_exists,
    invitation,
    rowStatus: row.status,
    witness: buildPrismOperatorInvitationWitness({
      status: row.status,
      invitedAt,
      expiresAt,
      revokedAt,
      updatedAt,
    }),
  });
}

async function begin(client: PoolClient, readOnly: boolean): Promise<void> {
  await client.query(
    readOnly
      ? "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"
      : "BEGIN ISOLATION LEVEL SERIALIZABLE READ WRITE",
  );
  await client.query("SET LOCAL statement_timeout = '8s'");
  await client.query("SET LOCAL lock_timeout = '3s'");
  await client.query("SET LOCAL idle_in_transaction_session_timeout = '10s'");
}

function commonOutput(
  command: ParsedPrismOperatorCommand,
  target: PreparedPrismOperatorTarget,
  writes: boolean,
): Record<string, unknown> {
  return {
    schema: PRISM_OPERATOR_SCHEMA,
    ok: true,
    action: command.action,
    writes,
    environment: PRISM_OPERATOR_ENVIRONMENT,
    product_id: PRISM_OPERATOR_PRODUCT_ID,
    scope: PRISM_OPERATOR_SCOPE,
    target: target.target,
    database_witness: target.witness,
  };
}

async function runRead(
  client: PoolClient,
  command: ParsedPrismOperatorCommand,
  target: PreparedPrismOperatorTarget,
  now: string,
): Promise<Record<string, unknown>> {
  await begin(client, true);
  try {
    const reconciliation = await reconciliationFingerprint(client);
    if (command.action === "reconciliation") {
      await client.query("COMMIT");
      return {
        ...commonOutput(command, target, false),
        reconciliation: publicReconciliation(reconciliation),
      };
    }
    const invitations = await invitationSummary(client, now);
    const account = command.userId
      ? await accountStatus(client, command.userId, now)
      : null;
    const publicAccount = account
      ? Object.freeze({ exists: account.exists, invitation: account.invitation })
      : null;
    if (command.action === "status") {
      await client.query("COMMIT");
      return {
        ...commonOutput(command, target, false),
        invitations,
        reconciliation: publicReconciliation(reconciliation),
        ...(publicAccount ? { account: publicAccount } : {}),
      };
    }
    if (!command.userId || !command.reason) {
      fail("invalid_arguments", "The plan is missing its exact account or reason.");
    }
    if (!account?.exists) fail("account_not_found", "The exact account UUID was not found.");
    const plannedAction = command.action === "plan-grant" ? "grant" : "revoke";
    const expiry = plannedAction === "grant" && command.expiresAt
      ? boundedExpiry(command.expiresAt, new Date(now))
      : null;
    const confirmation = buildPrismOperatorConfirmation({
      action: plannedAction,
      userId: command.userId,
      expiresAt: expiry,
      reason: command.reason,
      plannedAt: now,
      invitationWitness: account.witness,
      databaseWitness: target.witness,
    });
    await client.query("COMMIT");
    return {
      ...commonOutput(command, target, false),
      planned_action: plannedAction,
      account: publicAccount,
      confirmation_token: confirmation,
      planned_at: now,
      ...(expiry ? { expires_at: expiry } : {}),
      reconciliation: publicReconciliation(reconciliation),
    };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve the bounded application error.
    }
    throw error;
  }
}

async function lockExactInvitationTarget(
  client: PoolClient,
  userId: string,
  now: string,
): Promise<InvitationObservation> {
  const account = await client.query(
    "SELECT id FROM users WHERE id = $1::UUID FOR UPDATE",
    [userId],
  );
  if ((account.rowCount ?? 0) !== 1) {
    fail("account_not_found", "The exact account UUID was not found.");
  }
  const invitation = await client.query(
    `SELECT status, invited_at, expires_at, revoked_at, updated_at
       FROM product_flow_prism_stripe_invitations
      WHERE environment = $1 AND product_id = $2
        AND user_id = $3::UUID AND scope = $4
      FOR UPDATE`,
    [PRISM_OPERATOR_ENVIRONMENT, PRISM_OPERATOR_PRODUCT_ID, userId, PRISM_OPERATOR_SCOPE],
  );
  const row = invitation.rows[0] as
    | {
        status?: unknown;
        invited_at?: unknown;
        expires_at?: unknown;
        revoked_at?: unknown;
        updated_at?: unknown;
      }
    | undefined;
  if (!row) {
    return Object.freeze({
      exists: true,
      invitation: "none",
      rowStatus: null,
      witness: buildPrismOperatorInvitationWitness(null),
    });
  }
  if (row.status !== "active" && row.status !== "revoked") {
    fail("invalid_database_result", "The locked invitation status is invalid.");
  }
  const invitedAt = databaseTimestamp(row.invited_at, "invited_at");
  const expiresAt = databaseTimestamp(row.expires_at, "expires_at");
  const updatedAt = databaseTimestamp(row.updated_at, "updated_at");
  const revokedAt =
    row.revoked_at === null
      ? null
      : databaseTimestamp(row.revoked_at, "revoked_at");
  return Object.freeze({
    exists: true,
    invitation:
      row.status === "revoked"
        ? "revoked"
        : Date.parse(expiresAt) > Date.parse(now)
          ? "active"
          : "expired",
    rowStatus: row.status,
    witness: buildPrismOperatorInvitationWitness({
      status: row.status,
      invitedAt,
      expiresAt,
      revokedAt,
      updatedAt,
    }),
  });
}

async function runWrite(
  client: PoolClient,
  command: ParsedPrismOperatorCommand,
  target: PreparedPrismOperatorTarget,
  now: string,
): Promise<Record<string, unknown>> {
  if (
    !command.userId ||
    !command.reason ||
    !command.plannedAt ||
    !command.databaseWitness ||
    !command.confirmation
  ) {
    fail("invalid_arguments", "The write is missing an exact guard value.");
  }
  if (command.databaseWitness !== target.witness) {
    fail("database_witness_mismatch", "The database witness does not match this target.");
  }
  const action = command.action === "grant" ? "grant" : "revoke";
  const expiry = action === "grant" && command.expiresAt
    ? boundedExpiry(command.expiresAt, new Date(now))
    : null;
  const plannedAt = freshPlanTimestamp(command.plannedAt, new Date(now));

  await begin(client, false);
  try {
    const locked = await lockExactInvitationTarget(client, command.userId, now);
    const expectedConfirmation = buildPrismOperatorConfirmation({
      action,
      userId: command.userId,
      expiresAt: expiry,
      reason: command.reason,
      plannedAt,
      invitationWitness: locked.witness,
      databaseWitness: target.witness,
    });
    if (command.confirmation !== expectedConfirmation) {
      fail(
        "confirmation_mismatch",
        "The plan is stale or its action-specific confirmation token does not match.",
      );
    }
    // Both fingerprints share this transaction's snapshot, but our own writes
    // remain visible. This detects a trigger or future invitation-DML change
    // touching reconciliation without misclassifying a concurrent webhook.
    const before = await reconciliationFingerprint(client);
    let changed = false;
    if (action === "grant") {
      if (!expiry) fail("invalid_arguments", "Grant requires a bounded expiry.");
      if (locked.rowStatus === null) {
        const inserted = await client.query(
          `INSERT INTO product_flow_prism_stripe_invitations (
             environment, product_id, user_id, scope, status,
             invited_at, expires_at, revoked_at, created_at, updated_at
           ) VALUES ($1, $2, $3::UUID, $4, 'active',
             $5::TIMESTAMPTZ, $6::TIMESTAMPTZ, NULL,
             $5::TIMESTAMPTZ, $5::TIMESTAMPTZ)`,
          [
            PRISM_OPERATOR_ENVIRONMENT,
            PRISM_OPERATOR_PRODUCT_ID,
            command.userId,
            PRISM_OPERATOR_SCOPE,
            now,
            expiry,
          ],
        );
        if ((inserted.rowCount ?? 0) !== 1) {
          fail("write_invariant", "The invitation grant did not change exactly one row.");
        }
        changed = true;
      } else {
        const updated = await client.query(
          `UPDATE product_flow_prism_stripe_invitations
              SET status = 'active', invited_at = $5::TIMESTAMPTZ,
                  expires_at = $6::TIMESTAMPTZ, revoked_at = NULL,
                  updated_at = $5::TIMESTAMPTZ
            WHERE environment = $1 AND product_id = $2
              AND user_id = $3::UUID AND scope = $4`,
          [
            PRISM_OPERATOR_ENVIRONMENT,
            PRISM_OPERATOR_PRODUCT_ID,
            command.userId,
            PRISM_OPERATOR_SCOPE,
            now,
            expiry,
          ],
        );
        if ((updated.rowCount ?? 0) !== 1) {
          fail("write_invariant", "The invitation grant did not change exactly one row.");
        }
        changed = true;
      }
    } else {
      if (locked.rowStatus === null) fail("invitation_not_found", "No invitation exists to revoke.");
      if (locked.rowStatus === "active") {
        const updated = await client.query(
          `UPDATE product_flow_prism_stripe_invitations
              SET status = 'revoked', revoked_at = $5::TIMESTAMPTZ,
                  updated_at = $5::TIMESTAMPTZ
            WHERE environment = $1 AND product_id = $2
              AND user_id = $3::UUID AND scope = $4
              AND status = 'active'`,
          [
            PRISM_OPERATOR_ENVIRONMENT,
            PRISM_OPERATOR_PRODUCT_ID,
            command.userId,
            PRISM_OPERATOR_SCOPE,
            now,
          ],
        );
        if ((updated.rowCount ?? 0) !== 1) {
          fail("write_invariant", "The invitation revoke did not change exactly one row.");
        }
        changed = true;
      }
    }
    const after = await reconciliationFingerprint(client);
    if (before.fingerprint !== after.fingerprint) {
      fail(
        "reconciliation_changed",
        "The invitation write altered reconciliation state and was rolled back.",
      );
    }
    await client.query("COMMIT");
    return {
      ...commonOutput(command, target, true),
      changed,
      invitation: action === "grant" ? "active" : "revoked",
      ...(expiry ? { expires_at: expiry } : {}),
      reconciliation: publicReconciliation(after),
    };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // A lost COMMIT/ROLLBACK connection makes outcome uncertain. The CLI's
      // outer failure is deliberately generic and tells the operator to read.
    }
    throw error;
  }
}

export async function executePrismOperator(
  command: ParsedPrismOperatorCommand,
  target: PreparedPrismOperatorTarget,
  dependencies: PrismOperatorDependencies = {},
): Promise<Record<string, unknown>> {
  if (command.target !== target.target) {
    fail("target_mismatch", "The parsed action target does not match the prepared database target.");
  }
  const nowDate = dependencies.now?.() ?? new Date();
  const now = nowDate.toISOString();
  const pool = dependencies.pool ?? new Pool(target.poolConfig);
  const ownsPool = dependencies.pool === undefined;
  let client: PoolClient | null = null;
  try {
    client = await pool.connect();
    await verifyConnectedTarget(client, target);
    const isWrite = command.action === "grant" || command.action === "revoke";
    return isWrite
      ? await runWrite(client, command, target, now)
      : await runRead(client, command, target, now);
  } finally {
    client?.release();
    if (ownsPool) await pool.end();
  }
}

export function stringifySafePrismOperatorOutput(value: unknown): string {
  const json = JSON.stringify(value, null, 2);
  if (typeof json !== "string") {
    fail("unsafe_output", "PRISM operator output must be one JSON value.");
  }
  if (
    UUID_LEAK_PATTERN.test(json) ||
    EMAIL_LEAK_PATTERN.test(json) ||
    RAW_STRIPE_ID_PATTERN.test(json) ||
    STRIPE_SECRET_PATTERN.test(json)
  ) {
    fail("unsafe_output", "PRISM operator output failed its identifier leak guard.");
  }
  return json;
}

function readCaFile(path: string | null): string | null {
  if (path === null) return null;
  try {
    return readFileSync(path, "utf8");
  } catch {
    fail("unreadable_tls_ca", "The configured TLS CA file could not be read.");
  }
}

export async function main(
  argv: readonly string[] = process.argv.slice(2),
  environment: Readonly<Record<string, string | undefined>> = process.env,
): Promise<void> {
  const command = parsePrismOperatorCommand(argv, environment);
  const databaseUrl = environment.PRISM_OPERATOR_DATABASE_URL?.trim();
  if (!databaseUrl) {
    fail(
      "missing_database_url",
      "Set PRISM_OPERATOR_DATABASE_URL; generic database variables are not accepted.",
    );
  }
  const target = preparePrismOperatorTarget({
    databaseUrl,
    target: command.target,
    caPem: readCaFile(command.caFile),
    expectedProductionWitness:
      environment.PRISM_OPERATOR_PRODUCTION_TARGET_WITNESS?.trim() || null,
  });
  const output = await executePrismOperator(command, target);
  process.stdout.write(`${stringifySafePrismOperatorOutput(output)}\n`);
}

const isDirectExecution =
  typeof process.argv[1] === "string" &&
  pathToFileURL(process.argv[1]).href === import.meta.url;

if (isDirectExecution) {
  main().catch((error: unknown) => {
    const known = error instanceof PrismOperatorError;
    const payload = {
      schema: PRISM_OPERATOR_SCHEMA,
      ok: false,
      error: known ? error.code : "unexpected_error",
      message: known
        ? error.message
        : "Operator outcome is uncertain. Run read-only status before any retry.",
    };
    try {
      process.stderr.write(`${stringifySafePrismOperatorOutput(payload)}\n`);
    } catch {
      process.stderr.write(
        '{"schema":"cambridgetcg.prism-stripe-operator/1","ok":false,"error":"unsafe_error_output"}\n',
      );
    }
    process.exitCode = 1;
  });
}
