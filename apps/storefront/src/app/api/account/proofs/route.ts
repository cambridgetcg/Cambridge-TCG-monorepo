import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";

const PRIVATE_NO_STORE = { "Cache-Control": "private, no-store" };

// Unified history of draw receipts linked to this user
// of. Merges bounty_pulls + verifiable_draws into a single feed with
// consistent shape so the /account/proofs page can render one list.
//
// Both sources expose commit-reveal + (eventually) Merkle digest refs,
// so the feed can link to /verify/pull/[id] or /verify/draw/[id]
// depending on the source.

interface Entry {
  kind: string;                  // 'bounty_pull' | 'pack_open' | 'spin_wheel' | ...
  id: string;                    // pull_id or draw_id
  verify_path: string;           // /verify/pull/[id] or /verify/draw/[id]
  subject_label: string | null;  // human-readable context (card name, pack title, etc)
  outcome_label: string | null;  // rolled rarity / picked key / winner label
  committed_at: string;
  revealed_at: string | null;
  merkle_digest_id: number | null;
  merkle_leaf_index: number | null;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Sign in required." },
      { status: 401, headers: PRIVATE_NO_STORE },
    );
  }
  const userId = session.user.id;

  // Bounty pulls. Join to vault_items so the feed shows the card name
  // rather than a bare UUID. Some pulls have no vault_item (no_stock
  // refund path) — fall back to rolled_rarity for those.
  const pulls = await query(
    `SELECT p.id, p.tier, p.rolled_rarity, p.committed_at, p.revealed_at,
            p.merkle_digest_id, p.merkle_leaf_index,
            v.card_name
       FROM bounty_pulls p
       LEFT JOIN vault_items v ON v.id = p.vault_item_id
      WHERE p.user_id = $1
      ORDER BY p.resolved_at DESC
      LIMIT 200`,
    [userId],
  );

  // Verifiable draws. subject_id is kind-specific but useful for the
  // user-facing label; leave it pass-through for now.
  const draws = await query(
    `SELECT id, kind, subject_id, outcome, committed_at, revealed_at,
            merkle_digest_id, merkle_leaf_index
       FROM verifiable_draws
      WHERE user_id = $1
      ORDER BY revealed_at DESC NULLS LAST
      LIMIT 200`,
    [userId],
  );

  const entries: Entry[] = [];

  for (const row of pulls.rows) {
    entries.push({
      kind: "bounty_pull",
      id: row.id,
      verify_path: `/verify/pull/${row.id}`,
      subject_label: row.card_name ?? null,
      outcome_label: row.rolled_rarity,
      committed_at: row.committed_at,
      revealed_at: row.revealed_at,
      merkle_digest_id: row.merkle_digest_id,
      merkle_leaf_index: row.merkle_leaf_index,
    });
  }

  for (const row of draws.rows) {
    const outcome = row.outcome as { picked?: string; slots?: Array<{ picked: string }> } | null;
    const outcomeLabel = !outcome
      ? null
      : outcome.slots
        ? `${outcome.slots.length} slot${outcome.slots.length === 1 ? "" : "s"}`
        : outcome.picked ?? null;
    entries.push({
      kind: row.kind,
      id: row.id,
      verify_path: `/verify/draw/${row.id}`,
      subject_label: row.subject_id,
      outcome_label: outcomeLabel,
      committed_at: row.committed_at,
      revealed_at: row.revealed_at,
      merkle_digest_id: row.merkle_digest_id,
      merkle_leaf_index: row.merkle_leaf_index,
    });
  }

  // Merge-sort by committed_at descending so a mixed feed is chronological.
  entries.sort((a, b) => new Date(b.committed_at).getTime() - new Date(a.committed_at).getTime());

  return NextResponse.json({ entries }, { headers: PRIVATE_NO_STORE });
}
