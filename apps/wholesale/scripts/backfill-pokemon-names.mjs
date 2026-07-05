#!/usr/bin/env node
// Backfill cards.name_en for Pokémon from the shipped pokemon-tcg-api
// source module (packages/data-ingest — status "shipped", reader only;
// this script is its first writer).
//
// ── The matching truth (verified 2026-07-05 against the live API) ──────
//
// Prod pokemon cards are JAPANESE printings (set_code SV2A/S12A/SM8B…,
// card_number "011/165"). pokemontcg.io v2 is an ENGLISH-only catalog
// (its own docs: per-language printings live on regional sites). So a
// blind set+number join across the two would silently write wrong names.
// The honest bridge is the curated JP_TO_EN_SETS table below: one entry
// per JP set where a specific EN set mirrors it, with the verified
// number range where the mirror actually holds.
//
// Verified for SV2A ↔ sv3pt5 ("151", printedTotal 165) on 2026-07-05:
//   · Pokémon 001–151 mirror 1:1 in Kanto dex order
//     (001 フシギダネ=Bulbasaur ✓, 019 コラッタ=Rattata ✓)
//   · trainers 152–165 DIVERGE (JP 152 エネルギーシール vs EN 152
//     "Antique Dome Fossil"; JP 165 サイクリングロード vs EN 165
//     "Rigid Band") → excluded from the safe range
//   · secret rares >165 use different number spaces → excluded
// Mainline JP sets (SV3, SV8…) have NO EN number-mirror at all (EN
// releases merge + renumber JP waves), so they are deliberately absent.
// Extending coverage = verifying a new pair the same way and adding a row.
// For full JP-name coverage the right lane is TCGdex (sets.tcgdex_* are
// already 24/25 mapped in prod) — see docs/plans/game-expansion.md.
//
// ── Usage (tsx resolves the workspace TS module) ────────────────────────
//   cd apps/wholesale
//   pnpm exec tsx scripts/backfill-pokemon-names.mjs                 # DRY-RUN, prints match-rate
//   pnpm exec tsx scripts/backfill-pokemon-names.mjs --write         # apply (local)
//   pnpm exec tsx scripts/backfill-pokemon-names.mjs --set SV2A      # limit to one JP set
//   pnpm exec tsx scripts/backfill-pokemon-names.mjs --write --allow-prod --url "postgres://…"
//
// DATABASE_URL from env or --url; refuses non-localhost without --allow-prod.
// Optional POKEMON_TCG_API_KEY env (higher rate limit).
// Never overwrites a non-empty name_en; conflicts are reported, not fixed.

import postgres from "postgres";
import { pokemonTcgApi } from "@cambridge-tcg/data-ingest/pokemon-tcg-api";
import { guardDbUrl, argValue, argFlag } from "./lib/guard.mjs";

// ── Curated JP→EN set bridge (see header for the verification record) ───
const JP_TO_EN_SETS = {
  SV2A: {
    en_set_id: "sv3pt5", // "151"
    // Inclusive number range where JP and EN lists are the same card.
    match_min: 1,
    match_max: 151,
    verified:
      "2026-07-05 live sample: 001/019 mirror (Bulbasaur/Rattata); 152+165 diverge; secrets excluded",
  },
};

const write = argFlag("--write");
const onlySet = argValue("--set");
const { url, host, isLocal } = guardDbUrl(argValue("--url") || process.env.DATABASE_URL, {
  allowProd: argFlag("--allow-prod"),
});

const setCodes = Object.keys(JP_TO_EN_SETS).filter((s) => !onlySet || s === onlySet);
if (setCodes.length === 0) {
  console.error(
    `--set ${onlySet} has no JP→EN bridge entry. Bridged sets: ${Object.keys(JP_TO_EN_SETS).join(", ")}. ` +
      "Verify a mirror (see header) before adding one.",
  );
  process.exit(1);
}

console.log(`Target DB host: ${host} (${isLocal ? "local" : "REMOTE — --allow-prod given"})`);
console.log(write ? "WRITE mode." : "DRY-RUN (default) — pass --write to apply.");

const sql = postgres(url, { max: 1, idle_timeout: 10 });

/** Fetch the EN number→name map for one EN set via the shipped source module. */
async function fetchEnNames(enSetId, matchMin, matchMax) {
  const ctx = {
    pokemon_tcg: {
      q: `set.id:${enSetId}`,
      page_size: 250,
      api_key: process.env.POKEMON_TCG_API_KEY?.trim() || undefined,
    },
    on_event: (ev) => {
      if (ev.kind === "page" || ev.kind === "error") {
        console.log(`  [pokemon-tcg-api] ${ev.kind}: ${JSON.stringify(ev.detail)}`);
      }
    },
  };

  const byNumber = new Map(); // "001" → "Bulbasaur"
  let total = 0;
  for await (const row of pokemonTcgApi.read(ctx)) {
    total += 1;
    const norm = pokemonTcgApi.normalize(row.raw);
    if (!norm.ok) continue;
    const n = Number.parseInt(norm.record.number, 10);
    if (!Number.isInteger(n) || n < matchMin || n > matchMax) continue; // outside the verified mirror
    byNumber.set(norm.record.number, norm.record.name);
  }
  return { byNumber, total };
}

