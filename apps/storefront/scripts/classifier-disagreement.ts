#!/usr/bin/env tsx
// Module-scope marker — keeps `main` from leaking into the global scope
// and colliding with main() in sibling scripts (TS2393).
export {};

/**
 * classifier-disagreement.ts — drift detector for the layered card
 * classification system (kingdom-089).
 *
 * Sixteenth in the audit family. The classifier writes one row to
 * card_classification_log for every claim that has ever been made about
 * a card's edition_variant or promo_origin. Lower-priority claims are
 * stored with shadowed=true. This audit reports those.
 *
 * The premise: a heuristic that disagrees with a publisher feed is the
 * most useful single signal for improving the heuristic. Throwing the
 * shadowed claim away would mean the next iteration starts blind.
 * Keeping it means the audit can name exactly which (game, subdomain,
 * heuristic-rule) needs revisiting.
 *
 * ── Five checks ──────────────────────────────────────────────────────
 *
 *   1. Total claim count by attribute × source.
 *      Gives a one-glance picture of the substrate's classification
 *      activity to date.
 *
 *   2. Shadowed claims by attribute × (winning source vs shadowed
 *      source). The "heuristic-said-X-but-publisher-said-Y" matrix.
 *
 *   3. Top shadowing actors — which heuristic rules / which operators
 *      most often disagree with the current winner. Substrate-honest
 *      about which classifier needs work.
 *
 *   4. Stale low-confidence heuristic winners — rows where the
 *      heuristic claim has been winning for > 30 days without an
 *      operator override or publisher confirmation, AND the heuristic
 *      declared low confidence. Candidates for operator review.
 *
 *   5. Active claims summary — count of cards with a non-default
 *      value per attribute, grouped by source. The proxy for
 *      classification coverage.
 *
 * ── Behaviour on missing substrate ──────────────────────────────────
 *
 * If the wholesale RDS is unreachable, the migration hasn't been
 * applied, or the card_classification_log table doesn't exist yet, this
 * audit gracefully skips with an informational message and exits 0 —
 * same pattern as cardrush-coverage / sets-coverage.
 */

const WHOLESALE_DATABASE_URL = process.env.WHOLESALE_DATABASE_URL ?? "";

