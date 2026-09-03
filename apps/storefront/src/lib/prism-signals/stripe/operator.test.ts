import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Pool, type PoolClient, type PoolConfig } from "pg";
import {
  PRISM_OPERATOR_MAX_INVITATION_MS,
  PRISM_OPERATOR_PLAN_TTL_MS,
  PrismOperatorError,
  buildPrismOperatorConfirmation,
  buildPrismOperatorInvitationWitness,
  executePrismOperator,
  parsePrismOperatorCommand,
  preparePrismOperatorTarget,
  stringifySafePrismOperatorOutput,
  type PrismOperatorPool,
} from "../../../../scripts/prism-stripe-operator";

const USER_ID = "5e77e82f-98da-4b84-886a-6d4400177346";
const OTHER_USER_ID = "ca719f68-2aa1-40ca-9d4b-86ad1f76306e";
const NOW = new Date("2026-09-03T20:00:00.000Z");
const EXPIRY = "2026-10-01T20:00:00.000Z";
const TEST_URL = "postgresql://operator@127.0.0.1:5432/prism_operator_test";
const TARGET = preparePrismOperatorTarget({
  databaseUrl: TEST_URL,
  target: "test",
});

const DUMMY_CA = "-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----";

function hash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function dummyProductionPin(
  databaseUrl = "postgresql://operator:secret@db.example:5432/prism_production?sslmode=no-verify",
): string {
  const url = new URL(databaseUrl);
  return `sha256:${hash(
    JSON.stringify({
      version: 1,
      target: "production",
      hostname: url.hostname.toLowerCase().replace(/\.$/, ""),
      port: url.port === "" ? 5432 : Number(url.port),
      database: decodeURIComponent(url.pathname.slice(1)),
      username: decodeURIComponent(url.username),
      ca_sha256: hash(DUMMY_CA),
    }),
  )}`;
}

function expectOperatorError(work: () => unknown, code: string): void {
  try {
    work();
  } catch (error) {
    expect(error).toBeInstanceOf(PrismOperatorError);
    expect((error as PrismOperatorError).code).toBe(code);
    return;
  }
  throw new Error(`Expected PRISM operator error ${code}.`);
}