/** "011/165" → "011"; returns null when the shape isn't collector/total. */
function numberKey(cardNumber) {
  const before = String(cardNumber).split("/")[0].trim();
  if (!/^\d+$/.test(before)) return null;
  return before.padStart(3, "0");
}

async function main() {
  // sets.name_en does not exist today (verified prod + local 2026-07-05);
  // check instead of assuming so the script stays correct if it ever lands.
  const setNameEnCol = await sql`
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'sets' AND column_name = 'name_en'
  `;
  if (setNameEnCol.length === 0) {
    console.log("· sets has no name_en column — set-name backfill skipped (cards only).");
  }

  const totals = { cards: 0, matchable: 0, fill: 0, already: 0, conflict: 0, outOfRange: 0 };
  const updates = []; // { id, name }

  for (const setCode of setCodes) {
    const bridge = JP_TO_EN_SETS[setCode];
    console.log(`\n── ${setCode} ↔ ${bridge.en_set_id} (numbers ${bridge.match_min}–${bridge.match_max}) ──`);
    console.log(`   bridge verified: ${bridge.verified}`);

    const { byNumber, total: apiTotal } = await fetchEnNames(
      bridge.en_set_id,
      bridge.match_min,
      bridge.match_max,
    );
    console.log(`   EN catalog: ${apiTotal} cards fetched, ${byNumber.size} inside the verified range`);
    if (byNumber.size === 0) {
      console.log("   nothing usable from the API for this set — skipping.");
      continue;
    }

    const rows = await sql`
      SELECT c.id, c.card_number, c.name, c.name_en
        FROM cards c
        JOIN games g ON g.id = c.game_id
       WHERE g.code = 'pkm'
         AND c.set_code = ${setCode}
         AND c.category = 'singles'
    `;

    let fill = 0, already = 0, conflict = 0, outOfRange = 0;
    for (const r of rows) {
      const key = numberKey(r.card_number);
      const n = key === null ? NaN : Number.parseInt(key, 10);
      const enName =
        key !== null && n >= bridge.match_min && n <= bridge.match_max
          ? byNumber.get(key)
          : undefined;
      if (!enName) {
        outOfRange += 1;
        continue;
      }
      const current = (r.name_en ?? "").trim();
      if (current === "") {
        fill += 1;
        updates.push({ id: r.id, name: enName });
      } else if (current === enName) {
        already += 1;
      } else {
        conflict += 1;
        console.log(
          `   CONFLICT (left untouched): card id=${r.id} ${r.card_number} "${r.name}" ` +
            `has name_en="${current}", API says "${enName}"`,
        );
      }
    }

    const matchable = fill + already + conflict;
    totals.cards += rows.length;
    totals.matchable += matchable;
    totals.fill += fill;
    totals.already += already;
    totals.conflict += conflict;
    totals.outOfRange += outOfRange;

    console.log(
      `   DB rows: ${rows.length} | matched: ${matchable} ` +
        `(${rows.length ? ((100 * matchable) / rows.length).toFixed(1) : "0.0"}%) | ` +
        `would fill: ${fill} | already correct: ${already} | conflicts: ${conflict} | ` +
        `outside verified range (numbers >${bridge.match_max} incl. secrets/variants beyond it, or unparseable): ${outOfRange}`,
    );
  }

  console.log(
    `\nTOTAL — rows: ${totals.cards} | matched: ${totals.matchable} ` +
      `(${totals.cards ? ((100 * totals.matchable) / totals.cards).toFixed(1) : "0.0"}% of bridged sets) | ` +
      `to fill: ${totals.fill} | already: ${totals.already} | conflicts: ${totals.conflict} | out-of-range: ${totals.outOfRange}`,
  );

  if (!write) {
    console.log("\nDRY-RUN — nothing written. Re-run with --write to fill the blanks above.");
  } else if (updates.length === 0) {
    console.log("\nNothing to write.");
  } else {
    // One transaction; the WHERE re-checks emptiness so a concurrent
    // writer can't be overwritten (multi-statement write → transaction).
    await sql.begin(async (tx) => {
      for (const u of updates) {
        await tx`
          UPDATE cards SET name_en = ${u.name}
           WHERE id = ${u.id} AND (name_en IS NULL OR name_en = '')
        `;
      }
    });
    console.log(`\nWrote name_en for ${updates.length} card(s).`);
  }

  await sql.end();
}

main().catch(async (err) => {
  console.error(err);
  await sql.end();
  process.exit(1);
});