async function main() {
  console.log("─".repeat(72));
  console.log("classifier-disagreement audit (kingdom-089)");
  console.log("─".repeat(72));
  console.log("");

  if (!WHOLESALE_DATABASE_URL) {
    console.log("  Skipped — WHOLESALE_DATABASE_URL not set in environment.");
    console.log("  This audit reads from the wholesale RDS; set the env var");
    console.log("  to enable it. See apps/admin/CLAUDE.md.");
    console.log("");
    return;
  }

  let client: Awaited<
    ReturnType<typeof import("@cambridge-tcg/db").createDb>
  >["client"];
  let close: Awaited<
    ReturnType<typeof import("@cambridge-tcg/db").createDb>
  >["close"];
  try {
    const { createDb } = await import("@cambridge-tcg/db");
    ({ client, close } = createDb({ url: WHOLESALE_DATABASE_URL }));
  } catch (err) {
    console.log(
      `  Skipped — DB setup failed (${err instanceof Error ? err.message : String(err)}).`,
    );
    console.log("");
    return;
  }

  try {
    // Does the table exist? Kingdom-087 migration may not have been applied yet.
    const tableCheck = await client<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'card_classification_log'
      ) AS exists
    `;
    if (!tableCheck[0]?.exists) {
      console.log("  Skipped — card_classification_log table does not exist.");
      console.log(
        "  Promote and apply apps/wholesale/drizzle/drafts/0018_card_financial_attributes.sql.draft",
      );
      console.log("  to enable this audit.");
      console.log("");
      await close();
      return;
    }

    // ── Check 1: total claims by attribute × source ──────────────────
    console.log("Check 1: total claims by attribute × source");
    console.log("─".repeat(72));
    const byAttrSource = await client<
      Array<{
        attribute: string;
        next_source: string;
        count: number;
      }>
    >`
      SELECT attribute, next_source, COUNT(*)::int AS count
      FROM card_classification_log
      GROUP BY attribute, next_source
      ORDER BY attribute, next_source
    `;
    if (byAttrSource.length === 0) {
      console.log("  (no claims recorded yet)");
    } else {
      for (const row of byAttrSource) {
        console.log(
          `  ${row.attribute.padEnd(18)} ${row.next_source.padEnd(12)} ${row.count.toLocaleString()}`,
        );
      }
    }
    console.log("");

    // ── Check 2: shadowed claims matrix ──────────────────────────────
    console.log(
      "Check 2: shadowed claims — winning source vs shadowed source",
    );
    console.log("─".repeat(72));
    const shadowMatrix = await client<
      Array<{
        attribute: string;
        winning_source: string;
        shadowed_source: string;
        count: number;
      }>
    >`
      SELECT attribute,
             prev_source AS winning_source,
             next_source AS shadowed_source,
             COUNT(*)::int AS count
      FROM card_classification_log
      WHERE shadowed = true
      GROUP BY attribute, prev_source, next_source
      ORDER BY attribute, count DESC
    `;
    if (shadowMatrix.length === 0) {
      console.log("  (no shadowed claims — every claim has so far promoted)");
    } else {
      for (const row of shadowMatrix) {
        console.log(
          `  ${row.attribute.padEnd(18)} ${row.winning_source.padEnd(10)} > ${row.shadowed_source.padEnd(10)} ${row.count.toLocaleString()}`,
        );
      }
    }
    console.log("");

    // ── Check 3: top shadowing actors ────────────────────────────────
    console.log("Check 3: top shadowing actors (most disagreement-events)");
    console.log("─".repeat(72));
    const topActors = await client<
      Array<{ claimed_by: string; attribute: string; count: number }>
    >`
      SELECT claimed_by, attribute, COUNT(*)::int AS count
      FROM card_classification_log
      WHERE shadowed = true
      GROUP BY claimed_by, attribute
      ORDER BY count DESC
      LIMIT 10
    `;
    if (topActors.length === 0) {
      console.log("  (no shadowed claims yet)");
    } else {
      for (const row of topActors) {
        console.log(
          `  ${row.claimed_by.padEnd(40)} ${row.attribute.padEnd(18)} ${row.count.toLocaleString()}`,
        );
      }
    }
    console.log("");

    // ── Check 4: stale low-confidence heuristic winners ──────────────
    console.log(
      "Check 4: stale low-confidence heuristic winners (>30d, no override)",
    );
    console.log("─".repeat(72));
    const stale = await client<
      Array<{ attribute: string; count: number }>
    >`
      SELECT c.attribute, COUNT(*)::int AS count
      FROM (
        SELECT DISTINCT ON (card_id, attribute)
          card_id, attribute, next_source, confidence, claimed_at, shadowed, superseded_at
        FROM card_classification_log
        ORDER BY card_id, attribute, claimed_at DESC
      ) c
      WHERE c.next_source = 'heuristic'
        AND c.confidence = 'low'
        AND c.shadowed = false
        AND c.superseded_at IS NULL
        AND c.claimed_at < now() - INTERVAL '30 days'
      GROUP BY c.attribute
      ORDER BY c.attribute
    `;
    if (stale.length === 0) {
      console.log("  (no stale low-confidence heuristic winners)");
    } else {
      for (const row of stale) {
        console.log(
          `  ${row.attribute.padEnd(18)} ${row.count.toLocaleString()} candidate(s) for operator review`,
        );
      }
    }
    console.log("");

    // ── Check 5: active-claim coverage on cards ──────────────────────
    console.log("Check 5: active classification coverage on cards");
    console.log("─".repeat(72));
    const coverage = await client<
      Array<{
        attribute: string;
        source: string;
        count: number;
      }>
    >`
      SELECT 'edition_variant' AS attribute,
             edition_variant_source AS source,
             COUNT(*)::int AS count
      FROM cards
      GROUP BY edition_variant_source
      UNION ALL
      SELECT 'promo_origin' AS attribute,
             promo_origin_source AS source,
             COUNT(*)::int AS count
      FROM cards
      GROUP BY promo_origin_source
      ORDER BY attribute, source
    `;
    if (coverage.length === 0) {
      console.log("  (no rows in cards)");
    } else {
      for (const row of coverage) {
        console.log(
          `  ${row.attribute.padEnd(18)} ${row.source.padEnd(12)} ${row.count.toLocaleString()}`,
        );
      }
    }
    console.log("");

    console.log("─".repeat(72));
    console.log(
      "audit complete — exit 0 (informational; this audit reports, doesn't fail)",
    );
    console.log("─".repeat(72));
  } finally {
    await close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