describe("PRISM Stripe operator argument and target guards", () => {
  it("defaults to status but still requires an explicit target", () => {
    expect(parsePrismOperatorCommand(["--target", "test"], {})).toMatchObject({
      action: "status",
      target: "test",
      userId: null,
    });
    expect(
      parsePrismOperatorCommand(["--", "status", "--target", "test"], {}),
    ).toMatchObject({ action: "status", target: "test" });
    expectOperatorError(() => parsePrismOperatorCommand([], {}), "invalid_target");
  });

  it("requires exact UUID, canonical expiry, bounded reason, witness and confirmation syntax", () => {
    expectOperatorError(
      () =>
        parsePrismOperatorCommand(
          [
            "grant",
            "--target",
            "production",
            "--user-id",
            USER_ID.toUpperCase(),
            "--expires-at",
            EXPIRY,
            "--reason",
            "initial_sandbox_cohort",
            "--planned-at",
            NOW.toISOString(),
            "--database-witness",
            TARGET.witness,
            "--confirm",
            "PRISM_GRANT_000000000000000000000000",
          ],
          {},
        ),
      "invalid_user_id",
    );
    expectOperatorError(
      () =>
        parsePrismOperatorCommand(
          [
            "plan-grant",
            "--target",
            "test",
            "--user-id",
            USER_ID,
            "--expires-at",
            "2026-10-01T20:00:00Z",
            "--reason",
            "initial_sandbox_cohort",
          ],
          {},
        ),
      "invalid_expiry",
    );
    expectOperatorError(
      () =>
        parsePrismOperatorCommand(
          [
            "plan-revoke",
            "--target",
            "test",
            "--user-id",
            USER_ID,
            "--reason",
            "contains spaces",
          ],
          {},
        ),
      "invalid_reason",
    );
    expectOperatorError(
      () =>
        parsePrismOperatorCommand(
          [
            "grant",
            "--target",
            "test",
            "--user-id",
            USER_ID,
            "--expires-at",
            EXPIRY,
            "--reason",
            "initial_sandbox_cohort",
          ],
          {},
        ),
      "invalid_arguments",
    );
  });

  it("rejects email, scope, product and URL-shaped escape hatches as unknown options", () => {
    for (const option of ["--email", "--scope", "--product", "--url", "--live"]) {
      expectOperatorError(
        () => parsePrismOperatorCommand(["status", "--target", "test", option, "anything"], {}),
        "invalid_arguments",
      );
    }
  });

  it("permits only loopback *_test test targets and verified remote production targets", () => {
    for (const databaseUrl of [
      "postgresql://localhost/prism_operator",
      "postgresql://localhost.evil/prism_operator_test",
      "postgresql://127.0.0.2/prism_operator_test",
      "postgresql://localhost/prism_operator_test?host=evil.example",
    ]) {
      expect(() => preparePrismOperatorTarget({ databaseUrl, target: "test" })).toThrow();
    }
    expect(() =>
      preparePrismOperatorTarget({
        databaseUrl: "postgresql://db.example/prism_production",
        target: "production",
      }),
    ).toThrow(/PEM CA/);
    expect(() =>
      preparePrismOperatorTarget({
        databaseUrl: "postgresql://localhost/prism_production",
        target: "production",
        caPem: DUMMY_CA,
        expectedProductionWitness: "sha256:" + "0".repeat(64),
      }),
    ).toThrow(/cannot be local/);
    expect(() =>
      preparePrismOperatorTarget({
        databaseUrl: "postgresql://127.0.0.2/prism_production",
        target: "production",
        caPem: DUMMY_CA,
        expectedProductionWitness: "sha256:" + "0".repeat(64),
      }),
    ).toThrow(/cannot be local/);

    const productionUrl =
      "postgresql://operator:secret@db.example:5432/prism_production?sslmode=no-verify";
    expect(() =>
      preparePrismOperatorTarget({
        databaseUrl: productionUrl,
        target: "production",
        caPem: DUMMY_CA,
      }),
    ).toThrow(/independently provisioned/);
    expect(() =>
      preparePrismOperatorTarget({
        databaseUrl: productionUrl,
        target: "production",
        caPem: DUMMY_CA,
        expectedProductionWitness: "sha256:" + "0".repeat(64),
      }),
    ).toThrow(/does not match the pinned production target/);

    const production = preparePrismOperatorTarget({
      databaseUrl: productionUrl,
      target: "production",
      caPem: DUMMY_CA,
      expectedProductionWitness: dummyProductionPin(productionUrl),
    });
    expect(production.requiresTls).toBe(true);
    expect(production.witness).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(production.poolConfig).toMatchObject({
      host: "db.example",
      database: "prism_production",
      ssl: { rejectUnauthorized: true },
      options: "-c search_path=public",
    });
  });

  it("binds confirmations to action, UUID, reason, expiry and database witness", () => {
    const base = {
      action: "grant" as const,
      userId: USER_ID,
      expiresAt: EXPIRY,
      reason: "initial_sandbox_cohort",
      plannedAt: NOW.toISOString(),
      invitationWitness: buildPrismOperatorInvitationWitness(null),
      databaseWitness: TARGET.witness,
    };
    const token = buildPrismOperatorConfirmation(base);
    expect(token).toMatch(/^PRISM_GRANT_[0-9A-F]{24}$/);
    expect(buildPrismOperatorConfirmation({ ...base, userId: OTHER_USER_ID })).not.toBe(token);
    expect(buildPrismOperatorConfirmation({ ...base, reason: "second_sandbox_cohort" })).not.toBe(token);
    expect(
      buildPrismOperatorConfirmation({
        ...base,
        expiresAt: "2026-10-02T20:00:00.000Z",
      }),
    ).not.toBe(token);
    expect(
      buildPrismOperatorConfirmation({
        ...base,
        databaseWitness: `sha256:${"1".repeat(64)}`,
      }),
    ).not.toBe(token);
    expect(
      buildPrismOperatorConfirmation({
        ...base,
        invitationWitness: `sha256:${"2".repeat(64)}`,
      }),
    ).not.toBe(token);
    expect(
      buildPrismOperatorConfirmation({
        action: "revoke",
        userId: USER_ID,
        expiresAt: null,
        reason: base.reason,
        plannedAt: base.plannedAt,
        invitationWitness: base.invitationWitness,
        databaseWitness: base.databaseWitness,
      }),
    ).toMatch(/^PRISM_REVOKE_[0-9A-F]{24}$/);
    expectOperatorError(
      () =>
        buildPrismOperatorConfirmation({
          ...base,
          action: "revoke",
        }),
      "invalid_expiry",
    );
  });

  it("blocks UUIDs, email addresses and raw provider identifiers at the final output seam", () => {
    expectOperatorError(
      () => stringifySafePrismOperatorOutput({ user: USER_ID }),
      "unsafe_output",
    );
    expectOperatorError(
      () => stringifySafePrismOperatorOutput({ email: "person@example.com" }),
      "unsafe_output",
    );
    for (const providerId of [
      "cus_123456789",
      "sub_123456789",
      "evt_123456789",
      "price_123456789",
      "cs_test_123456789",
      "ch_123456789",
      "pm_123456789",
      "rk_test_123456789",
      "sk_live_123456789",
      "rk_live_123456789",
      "whsec_123456789",
      "tok_123456789",
      "card_123456789",
    ]) {
      expectOperatorError(
        () => stringifySafePrismOperatorOutput({ provider: providerId }),
        "unsafe_output",
      );
    }
    expect(stringifySafePrismOperatorOutput({ product_id: "prism-signals", count: 2 })).toContain(
      '"count": 2',
    );
  });
});

