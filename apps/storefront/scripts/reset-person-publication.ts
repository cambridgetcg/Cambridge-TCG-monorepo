#!/usr/bin/env tsx

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createCompatDb, type CompatQueryFn } from "@cambridge-tcg/db/compat";

const RESET_KEY = "initial-person-publication-reset";
const APPLY_CONFIRMATION = "APPLY-PERSON-PUBLICATION-RESET-20260711";
const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

type Mode = "preview" | "apply" | "reconcile";
type Counts = Record<string, number>;

function loadEnvFile(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  let body = "";
  try {
    body = readFileSync(path, "utf8");
  } catch {
    return out;
  }
  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function option(name: string): string | undefined {
  const exact = process.argv.indexOf(name);
  if (exact >= 0) return process.argv[exact + 1];
  const prefix = `${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function has(name: string): boolean {
  return process.argv.includes(name);
}

function mode(): Mode {
  const selected = (["--apply", "--reconcile"] as const).filter(has);
  if (selected.length > 1) {
    throw new Error("Choose only one of --apply or --reconcile.");
  }
  if (selected[0] === "--apply") return "apply";
  if (selected[0] === "--reconcile") return "reconcile";
  return "preview";
}

function parseCutoff(required: boolean): string {
  const raw = option("--legacy-before");
  if (!raw) {
    if (required) {
      throw new Error(
        "--legacy-before=<ISO timestamp captured before the gated deploy> is required.",
      );
    }
    return new Date().toISOString();
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) throw new Error("--legacy-before must be a valid timestamp.");
  if (date.getTime() > Date.now()) throw new Error("--legacy-before cannot be in the future.");
  return date.toISOString();
}

function number(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function rowCounts(row: Record<string, unknown> | undefined): Counts {
  return {
    user_profile_public: number(row?.user_profile_public),
    user_accepts_messages: number(row?.user_accepts_messages),
    activity_public: number(row?.activity_public),
    collective_member_public: number(row?.collective_member_public),
    trade_review_public: number(row?.trade_review_public),
    bounty_phone_unverified: number(row?.bounty_phone_unverified),
  };
}

async function assertSchemaReady(query: CompatQueryFn): Promise<void> {
  const result = await query(
    `SELECT
       to_regclass('privacy_publication_reset_20260711') IS NOT NULL AS has_ledger,
       to_regclass('privacy_publication_reset_20260711_runs') IS NOT NULL AS has_runs,
       to_regclass('user_bounty_eligibility') IS NOT NULL AS has_bounty_eligibility,
       (SELECT COUNT(*)::int FROM information_schema.columns
         WHERE table_schema=current_schema() AND table_name='users'
           AND column_name IN (
             'profile_publication_notice_version','profile_published_at',
             'messaging_notice_version','messaging_enabled_at'
           )) AS user_receipt_columns,
       (SELECT COUNT(*)::int FROM information_schema.columns
         WHERE table_schema=current_schema() AND table_name='trade_reviews'
           AND column_name IN ('publication_notice_version','published_at'))
         AS review_receipt_columns,
       (SELECT COUNT(*)::int FROM information_schema.columns
         WHERE table_schema=current_schema()
           AND (
             (table_name='users' AND column_name IN ('is_public','accepts_messages')
               AND LOWER(COALESCE(column_default, '')) IN (
                 'false','false::boolean','''false''::boolean'
               ))
             OR (table_name='activity_feed' AND column_name='is_public'
               AND LOWER(COALESCE(column_default, '')) IN (
                 'false','false::boolean','''false''::boolean'
               ))
             OR (table_name='collective_members' AND column_name='visibility'
               AND COALESCE(column_default, '') LIKE '''private''%')
             OR (table_name='trade_reviews' AND column_name='is_public'
               AND LOWER(COALESCE(column_default, '')) IN (
                 'false','false::boolean','''false''::boolean'
               ))
           )) AS private_defaults,
       (SELECT COUNT(*)::int FROM information_schema.columns
         WHERE table_schema=current_schema()
           AND table_name IN (
             'privacy_publication_reset_20260711',
             'privacy_publication_reset_20260711_runs'
           )
           AND column_name IN (
             'record_type','record_id','previous_value','captured_at',
             'reset_key','cutoff_at','completed_at','result_counts'
           )
           AND is_nullable='NO') AS ledger_required_columns,
       (SELECT COUNT(*)::int
          FROM pg_constraint pc
          JOIN pg_class rel ON rel.oid=pc.conrelid
          JOIN pg_namespace ns ON ns.oid=rel.relnamespace
         WHERE ns.nspname=current_schema()
           AND rel.relname IN (
             'privacy_publication_reset_20260711',
             'privacy_publication_reset_20260711_runs'
           )
           AND pc.contype='p') AS ledger_primary_keys`,
  );
  const row = result.rows[0] ?? {};
  if (
    row.has_ledger !== true ||
    row.has_runs !== true ||
    row.has_bounty_eligibility !== true ||
    number(row.user_receipt_columns) !== 4 ||
    number(row.review_receipt_columns) !== 2 ||
    number(row.private_defaults) !== 5 ||
    number(row.ledger_required_columns) !== 8 ||
    number(row.ledger_primary_keys) !== 2
  ) {
    throw new Error("Migration 0117 schema is not fully applied. No reset was attempted.");
  }
}

async function candidateCounts(query: CompatQueryFn, cutoff: string): Promise<Counts> {
  const result = await query(
    `SELECT
       (SELECT COUNT(*)::int FROM users
         WHERE created_at < $1 AND is_public=TRUE
           AND profile_publication_notice_version IS NULL
           AND profile_published_at IS NULL) AS user_profile_public,
       (SELECT COUNT(*)::int FROM users
         WHERE created_at < $1 AND accepts_messages=TRUE
           AND messaging_notice_version IS NULL
           AND messaging_enabled_at IS NULL) AS user_accepts_messages,
       (SELECT COUNT(*)::int FROM activity_feed
         WHERE created_at < $1 AND is_public=TRUE) AS activity_public,
       (SELECT COUNT(*)::int FROM collective_members
         WHERE invited_at < $1 AND visibility='public') AS collective_member_public,
       (SELECT COUNT(*)::int FROM trade_reviews
         WHERE created_at < $1 AND is_public=TRUE
           AND publication_notice_version IS NULL
           AND published_at IS NULL) AS trade_review_public,
       (SELECT COUNT(*)::int FROM user_bounty_eligibility
         WHERE phone_verified=TRUE)
         AS bounty_phone_unverified`,
    [cutoff],
  );
  return rowCounts(result.rows[0]);
}

async function runRecord(query: CompatQueryFn) {
  const result = await query(
    `SELECT reset_key, cutoff_at, completed_at, result_counts
       FROM privacy_publication_reset_20260711_runs
      WHERE reset_key=$1`,
    [RESET_KEY],
  );
  return result.rows[0] ?? null;
}

async function ledgerCounts(query: CompatQueryFn): Promise<Counts> {
  const result = await query(
    `SELECT record_type, COUNT(*)::int AS n
       FROM privacy_publication_reset_20260711
      GROUP BY record_type`,
  );
  const counts = rowCounts(undefined);
  for (const row of result.rows) counts[String(row.record_type)] = number(row.n);
  return counts;
}

async function lockResetTables(query: CompatQueryFn): Promise<void> {
  await query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [RESET_KEY]);
  await query(
    `LOCK TABLE users, activity_feed, collective_members, trade_reviews,
                user_bounty_eligibility
       IN SHARE ROW EXCLUSIVE MODE`,
  );
}

async function applyReset(
  transaction: <T>(fn: (query: CompatQueryFn) => Promise<T>) => Promise<T>,
  cutoff: string,
) {
  return transaction(async (query) => {
    await lockResetTables(query);
    const existing = await runRecord(query);
    if (existing) return { alreadyApplied: true, record: existing };

    const orphanLedger = await query(
      `SELECT COUNT(*)::int AS n FROM privacy_publication_reset_20260711`,
    );
    if (number(orphanLedger.rows[0]?.n) > 0) {
      throw new Error(
        "Audit ledger has rows without a completed run marker. Reconcile before retrying.",
      );
    }

    const captured: Counts = {};
    const capture = async (sql: string, params: unknown[]) => {
      const result = await query(sql, params);
      return result.rowCount;
    };

    captured.user_profile_public = await capture(
      `INSERT INTO privacy_publication_reset_20260711
         (record_type, record_id, previous_value)
       SELECT 'user_profile_public', id::text, is_public::text
         FROM users
        WHERE created_at < $1 AND is_public=TRUE
          AND profile_publication_notice_version IS NULL
          AND profile_published_at IS NULL`,
      [cutoff],
    );
    captured.user_accepts_messages = await capture(
      `INSERT INTO privacy_publication_reset_20260711
         (record_type, record_id, previous_value)
       SELECT 'user_accepts_messages', id::text, accepts_messages::text
         FROM users
        WHERE created_at < $1 AND accepts_messages=TRUE
          AND messaging_notice_version IS NULL
          AND messaging_enabled_at IS NULL`,
      [cutoff],
    );
    captured.activity_public = await capture(
      `INSERT INTO privacy_publication_reset_20260711
         (record_type, record_id, previous_value)
       SELECT 'activity_public', id::text, is_public::text
         FROM activity_feed
        WHERE created_at < $1 AND is_public=TRUE`,
      [cutoff],
    );
    captured.collective_member_public = await capture(
      `INSERT INTO privacy_publication_reset_20260711
         (record_type, record_id, previous_value)
       SELECT 'collective_member_public', collective_id::text || ':' || user_id::text,
              visibility
         FROM collective_members
        WHERE invited_at < $1 AND visibility='public'`,
      [cutoff],
    );
    captured.trade_review_public = await capture(
      `INSERT INTO privacy_publication_reset_20260711
         (record_type, record_id, previous_value)
       SELECT 'trade_review_public', id::text, is_public::text
         FROM trade_reviews
        WHERE created_at < $1 AND is_public=TRUE
          AND publication_notice_version IS NULL
          AND published_at IS NULL`,
      [cutoff],
    );
    captured.bounty_phone_unverified = await capture(
      `INSERT INTO privacy_publication_reset_20260711
         (record_type, record_id, previous_value)
       SELECT 'bounty_phone_unverified', user_id::text, phone_verified::text
         FROM user_bounty_eligibility
        WHERE phone_verified=TRUE`,
      [],
    );

    const updated: Counts = {};
    updated.user_profile_public = (
      await query(
        `UPDATE users SET is_public=FALSE
          WHERE created_at < $1 AND is_public=TRUE
            AND profile_publication_notice_version IS NULL
            AND profile_published_at IS NULL`,
        [cutoff],
      )
    ).rowCount;
    updated.user_accepts_messages = (
      await query(
        `UPDATE users SET accepts_messages=FALSE
          WHERE created_at < $1 AND accepts_messages=TRUE
            AND messaging_notice_version IS NULL
            AND messaging_enabled_at IS NULL`,
        [cutoff],
      )
    ).rowCount;
    updated.activity_public = (
      await query(
        `UPDATE activity_feed SET is_public=FALSE
          WHERE created_at < $1 AND is_public=TRUE`,
        [cutoff],
      )
    ).rowCount;
    updated.collective_member_public = (
      await query(
        `UPDATE collective_members SET visibility='private'
          WHERE invited_at < $1 AND visibility='public'`,
        [cutoff],
      )
    ).rowCount;
    updated.trade_review_public = (
      await query(
        `UPDATE trade_reviews SET is_public=FALSE
          WHERE created_at < $1 AND is_public=TRUE
            AND publication_notice_version IS NULL
            AND published_at IS NULL`,
        [cutoff],
      )
    ).rowCount;
    updated.bounty_phone_unverified = (
      await query(
        `UPDATE user_bounty_eligibility
            SET phone_verified=FALSE,
                phone_verified_at=NULL,
                updated_at=NOW()
          WHERE phone_verified=TRUE`,
        [],
      )
    ).rowCount;

    for (const key of Object.keys(captured)) {
      if (captured[key] !== updated[key]) {
        throw new Error(`Reset count mismatch for ${key}; transaction rolled back.`);
      }
    }

    await query(
      `INSERT INTO privacy_publication_reset_20260711_runs
         (reset_key, cutoff_at, result_counts)
       VALUES ($1, $2, $3::jsonb)`,
      [RESET_KEY, cutoff, JSON.stringify(updated)],
    );
    return { alreadyApplied: false, counts: updated };
  });
}

async function reconciliation(query: CompatQueryFn) {
  const record = await runRecord(query);
  const ledger = await ledgerCounts(query);
  const checks = await query(
    `SELECT
       (SELECT COUNT(*)::int
          FROM privacy_publication_reset_20260711 l
          JOIN users u ON u.id::text=l.record_id
         WHERE l.record_type='user_profile_public' AND u.is_public=FALSE
           AND u.profile_publication_notice_version IS NULL
           AND u.profile_published_at IS NULL) AS user_profile_public,
       (SELECT COUNT(*)::int
          FROM privacy_publication_reset_20260711 l
          JOIN users u ON u.id::text=l.record_id
         WHERE l.record_type='user_accepts_messages' AND u.accepts_messages=FALSE
           AND u.messaging_notice_version IS NULL
           AND u.messaging_enabled_at IS NULL) AS user_accepts_messages,
       (SELECT COUNT(*)::int
          FROM privacy_publication_reset_20260711 l
          JOIN activity_feed a ON a.id::text=l.record_id
         WHERE l.record_type='activity_public' AND a.is_public=FALSE) AS activity_public,
       (SELECT COUNT(*)::int
          FROM privacy_publication_reset_20260711 l
          JOIN collective_members cm
            ON cm.collective_id::text || ':' || cm.user_id::text=l.record_id
         WHERE l.record_type='collective_member_public' AND cm.visibility='private')
           AS collective_member_public,
       (SELECT COUNT(*)::int
          FROM privacy_publication_reset_20260711 l
          JOIN trade_reviews r ON r.id::text=l.record_id
         WHERE l.record_type='trade_review_public' AND r.is_public=FALSE
           AND r.publication_notice_version IS NULL
           AND r.published_at IS NULL) AS trade_review_public,
       (SELECT COUNT(*)::int
          FROM privacy_publication_reset_20260711 l
          JOIN user_bounty_eligibility b ON b.user_id::text=l.record_id
         WHERE l.record_type='bounty_phone_unverified'
           AND b.phone_verified=FALSE
           AND b.phone_verified_at IS NULL) AS bounty_phone_unverified`,
  );
  const stillReset = rowCounts(checks.rows[0]);
  const changedSinceReset = Object.fromEntries(
    Object.keys(ledger).map((key) => [key, Math.max(0, ledger[key] - stillReset[key])]),
  );
  return { record, ledger, still_reset: stillReset, changed_since_reset: changedSinceReset };
}

function print(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

async function main(): Promise<void> {
  const selectedMode = mode();
  const env = loadEnvFile(join(APP_DIR, ".env.local"));
  const databaseUrl =
    process.env.STOREFRONT_DATABASE_URL ??
    process.env.DATABASE_URL ??
    env.STOREFRONT_DATABASE_URL ??
    env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("Set STOREFRONT_DATABASE_URL or DATABASE_URL. No connection was attempted.");
  }

  const caFile = option("--ca-file") ?? process.env.PGSSLROOTCERT;
  if (!caFile) {
    throw new Error(
      "Verified TLS is required. Set --ca-file=<RDS CA PEM> or PGSSLROOTCERT. No connection was attempted.",
    );
  }
  const ca = readFileSync(caFile, "utf8");
  if (!ca.includes("-----BEGIN CERTIFICATE-----")) {
    throw new Error(`CA file does not contain a PEM certificate: ${caFile}`);
  }

  const { query, transaction, close } = createCompatDb({
    url: databaseUrl,
    max: 1,
    // postgres.js accepts Node TLS options; the shared compatibility type names only string modes.
    // @ts-expect-error Pass the verified CA object through to postgres.js.
    ssl: { ca, rejectUnauthorized: true },
  });
  try {
    await assertSchemaReady(query);

    if (selectedMode === "preview") {
      const cutoff = parseCutoff(false);
      print({
        mode: "preview",
        writes: false,
        cutoff,
        candidates: await candidateCounts(query, cutoff),
        run: await runRecord(query),
        ledger: await ledgerCounts(query),
      });
      return;
    }

    if (selectedMode === "reconcile") {
      print({ mode: "reconcile", writes: false, ...(await reconciliation(query)) });
      return;
    }

    if (!has("--gated-app-live")) {
      throw new Error("--gated-app-live is required; deploy and probe the gated app first.");
    }
    if (option("--confirm") !== APPLY_CONFIRMATION) {
      throw new Error(`Apply requires --confirm=${APPLY_CONFIRMATION}.`);
    }
    const cutoff = parseCutoff(true);
    print({ mode: "apply", cutoff, ...(await applyReset(transaction, cutoff)) });
  } finally {
    await close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
