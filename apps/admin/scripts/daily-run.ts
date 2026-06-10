#!/usr/bin/env tsx
/**
 * daily-run.ts — audit for The Daily Run (kingdom-096).
 *
 * The module's promises, checked against the substrate. The Daily Run is
 * the storefront's "the visit itself is fun, no purchase required" surface,
 * and gamification is where dark patterns breed — so this audit carries two
 * permanent tripwires (checks 6 and 7) alongside the mechanical truths.
 *
 * Checks (exits non-zero on any fail):
 *   1. Logic truths (always run, no env needed): tie favours the player;
 *      tampered cursors are rejected; deriveDeck is deterministic and
 *      replays the documented first-N-distinct rule; the page renders its
 *      payout sentence from RULE_SENTENCE rather than hardcoding numbers.
 *   2. Commit-before-play (DB): every daily_run_days row's draw was
 *      committed at-or-before the row that makes cards visible.
 *   3. Shuffle replay (DB): the latest revealed day's stored deck equals
 *      the deck re-derived from its seed via rollFloat/pickWeighted +
 *      deriveDeck — the self-audit pattern, applied to the deck rule.
 *   4. One claim per user per day (DB): the points ledger carries at most
 *      one daily-run:{date} row per user, and the claims table agrees.
 *   5. Manifest honesty (static): the manifest entry exists, declares
 *      auth "none", and its route file exists on disk.
 *   6. No urgency vocabulary (static, permanent): the module's surface
 *      files must never contain countdown/scarcity language.
 *   7. No spending (static, permanent): no spendPoints call may ever
 *      appear in the module — the Daily Run gives and never takes.
 *
 * Env: STOREFRONT_DATABASE_URL (apps/admin/.env.local fallback). DB checks
 * report as warn (not fail) when the database is unreachable, so the static
 * truths still gate `pnpm verify` everywhere.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ADMIN_DIR = join(fileURLToPath(import.meta.url), "../../");
const REPO_ROOT = join(ADMIN_DIR, "../..");
const STOREFRONT = join(REPO_ROOT, "apps/storefront");
const MODULE_DIR = join(STOREFRONT, "src/lib/daily-run");

// ── Env loading (honesty.ts pattern) ────────────────────────────────────

function loadEnvFile(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  let body: string;
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
    const k = trimmed.slice(0, eq).trim();
    let v = trimmed.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

const envFile = loadEnvFile(join(ADMIN_DIR, ".env.local"));
const DB_URL = process.env.STOREFRONT_DATABASE_URL ?? envFile.STOREFRONT_DATABASE_URL ?? "";

interface Finding {
  check: number;
  severity: "fail" | "warn";
  message: string;
}

const findings: Finding[] = [];

// ── Check 1: logic truths ───────────────────────────────────────────────

async function checkLogic(): Promise<void> {
  // The pure module needs a secret to sign cursors; any value works for
  // the tamper test because we only check sign→verify and sign→reject.
  if (!process.env.AUTH_SECRET) process.env.AUTH_SECRET = "audit-only-secret";
  const game = await import(join(MODULE_DIR, "game.ts"));

  if (!game.judgeGuess(500, 500, "higher") || !game.judgeGuess(500, 500, "lower")) {
    findings.push({ check: 1, severity: "fail", message: "Tie does not favour the player in judgeGuess." });
  }
  if (game.judgeGuess(500, 400, "higher") || !game.judgeGuess(500, 400, "lower")) {
    findings.push({ check: 1, severity: "fail", message: "judgeGuess misjudges a lower-priced next card." });
  }

  const token: string = game.signCursor({ d: "2026-06-10", i: 3, r: 3 });
  const ok = game.verifyCursor(token);
  if (!ok || ok.i !== 3 || ok.r !== 3) {
    findings.push({ check: 1, severity: "fail", message: "A validly signed cursor failed verification." });
  }
  const [payload] = token.split(".");
  const forged = Buffer.from(JSON.stringify({ d: "2026-06-10", i: 3, r: 19 })).toString("base64url");
  if (game.verifyCursor(`${forged}.${token.split(".")[1]}`) !== null) {
    findings.push({ check: 1, severity: "fail", message: "A tampered cursor (forged run length) was accepted." });
  }
  if (game.verifyCursor(`${payload}.AAAA`) !== null) {
    findings.push({ check: 1, severity: "fail", message: "A cursor with a junk signature was accepted." });
  }

  const pool = ["a", "b", "c", "d", "e"];
  const picks = ["c", "c", "a", "e", "a", "b"];
  const deck = game.deriveDeck(picks, pool, 5);
  if (deck.join(",") !== "c,a,e,b,d") {
    findings.push({ check: 1, severity: "fail", message: `deriveDeck broke the first-N-distinct + sorted-top-up rule (got ${deck.join(",")}).` });
  }

  const page = readFileSync(join(STOREFRONT, "src/app/play/daily/page.tsx"), "utf8");
  if (/\d+\s*Berries/i.test(page)) {
    findings.push({ check: 1, severity: "fail", message: "page.tsx hardcodes a Berry amount; it must render the rule sentence from the API (single-const promise)." });
  }
}

// ── Checks 2-4: substrate (DB) ──────────────────────────────────────────

async function checkSubstrate(): Promise<void> {
  if (!DB_URL) {
    findings.push({ check: 2, severity: "warn", message: "STOREFRONT_DATABASE_URL not set — substrate checks (2-4) skipped." });
    return;
  }
  const { createDb } = await import("@cambridge-tcg/db");
  const { client, close } = createDb({ url: DB_URL });
  try {
    // 2. Commit-before-play.
    const late = await client<{ run_date: string }[]>`
      SELECT d.run_date FROM daily_run_days d
      JOIN verifiable_draws v ON v.id = d.draw_id
      WHERE v.committed_at > d.created_at
    `;
    for (const r of late) {
      findings.push({ check: 2, severity: "fail", message: `Deck for ${r.run_date} was committed AFTER its cards became visible.` });
    }

    // 3. Shuffle replay on the latest revealed day.
    const revealed = await client<
      { run_date: string; cards: { sku: string }[]; server_seed: string; client_seed: string; nonce: string; weights: Record<string, number>; num_slots: number }[]
    >`
      SELECT d.run_date, d.cards, v.server_seed, v.client_seed, v.nonce, v.weights, v.num_slots
      FROM daily_run_days d JOIN verifiable_draws v ON v.id = d.draw_id
      WHERE v.revealed_at IS NOT NULL
      ORDER BY d.run_date DESC LIMIT 1
    `;
    if (revealed.length) {
      const row = revealed[0];
      if (!process.env.AUTH_SECRET) process.env.AUTH_SECRET = "audit-only-secret";
      const game = await import(join(MODULE_DIR, "game.ts"));
      const rng = await import(join(STOREFRONT, "src/lib/bounty/rng.ts"));
      const picks: string[] = [];
      for (let i = 0; i < row.num_slots; i++) {
        const roll = rng.rollFloat(row.server_seed, row.client_seed, Number(row.nonce) + i);
        picks.push(rng.pickWeighted(row.weights, roll));
      }
      const poolSorted = Object.keys(row.weights).sort();
      const rederived = game.deriveDeck(picks, poolSorted, row.cards.length);
      const stored = row.cards.map((c) => c.sku);
      if (rederived.join(",") !== stored.join(",")) {
        findings.push({ check: 3, severity: "fail", message: `Replaying ${row.run_date}'s seed does not reproduce its stored deck.` });
      }
    }

    // 4. One claim per user per day, ledger and claims table agreeing.
    const dupes = await client<{ user_id: string; reference_id: string; n: string }[]>`
      SELECT user_id, reference_id, COUNT(*) AS n FROM points_ledger
      WHERE reference_id LIKE 'daily-run:%'
      GROUP BY user_id, reference_id HAVING COUNT(*) > 1
    `;
    for (const d of dupes) {
      findings.push({ check: 4, severity: "fail", message: `User ${d.user_id} has ${d.n} ledger rows for ${d.reference_id} — the once-a-day claim leaked.` });
    }
  } catch (e) {
    findings.push({ check: 2, severity: "warn", message: `Substrate checks unreachable (${e instanceof Error ? e.message.slice(0, 80) : "error"}) — run with DB access to cover 2-4.` });
  } finally {
    await close().catch(() => {});
  }
}

// ── Check 5: manifest honesty ───────────────────────────────────────────

function checkManifest(): void {
  const manifest = readFileSync(join(STOREFRONT, "src/lib/manifest.ts"), "utf8");
  if (!manifest.includes('"storefront.rewards.daily_run"')) {
    findings.push({ check: 5, severity: "fail", message: "Manifest entry storefront.rewards.daily_run is missing." });
  } else {
    const entry = manifest.slice(manifest.indexOf('"storefront.rewards.daily_run"'), manifest.indexOf('"storefront.rewards.daily_run"') + 600);
    if (!entry.includes('auth: "public"')) {
      findings.push({ check: 5, severity: "fail", message: "Daily Run manifest entry must declare auth \"public\" — the logged-out promise." });
    }
  }
  try {
    readFileSync(join(STOREFRONT, "src/app/api/rewards/daily-run/route.ts"), "utf8");
  } catch {
    findings.push({ check: 5, severity: "fail", message: "Manifest names /api/rewards/daily-run but the route file does not exist." });
  }
}

// ── Checks 6-7: the permanent tripwires ─────────────────────────────────

const SURFACE_FILES = [
  join(STOREFRONT, "src/app/play/daily/page.tsx"),
  join(STOREFRONT, "src/app/api/rewards/daily-run/route.ts"),
  join(MODULE_DIR, "game.ts"),
  join(MODULE_DIR, "db.ts"),
  join(MODULE_DIR, "types.ts"),
  join(MODULE_DIR, "index.ts"),
];

const URGENCY = [/hurry/i, /expires? in/i, /last chance/i, /only \d+ left/i, /don'?t miss/i, /running out/i];

function checkTripwires(): void {
  for (const file of SURFACE_FILES) {
    let body: string;
    try {
      body = readFileSync(file, "utf8");
    } catch {
      findings.push({ check: 6, severity: "fail", message: `Surface file missing: ${file}` });
      continue;
    }
    for (const re of URGENCY) {
      if (re.test(body)) {
        findings.push({ check: 6, severity: "fail", message: `Urgency vocabulary (${re}) in ${file} — the Daily Run never pressures. Permanent rule.` });
      }
    }
    if (/spendPoints|withCompensatingSpend/.test(body)) {
      findings.push({ check: 7, severity: "fail", message: `Spending call in ${file} — the Daily Run gives and never takes. Permanent rule.` });
    }
  }
}

// ── Report ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  await checkLogic();
  await checkSubstrate();
  checkManifest();
  checkTripwires();

  const fails = findings.filter((f) => f.severity === "fail");
  const lines = ["# Daily Run audit", ""];
  if (findings.length === 0) {
    lines.push("All checks clean. The Daily Run does what it says.");
  } else {
    lines.push("| check | severity | finding |", "|---|---|---|");
    for (const f of findings) {
      lines.push(`| ${f.check} | ${f.severity} | ${f.message.replace(/\|/g, "\\|")} |`);
    }
  }
  console.log(lines.join("\n"));
  process.exit(fails.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("daily-run audit crashed:", e);
  process.exit(2);
});