interface ScriptedClientOptions {
  readonly invitationStatus?: "active" | "revoked" | null;
  readonly mutateFingerprintAfterWrite?: boolean;
  readonly database?: string;
  readonly tls?: boolean;
}

function scriptedPool(options: ScriptedClientOptions = {}): Readonly<{
  pool: PrismOperatorPool;
  queries: Array<Readonly<{ text: string; values: readonly unknown[] }>>;
}> {
  const queries: Array<Readonly<{ text: string; values: readonly unknown[] }>> = [];
  let fingerprintReads = 0;
  const client = {
    query: vi.fn(async (text: string, values: readonly unknown[] = []) => {
      queries.push({ text, values });
      if (text.includes("current_database()::TEXT")) {
        return {
          rows: [
            {
              database: options.database ?? TARGET.database,
              tls: options.tls ?? false,
            },
          ],
          rowCount: 1,
        };
      }
      if (text.includes("AS fingerprint")) {
        fingerprintReads += 1;
        return {
          rows: [
            {
              required: 1,
              resolved: 2,
              required_full_refund: 1,
              required_refund_before_grant: 0,
              fingerprint:
                options.mutateFingerprintAfterWrite && fingerprintReads > 1
                  ? "b".repeat(32)
                  : "a".repeat(32),
            },
          ],
          rowCount: 1,
        };
      }
      if (text.includes("AS active") && text.includes("AS expired")) {
        return { rows: [{ active: 1, expired: 2, revoked: 3 }], rowCount: 1 };
      }
      if (text.includes("AS account_exists")) {
        return {
          rows: [
            options.invitationStatus
              ? {
                  account_exists: true,
                  status: options.invitationStatus,
                  invited_at: NOW,
                  expires_at: new Date(EXPIRY),
                  revoked_at:
                    options.invitationStatus === "revoked" ? NOW : null,
                  updated_at: NOW,
                }
              : {
                  account_exists: true,
                  status: null,
                  invited_at: null,
                  expires_at: null,
                  revoked_at: null,
                  updated_at: null,
                },
          ],
          rowCount: 1,
        };
      }
      if (text.startsWith("SELECT id FROM users")) {
        return { rows: [{ id: USER_ID }], rowCount: 1 };
      }
      if (text.includes("SELECT status") && text.includes("FOR UPDATE")) {
        return options.invitationStatus
          ? {
              rows: [
                {
                  status: options.invitationStatus,
                  invited_at: NOW,
                  expires_at: new Date(EXPIRY),
                  revoked_at:
                    options.invitationStatus === "revoked" ? NOW : null,
                  updated_at: NOW,
                },
              ],
              rowCount: 1,
            }
          : { rows: [], rowCount: 0 };
      }
      if (text.includes("INSERT INTO product_flow_prism_stripe_invitations")) {
        return { rows: [], rowCount: 1 };
      }
      if (text.includes("UPDATE product_flow_prism_stripe_invitations")) {
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: null };
    }),
    release: vi.fn(),
  } as unknown as PoolClient;
  return {
    pool: {
      connect: vi.fn(async () => client),
      end: vi.fn(async () => undefined),
    },
    queries,
  };
}

