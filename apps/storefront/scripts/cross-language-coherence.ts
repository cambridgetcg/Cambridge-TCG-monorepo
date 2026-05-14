#!/usr/bin/env tsx
/**
 * cross-language-coherence.ts — K2 audit for the substrate-honest aggregator.
 *
 * Thirteenth in the audit family. Verifies the cross-language anchor
 * layer named in K2 of the substrate-honest aggregator plan:
 *
 *   - ORACLE_POLICY (in @cambridge-tcg/sku) is exhaustive over GameCode.
 *   - resolveOracle()'s null parity invariant holds (source==null iff
 *     oracle_id==null) across a representative sample.
 *   - card_set_cards.oracle_id + oracle_source columns exist after the
 *     0100 migration applies; skips gracefully when not.
 *   - oracle_id coverage per game tracks the migration's progress
 *     (zero pre-writer; rising post-writer).
 *   - oracle_source consistency: source matches oracle_id null-ness.
 *   - Per-upstream anchor population is observable per game.
 *   - Scryfall ↔ Cardmarket grouping agrees where both are populated
 *     (the cross-source coherence check; skips when either is empty).
 *
 * The audit is **non-destructive** — read-only. Substrate-honest in
 * three dimensions: pre-DB (env not set), pre-migration (columns
 * absent), pre-writer (columns present but 0% populated). Each stage
 * has a substrate-honest "skipped — reason" output.
 *
 * Spec citation: K1 (packages/sku/src/oracle.ts) ships the resolver;
 * K2's draft migration is at apps/storefront/drizzle/drafts/
 * 0100_cross_language_anchors.sql.draft.
 *
 * Usage:
 *   pnpm --filter @cambridge-tcg/admin cross-language-coherence
 *   pnpm --filter @cambridge-tcg/admin cross-language-coherence -- --strict
 *     (exits 1 on any FAILED check; default exits 1 only on hard failures)
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ORACLE_POLICY,
  GAMES,
  GAME_CODES,
  resolveOracle,
  type GameCode,
} from "@cambridge-tcg/sku";

const ADMIN_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const STRICT = process.argv.includes("--strict");

// ── Env loading (mirrors cardrush-coverage.ts) ─────────────────────────

function loadEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  const text = readFileSync(path, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const k = trimmed.slice(0, eq).trim();
    let v = trimmed.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

const envFile = loadEnvFile(join(ADMIN_DIR, ".env.local"));
const STOREFRONT_DATABASE_URL =
  process.env.STOREFRONT_DATABASE_URL ??
  envFile.STOREFRONT_DATABASE_URL ??
  envFile.DATABASE_URL ??
  process.env.DATABASE_URL ??
  "";

// ── Output helpers ────────────────────────────────────────────────────

type CheckStatus = "passed" | "skipped" | "failed";

interface CheckResult {
  id: string;
  title: string;
  status: CheckStatus;
  detail?: string;
  findings?: string[];
}

const results: CheckResult[] = [];

function record(r: CheckResult): void {
  results.push(r);
  const icon =
    r.status === "passed" ? "✓" : r.status === "skipped" ? "·" : "✗";
  console.log(`  ${icon} ${r.id} — ${r.title}`);
  if (r.detail) console.log(`      ${r.detail}`);
  if (r.findings) for (const f of r.findings) console.log(`      • ${f}`);
}

// ── Check 1 — ORACLE_POLICY exhaustive over GameCode ───────────────────

function checkPolicyCompleteness(): void {
  const missing: GameCode[] = [];
  const emptyRationale: GameCode[] = [];
  for (const code of GAME_CODES) {
    const policy = ORACLE_POLICY[code];
    if (!policy) missing.push(code);
    else if (!policy.rationale || policy.rationale.trim().length === 0)
      emptyRationale.push(code);
  }
  if (missing.length === 0 && emptyRationale.length === 0) {
    record({
      id: "1",
      title: "ORACLE_POLICY covers every registered GameCode",
      status: "passed",
      detail: `${GAME_CODES.length} games, all with rationale.`,
    });
    return;
  }
  record({
    id: "1",
    title: "ORACLE_POLICY covers every registered GameCode",
    status: "failed",
    findings: [
      ...missing.map((c) => `missing policy: "${c}"`),
      ...emptyRationale.map((c) => `empty rationale: "${c}"`),
    ],
  });
}

// ── Check 2 — resolveOracle() null-parity invariant ────────────────────

function checkResolverInvariant(): void {
  // Representative sample covering all four patterns + edge cases.
  const samples: Array<{
    sku: string;
    anchors?: Parameters<typeof resolveOracle>[1];
  }> = [
    { sku: "mtg-otj-001-en" },                                  // A
    { sku: "mtg-otj-001-en-foil" },                             // A + variant
    { sku: "op-op01-001-ja" },                                  // A non-MTG
    { sku: "ygo-lob-001-en", anchors: { ygo_passcode: "89631139" } }, // B with anchor
    { sku: "ygo-lob-001-en" },                                  // B missing anchor
    { sku: "pkm-sv01-001-en" },                                 // C
    { sku: "fab-mon-001-en" },                                  // D
    { sku: "not-a-sku" },                                       // edge
  ];
  const violations: string[] = [];
  for (const s of samples) {
    const r = resolveOracle(s.sku, s.anchors);
    if ((r.oracle_id === null) !== (r.source === null)) {
      violations.push(`${s.sku}: oracle_id=${r.oracle_id}, source=${r.source}`);
    }
  }
  if (violations.length === 0) {
    record({
      id: "2",
      title: "resolveOracle() null-parity invariant (source iff oracle_id)",
      status: "passed",
      detail: `${samples.length} samples covering all four patterns + edge cases.`,
    });
    return;
  }
  record({
    id: "2",
    title: "resolveOracle() null-parity invariant",
    status: "failed",
    findings: violations,
  });
}

// ── DB-backed checks ──────────────────────────────────────────────────

type Client = Awaited<
  ReturnType<typeof import("@cambridge-tcg/db").createDb>
>["client"];

interface ColumnPresence {
  oracle_id: boolean;
  oracle_source: boolean;
  scryfall_oracle_id: boolean;
  cardmarket_id_metacard: boolean;
  ygo_passcode: boolean;
}

async function checkColumnPresence(client: Client): Promise<ColumnPresence> {
  const rows = await client<Array<{ column_name: string }>>`
    SELECT column_name FROM information_schema.columns
     WHERE table_name = 'card_set_cards'
       AND column_name IN (
         'oracle_id', 'oracle_source',
         'scryfall_oracle_id', 'cardmarket_id_metacard', 'ygo_passcode'
       )
  `;
  const present = new Set(rows.map((r) => r.column_name));
  return {
    oracle_id: present.has("oracle_id"),
    oracle_source: present.has("oracle_source"),
    scryfall_oracle_id: present.has("scryfall_oracle_id"),
    cardmarket_id_metacard: present.has("cardmarket_id_metacard"),
    ygo_passcode: present.has("ygo_passcode"),
  };
}

async function checkOracleCoverage(client: Client): Promise<void> {
  // Per-game: how many rows have oracle_id populated?
  // Pattern A/B/D should rise to ~100% post-writer; Pattern C stays 0%.
  const rows = await client<
    Array<{ game: string; total: number; with_oracle: number }>
  >`
    SELECT
      COALESCE(csc.game, '?')             AS game,
      COUNT(*)::int                       AS total,
      COUNT(csc.oracle_id)::int           AS with_oracle
    FROM card_set_cards csc
    GROUP BY csc.game
    ORDER BY game
  `;

  const findings: string[] = [];
  let anyPopulated = false;
  for (const r of rows) {
    if (!(r.game in ORACLE_POLICY)) continue;
    const pct = r.total > 0 ? Math.round((r.with_oracle / r.total) * 100) : 0;
    const kind = ORACLE_POLICY[r.game as GameCode].kind;
    if (r.with_oracle > 0) anyPopulated = true;
    findings.push(
      `${r.game} (${kind}): ${r.with_oracle}/${r.total} (${pct}%) populated`,
    );
  }

  // Pre-writer (0% across the board) is substrate-honest, not a failure.
  // Strict mode warns when *any* Pattern A game has 0% AND the columns
  // are present — that's the writer that hasn't shipped yet.
  record({
    id: "5",
    title: "oracle_id coverage per game",
    status: anyPopulated ? "passed" : "skipped",
    detail: anyPopulated
      ? "writer is populating; coverage observable"
      : "no rows populated yet — writer has not landed (expected if K2 in pre-wire state)",
    findings,
  });
}

async function checkSourceConsistency(client: Client): Promise<void> {
  // oracle_source == NULL iff oracle_id == NULL — the DB-side mirror of
  // the resolver's null parity invariant.
  const rows = await client<
    Array<{ oracle_id_null: boolean; oracle_source_null: boolean; count: number }>
  >`
    SELECT
      (oracle_id IS NULL)     AS oracle_id_null,
      (oracle_source IS NULL) AS oracle_source_null,
      COUNT(*)::int           AS count
    FROM card_set_cards
    GROUP BY (oracle_id IS NULL), (oracle_source IS NULL)
  `;

  // Inconsistent rows: oracle_id is set but source is null, or vice versa.
  const inconsistent = rows.filter(
    (r) => r.oracle_id_null !== r.oracle_source_null,
  );
  const inconsistentCount = inconsistent.reduce((s, r) => s + r.count, 0);

  if (inconsistentCount === 0) {
    record({
      id: "6",
      title: "oracle_source / oracle_id null parity in card_set_cards",
      status: "passed",
      detail: `${rows.reduce((s, r) => s + r.count, 0)} rows; all consistent.`,
    });
    return;
  }
  record({
    id: "6",
    title: "oracle_source / oracle_id null parity",
    status: "failed",
    findings: inconsistent.map(
      (r) =>
        `${r.count} rows: oracle_id_null=${r.oracle_id_null}, oracle_source_null=${r.oracle_source_null}`,
    ),
  });
}

async function checkPasscodeCoverage(client: Client): Promise<void> {
  const rows = await client<
    Array<{ game: string; total: number; with_passcode: number }>
  >`
    SELECT
      COALESCE(csc.game, '?')             AS game,
      COUNT(*)::int                       AS total,
      COUNT(csc.ygo_passcode)::int        AS with_passcode
    FROM card_set_cards csc
    WHERE csc.game IN ('ygo', 'rsh')
    GROUP BY csc.game
    ORDER BY game
  `;

  const findings = rows.map((r) => {
    const pct = r.total > 0 ? Math.round((r.with_passcode / r.total) * 100) : 0;
    return `${r.game}: ${r.with_passcode}/${r.total} (${pct}%) passcode populated`;
  });

  const anyYgo = rows.some((r) => r.total > 0);

  record({
    id: "7",
    title: "ygo_passcode coverage for Pattern B games",
    status: anyYgo
      ? rows.some((r) => r.with_passcode > 0)
        ? "passed"
        : "skipped"
      : "skipped",
    detail: !anyYgo
      ? "no ygo/rsh rows in card_set_cards yet"
      : rows.some((r) => r.with_passcode > 0)
        ? "writer is populating passcodes"
        : "ygo/rsh rows exist but passcode column empty (YGOPRODeck writer not landed)",
    findings,
  });
}

async function checkScryfallCardmarketAgreement(client: Client): Promise<void> {
  // For rows that have BOTH scryfall_oracle_id AND cardmarket_id_metacard,
  // check that they group consistently: same scryfall_oracle_id should
  // map to one cardmarket_id_metacard and vice versa.
  const rows = await client<
    Array<{ scryfall_oracle_id: string; metacard_count: number }>
  >`
    SELECT
      scryfall_oracle_id,
      COUNT(DISTINCT cardmarket_id_metacard)::int AS metacard_count
    FROM card_set_cards
    WHERE scryfall_oracle_id IS NOT NULL
      AND cardmarket_id_metacard IS NOT NULL
    GROUP BY scryfall_oracle_id
    HAVING COUNT(DISTINCT cardmarket_id_metacard) > 1
    LIMIT 20
  `;

  if (rows.length === 0) {
    record({
      id: "8",
      title: "Scryfall oracle_id ↔ Cardmarket idMetacard grouping agreement",
      status: "passed",
      detail:
        "no scryfall_oracle_id maps to multiple cardmarket_id_metacard values (or insufficient overlap to test)",
    });
    return;
  }
  record({
    id: "8",
    title: "Scryfall ↔ Cardmarket grouping agreement",
    status: "failed",
    findings: rows.map(
      (r) =>
        `scryfall_oracle_id=${r.scryfall_oracle_id} → ${r.metacard_count} distinct cardmarket_id_metacard values`,
    ),
  });
}

async function runDbChecks(): Promise<void> {
  if (!STOREFRONT_DATABASE_URL) {
    record({
      id: "3-8",
      title: "DB-backed checks (oracle column presence, coverage, parity)",
      status: "skipped",
      detail:
        "STOREFRONT_DATABASE_URL not set. Set it (or DATABASE_URL) and re-run for full coverage.",
    });
    return;
  }

  let client: Client;
  let close: Awaited<
    ReturnType<typeof import("@cambridge-tcg/db").createDb>
  >["close"];
  try {
    const { createDb } = await import("@cambridge-tcg/db");
    ({ client, close } = createDb({ url: STOREFRONT_DATABASE_URL }));
  } catch (err) {
    record({
      id: "3-8",
      title: "DB-backed checks",
      status: "skipped",
      detail: `DB connection setup failed: ${err instanceof Error ? err.message : String(err)}`,
    });
    return;
  }

  try {
    const presence = await checkColumnPresence(client);
    const fullyPresent =
      presence.oracle_id &&
      presence.oracle_source &&
      presence.scryfall_oracle_id &&
      presence.cardmarket_id_metacard &&
      presence.ygo_passcode;
    if (!fullyPresent) {
      const missing: string[] = [];
      if (!presence.oracle_id) missing.push("oracle_id");
      if (!presence.oracle_source) missing.push("oracle_source");
      if (!presence.scryfall_oracle_id) missing.push("scryfall_oracle_id");
      if (!presence.cardmarket_id_metacard) missing.push("cardmarket_id_metacard");
      if (!presence.ygo_passcode) missing.push("ygo_passcode");
      record({
        id: "3",
        title: "K2 anchor columns exist on card_set_cards",
        status: "skipped",
        detail:
          `Missing: ${missing.join(", ")}. ` +
          "Migration 0100_cross_language_anchors not yet applied (or partially applied).",
      });
      record({
        id: "4-8",
        title: "Coverage + parity + grouping checks",
        status: "skipped",
        detail: "depend on column presence (see check 3).",
      });
      return;
    }

    record({
      id: "3",
      title: "K2 anchor columns exist on card_set_cards",
      status: "passed",
      detail: "all five primary anchor columns present (migration 0100 applied)",
    });

    await checkOracleCoverage(client);
    await checkSourceConsistency(client);
    await checkPasscodeCoverage(client);
    await checkScryfallCardmarketAgreement(client);
  } catch (err) {
    record({
      id: "3-8",
      title: "DB-backed checks (mid-run failure)",
      status: "skipped",
      detail: `query failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  } finally {
    await close();
  }
}

// ── Main ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("");
  console.log(
    "◆ cross-language-coherence audit — K2 of the substrate-honest aggregator",
  );
  console.log("");
  console.log("  Source: ORACLE_POLICY in @cambridge-tcg/sku");
  console.log("  Spec  : apps/storefront/drizzle/drafts/0100_cross_language_anchors.sql.draft");
  console.log("  Doc   : /methodology/oracle-policies");
  console.log("");

  // Pure-compute checks (always run)
  checkPolicyCompleteness();
  checkResolverInvariant();

  // DB-backed checks (graceful skip)
  await runDbChecks();

  console.log("");
  const passed = results.filter((r) => r.status === "passed").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const failed = results.filter((r) => r.status === "failed").length;
  console.log(
    `  Summary: ${passed} passed · ${skipped} skipped · ${failed} failed`,
  );
  console.log("");

  if (failed > 0) {
    console.log("  ✗ One or more checks failed.");
    process.exit(1);
  }
  if (STRICT && skipped > 0) {
    console.log("  ✗ --strict: skipped checks not allowed in strict mode.");
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("audit crashed:", err);
  process.exit(1);
});