function commandWithConfirmation(
  action: "grant" | "revoke",
  reason = action === "grant" ? "initial_sandbox_cohort" : "operator_access_revoked",
  invitationStatus: "active" | "revoked" | null = null,
) {
  const expiresAt = action === "grant" ? EXPIRY : null;
  const invitationWitness = buildPrismOperatorInvitationWitness(
    invitationStatus
      ? {
          status: invitationStatus,
          invitedAt: NOW.toISOString(),
          expiresAt: EXPIRY,
          revokedAt: invitationStatus === "revoked" ? NOW.toISOString() : null,
          updatedAt: NOW.toISOString(),
        }
      : null,
  );
  const confirmation = buildPrismOperatorConfirmation({
    action,
    userId: USER_ID,
    expiresAt,
    reason,
    plannedAt: NOW.toISOString(),
    invitationWitness,
    databaseWitness: TARGET.witness,
  });
  return parsePrismOperatorCommand(
    [
      action,
      "--target",
      "test",
      "--user-id",
      USER_ID,
      ...(expiresAt ? ["--expires-at", expiresAt] : []),
      "--reason",
      reason,
      "--planned-at",
      NOW.toISOString(),
      "--database-witness",
      TARGET.witness,
      "--confirm",
      confirmation,
    ],
    {},
  );
}

describe("PRISM Stripe operator database boundary", () => {
  it("rejects a command/connection target mismatch before connecting", async () => {
    const productionCommand = parsePrismOperatorCommand(
      ["status", "--target", "production"],
      {},
    );
    const scripted = scriptedPool();
    await expect(
      executePrismOperator(productionCommand, TARGET, { pool: scripted.pool }),
    ).rejects.toMatchObject({ code: "target_mismatch" });
    expect(scripted.pool.connect).not.toHaveBeenCalled();
  });

  it("attests the connected production database name and TLS before a transaction", async () => {
    const productionUrl =
      "postgresql://operator:secret@db.example:5432/prism_production";
    const productionTarget = preparePrismOperatorTarget({
      databaseUrl: productionUrl,
      target: "production",
      caPem: DUMMY_CA,
      expectedProductionWitness: dummyProductionPin(productionUrl),
    });
    const command = parsePrismOperatorCommand(
      ["status", "--target", "production"],
      {},
    );
    const wrongDatabase = scriptedPool({ database: "other_production", tls: true });
    await expect(
      executePrismOperator(command, productionTarget, { pool: wrongDatabase.pool }),
    ).rejects.toMatchObject({ code: "database_witness_mismatch" });
    expect(wrongDatabase.queries.every(({ text }) => !text.startsWith("BEGIN"))).toBe(true);

    const noTls = scriptedPool({ database: productionTarget.database, tls: false });
    await expect(
      executePrismOperator(command, productionTarget, { pool: noTls.pool }),
    ).rejects.toMatchObject({ code: "tls_not_verified" });
    expect(noTls.queries.every(({ text }) => !text.startsWith("BEGIN"))).toBe(true);
  });

  it("keeps status and plan transactions read-only and emits no target UUID", async () => {
    const scripted = scriptedPool();
    const plan = parsePrismOperatorCommand(
      [
        "plan-grant",
        "--target",
        "test",
        "--user-id",
        USER_ID,
        "--expires-at",
        EXPIRY,
        "--reason",
        "initial_sandbox_cohort",
      ],
      {},
    );
    const output = await executePrismOperator(plan, TARGET, {
      pool: scripted.pool,
      now: () => NOW,
    });
    expect(output).toMatchObject({
      writes: false,
      planned_action: "grant",
      account: { exists: true, invitation: "none" },
      reconciliation: { required: 1, resolved: 2 },
    });
    expect(output.confirmation_token).toMatch(/^PRISM_GRANT_[0-9A-F]{24}$/);
    expect(stringifySafePrismOperatorOutput(output)).not.toContain(USER_ID);
    expect(scripted.queries.some(({ text }) => text.includes("READ ONLY"))).toBe(true);
    expect(
      scripted.queries.some(({ text }) => /\b(?:INSERT|UPDATE|DELETE)\b/.test(text)),
    ).toBe(false);
  });

  it("locks the exact account and invitation, and writes only the invitation table", async () => {
    const scripted = scriptedPool();
    const output = await executePrismOperator(commandWithConfirmation("grant"), TARGET, {
      pool: scripted.pool,
      now: () => NOW,
    });
    expect(output).toMatchObject({ writes: true, changed: true, invitation: "active" });
    const writeSql = scripted.queries
      .map(({ text }) => text)
      .filter((text) => /^\s*(?:INSERT|UPDATE|DELETE)\b/.test(text));
    expect(scripted.queries.some(({ text }) => text === "SELECT id FROM users WHERE id = $1::UUID FOR UPDATE")).toBe(true);
    expect(
      scripted.queries.some(
        ({ text }) => text.includes("product_flow_prism_stripe_invitations") && text.includes("FOR UPDATE"),
      ),
    ).toBe(true);
    expect(writeSql).toHaveLength(1);
    expect(writeSql[0]).toContain("product_flow_prism_stripe_invitations");
    expect(writeSql[0]).not.toContain("product_flow_stripe_subscriptions");
  });

  it("rolls back if invitation DML has a same-transaction reconciliation side effect", async () => {
    const scripted = scriptedPool({ mutateFingerprintAfterWrite: true });
    await expect(
      executePrismOperator(commandWithConfirmation("grant"), TARGET, {
        pool: scripted.pool,
        now: () => NOW,
      }),
    ).rejects.toMatchObject({ code: "reconciliation_changed" });
    expect(scripted.queries.at(-1)?.text).toBe("ROLLBACK");
    expect(scripted.queries.some(({ text }) => text === "COMMIT")).toBe(false);
  });

  it("rejects stale plans, overlong grants and mismatched locked-state confirmations", async () => {
    const overlong = new Date(NOW.valueOf() + PRISM_OPERATOR_MAX_INVITATION_MS + 1).toISOString();
    const overlongToken = buildPrismOperatorConfirmation({
      action: "grant",
      userId: USER_ID,
      expiresAt: overlong,
      reason: "initial_sandbox_cohort",
      plannedAt: NOW.toISOString(),
      invitationWitness: buildPrismOperatorInvitationWitness(null),
      databaseWitness: TARGET.witness,
    });
    const overlongCommand = parsePrismOperatorCommand(
      [
        "grant",
        "--target",
        "test",
        "--user-id",
        USER_ID,
        "--expires-at",
        overlong,
        "--reason",
        "initial_sandbox_cohort",
        "--planned-at",
        NOW.toISOString(),
        "--database-witness",
        TARGET.witness,
        "--confirm",
        overlongToken,
      ],
      {},
    );
    const first = scriptedPool();
    await expect(
      executePrismOperator(overlongCommand, TARGET, { pool: first.pool, now: () => NOW }),
    ).rejects.toMatchObject({ code: "expiry_out_of_bounds" });
    expect(first.queries.every(({ text }) => !text.startsWith("BEGIN"))).toBe(true);

    const mismatched = {
      ...commandWithConfirmation("grant"),
      confirmation: "PRISM_GRANT_000000000000000000000000",
    };
    const second = scriptedPool();
    await expect(
      executePrismOperator(mismatched, TARGET, { pool: second.pool, now: () => NOW }),
    ).rejects.toMatchObject({ code: "confirmation_mismatch" });
    expect(second.queries.some(({ text }) => text.startsWith("BEGIN"))).toBe(true);
    expect(second.queries.at(-1)?.text).toBe("ROLLBACK");

    const staleAt = new Date(NOW.valueOf() - PRISM_OPERATOR_PLAN_TTL_MS - 1).toISOString();
    const staleBase = commandWithConfirmation("grant");
    const staleToken = buildPrismOperatorConfirmation({
      action: "grant",
      userId: USER_ID,
      expiresAt: EXPIRY,
      reason: "initial_sandbox_cohort",
      plannedAt: staleAt,
      invitationWitness: buildPrismOperatorInvitationWitness(null),
      databaseWitness: TARGET.witness,
    });
    const staleCommand = {
      ...staleBase,
      plannedAt: staleAt,
      confirmation: staleToken,
    };
    const third = scriptedPool();
    await expect(
      executePrismOperator(staleCommand, TARGET, { pool: third.pool, now: () => NOW }),
    ).rejects.toMatchObject({ code: "stale_plan" });
    expect(third.queries.every(({ text }) => !text.startsWith("BEGIN"))).toBe(true);
  });
});

const OPERATOR_TEST_DATABASE_URL =
  process.env.PRISM_STRIPE_OPERATOR_TEST_DATABASE_URL?.trim();
const BASE_MIGRATION_SQL = readFileSync(
  new URL("../../../../drizzle/0135_product_flow_runtime.sql", import.meta.url),
  "utf8",
);
const STRIPE_MIGRATION_SQL = readFileSync(
  new URL("../../../../drizzle/0136_prism_stripe_sandbox.sql", import.meta.url),
  "utf8",
);
const describeDatabase = OPERATOR_TEST_DATABASE_URL ? describe.sequential : describe.skip;

describeDatabase("PRISM Stripe operator real PostgreSQL", () => {
  let setupPool: Pool | null = null;
  let operatorPool: Pool | null = null;
  let target: ReturnType<typeof preparePrismOperatorTarget>;
  let schemaName = "";
  let schema = "";
  const userId = randomUUID();

  beforeAll(async () => {
    target = preparePrismOperatorTarget({
      databaseUrl: OPERATOR_TEST_DATABASE_URL!,
      target: "test",
    });
    setupPool = new Pool(target.poolConfig);
    const witness = await setupPool.query<{ database: string }>(
      "SELECT current_database()::TEXT AS database",
    );
    if (witness.rows[0]?.database !== target.database || !target.database.endsWith("_test")) {
      throw new Error("The PRISM operator PostgreSQL witness is not the guarded _test target.");
    }
    schemaName = `prism_operator_it_${process.pid}_${randomUUID().replace(/-/g, "")}`;
    schema = `"${schemaName}"`;
    const setup = await setupPool.connect();
    try {
      await setup.query(`CREATE SCHEMA ${schema}`);
      await setup.query(`SET search_path TO ${schema}`);
      await setup.query("CREATE TABLE users (id UUID PRIMARY KEY)");
      await setup.query(BASE_MIGRATION_SQL);
      await setup.query(STRIPE_MIGRATION_SQL);
      await setup.query("INSERT INTO users (id) VALUES ($1)", [userId]);
    } finally {
      setup.release();
    }
    operatorPool = new Pool({
      ...target.poolConfig,
      options: `-c search_path=${schemaName}`,
    } as PoolConfig);
  }, 30_000);

  afterAll(async () => {
    try {
      if (operatorPool) await operatorPool.end();
      if (setupPool && schema) await setupPool.query(`DROP SCHEMA ${schema} CASCADE`);
    } finally {
      if (setupPool) await setupPool.end();
      operatorPool = null;
      setupPool = null;
    }
  }, 30_000);

  it("plans, grants, reports and revokes one UUID without changing reconciliation", async () => {
    if (!operatorPool || !setupPool) throw new Error("Operator integration pool is unavailable.");
    const expiry = new Date(NOW.valueOf() + 7 * 24 * 60 * 60 * 1_000).toISOString();
    const plan = parsePrismOperatorCommand(
      [
        "plan-grant",
        "--target",
        "test",
        "--user-id",
        userId,
        "--expires-at",
        expiry,
        "--reason",
        "integration_test_grant",
      ],
      {},
    );
    const planned = await executePrismOperator(plan, target, {
      pool: operatorPool,
      now: () => NOW,
    });
    const confirmation = String(planned.confirmation_token);
    const grant = parsePrismOperatorCommand(
      [
        "grant",
        "--target",
        "test",
        "--user-id",
        userId,
        "--expires-at",
        expiry,
        "--reason",
        "integration_test_grant",
        "--planned-at",
        String(planned.planned_at),
        "--database-witness",
        target.witness,
        "--confirm",
        confirmation,
      ],
      {},
    );
    const granted = await executePrismOperator(grant, target, {
      pool: operatorPool,
      now: () => NOW,
    });
    expect(granted).toMatchObject({ writes: true, changed: true, invitation: "active" });
    expect(stringifySafePrismOperatorOutput(granted)).not.toContain(userId);

    const stored = await setupPool.query<{
      status: string;
      environment: string;
      product_id: string;
      scope: string;
    }>(
      `SELECT status, environment, product_id, scope
         FROM ${schema}.product_flow_prism_stripe_invitations
        WHERE user_id = $1`,
      [userId],
    );
    expect(stored.rows).toEqual([
      {
        status: "active",
        environment: "test",
        product_id: "prism-signals",
        scope: "stripe_all_sandbox_v1",
      },
    ]);

    const statusCommand = parsePrismOperatorCommand(
      ["status", "--target", "test", "--user-id", userId],
      {},
    );
    const status = await executePrismOperator(statusCommand, target, {
      pool: operatorPool,
      now: () => NOW,
    });
    expect(status).toMatchObject({
      writes: false,
      account: { exists: true, invitation: "active" },
      reconciliation: { required: 0, resolved: 0 },
    });
    expect(stringifySafePrismOperatorOutput(status)).not.toContain(userId);

    const revokePlan = parsePrismOperatorCommand(
      [
        "plan-revoke",
        "--target",
        "test",
        "--user-id",
        userId,
        "--reason",
        "integration_test_revoke",
      ],
      {},
    );
    const revokePlanned = await executePrismOperator(revokePlan, target, {
      pool: operatorPool,
      now: () => NOW,
    });
    const revoke = parsePrismOperatorCommand(
      [
        "revoke",
        "--target",
        "test",
        "--user-id",
        userId,
        "--reason",
        "integration_test_revoke",
        "--planned-at",
        String(revokePlanned.planned_at),
        "--database-witness",
        target.witness,
        "--confirm",
        String(revokePlanned.confirmation_token),
      ],
      {},
    );
    const revoked = await executePrismOperator(revoke, target, {
      pool: operatorPool,
      now: () => NOW,
    });
    expect(revoked).toMatchObject({ writes: true, changed: true, invitation: "revoked" });
    await expect(
      executePrismOperator(grant, target, {
        pool: operatorPool,
        now: () => NOW,
      }),
    ).rejects.toMatchObject({ code: "confirmation_mismatch" });
    const final = await setupPool.query<{ status: string; reconciliation_count: number }>(
      `SELECT invitation.status,
              (SELECT COUNT(*)::INTEGER
                 FROM ${schema}.product_flow_stripe_subscriptions
                WHERE reconciliation_status IS NOT NULL) AS reconciliation_count
         FROM ${schema}.product_flow_prism_stripe_invitations invitation
        WHERE invitation.user_id = $1`,
      [userId],
    );
    expect(final.rows[0]).toEqual({ status: "revoked", reconciliation_count: 0 });
  }, 30_000);

  it("waits for the exact users row lock before granting", async () => {
    if (!operatorPool || !setupPool) throw new Error("Operator integration pool is unavailable.");
    const lockedUserId = randomUUID();
    const expiry = new Date(NOW.valueOf() + 24 * 60 * 60 * 1_000).toISOString();
    await setupPool.query(`INSERT INTO ${schema}.users (id) VALUES ($1)`, [lockedUserId]);
    const plan = parsePrismOperatorCommand(
      [
        "plan-grant",
        "--target",
        "test",
        "--user-id",
        lockedUserId,
        "--expires-at",
        expiry,
        "--reason",
        "integration_lock_test",
      ],
      {},
    );
    const planned = await executePrismOperator(plan, target, {
      pool: operatorPool,
      now: () => NOW,
    });
    const grant = parsePrismOperatorCommand(
      [
        "grant",
        "--target",
        "test",
        "--user-id",
        lockedUserId,
        "--expires-at",
        expiry,
        "--reason",
        "integration_lock_test",
        "--planned-at",
        String(planned.planned_at),
        "--database-witness",
        target.witness,
        "--confirm",
        String(planned.confirmation_token),
      ],
      {},
    );

    const locker = await setupPool.connect();
    let lockOpen = false;
    try {
      await locker.query("BEGIN");
      lockOpen = true;
      await locker.query(`SET LOCAL search_path TO ${schema}`);
      await locker.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [lockedUserId]);
      let settled = false;
      const pendingGrant = executePrismOperator(grant, target, {
        pool: operatorPool,
        now: () => NOW,
      }).then((value) => {
        settled = true;
        return value;
      });
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(settled).toBe(false);
      await locker.query("COMMIT");
      lockOpen = false;
      await expect(pendingGrant).resolves.toMatchObject({
        writes: true,
        changed: true,
        invitation: "active",
      });
    } finally {
      if (lockOpen) await locker.query("ROLLBACK");
      locker.release();
    }
  }, 30_000);
});
