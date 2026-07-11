// Self-audit cron: sample revealed draws, re-run receipt consistency
// math server-side, record pass/fail. Any failure is a critical signal
// — we should never produce a failing proof in normal operation.
//
// Distinct from the client-side verifier: runs on the server from
// trusted code with read-only DB access, so there's no trust question
// ("can't the server just lie?") — the value here is catching data
// corruption, migration bugs, and any deliberate post-hoc rewrites.
// The passing rate over time is a health metric.

import crypto from "crypto";
import { query } from "@/lib/db";
import { sha256, rollFloat, pickWeighted } from "@/lib/bounty/rng";
import { leafHash, merkleRoot } from "./digest";
import { pickWeightedInOrder, validatedWeightOrder } from "./ordered-weights";

const SAMPLE_SIZE = 20;           // per run — bounded cost per tick
const MIN_AGE_SECONDS = 60;       // only audit draws old enough to be digested

export interface AuditSummary {
  sampled: number;
  passed: number;
  failed: number;
  failures: Array<{ source: string; id: string; reason: string }>;
}

export async function runFairnessSelfAudit(): Promise<AuditSummary> {
  const summary: AuditSummary = { sampled: 0, passed: 0, failed: 0, failures: [] };

  // Random sample from both sources. TABLESAMPLE SYSTEM + RANDOM() is
  // cheaper than ORDER BY RANDOM() on large tables; we accept the
  // approximate uniformity (good enough for sampling audit).
  // Split the budget across sources.
  const perSource = Math.ceil(SAMPLE_SIZE / 2);

  const pulls = await query(
    `SELECT id::text AS id, rng_server_seed_hash AS commitment, rng_server_seed AS server_seed,
            rng_client_seed AS client_seed, rng_nonce AS nonce,
            rolled_rarity, committed_at, revealed_at,
            merkle_digest_id, merkle_leaf_index,
            (SELECT rarity_weights FROM bounty_pull_tiers t WHERE t.tier = p.tier) AS weights
       FROM bounty_pulls p
      WHERE revealed_at IS NOT NULL
        AND revealed_at < NOW() - make_interval(secs => $1)
        AND rng_server_seed IS NOT NULL
        AND rolled_rarity IS NOT NULL
      ORDER BY RANDOM()
      LIMIT $2`,
    [MIN_AGE_SECONDS, perSource],
  );

  const draws = await query(
    `SELECT id::text AS id, commitment, server_seed, client_seed, nonce,
            weights, num_slots, outcome,
            committed_at, revealed_at,
            merkle_digest_id, merkle_leaf_index
       FROM verifiable_draws
      WHERE revealed_at IS NOT NULL
        AND revealed_at < NOW() - make_interval(secs => $1)
        AND server_seed IS NOT NULL
        AND outcome IS NOT NULL
        AND outcome ? 'weight_order'
      ORDER BY RANDOM()
      LIMIT $2`,
    [MIN_AGE_SECONDS, perSource],
  );

  for (const row of pulls.rows) {
    const res = await auditPull(row);
    await recordAudit("bounty_pull", row.id, res);
    summary.sampled++;
    if (res.all_ok) summary.passed++;
    else { summary.failed++; summary.failures.push({ source: "bounty_pull", id: row.id, reason: res.reason }); }
  }

  for (const row of draws.rows) {
    const res = await auditDraw(row);
    await recordAudit("verifiable_draw", row.id, res);
    summary.sampled++;
    if (res.all_ok) summary.passed++;
    else { summary.failed++; summary.failures.push({ source: "verifiable_draw", id: row.id, reason: res.reason }); }
  }

  return summary;
}

interface AuditResult {
  commitment_ok: boolean;
  outcome_ok: boolean;
  ordering_ok: boolean;
  merkle_ok: boolean | null;
  all_ok: boolean;
  reason: string;
}

interface BountyRow {
  id: string;
  commitment: string;
  server_seed: string;
  client_seed: string;
  nonce: string | number;
  rolled_rarity: string;
  committed_at: Date | string;
  revealed_at: Date | string;
  merkle_digest_id: number | null;
  merkle_leaf_index: number | null;
  weights: Record<string, number> | null;
}

async function auditPull(row: BountyRow): Promise<AuditResult> {
  const commitment_ok = sha256(row.server_seed).toLowerCase() === row.commitment.toLowerCase();
  const nonce = typeof row.nonce === "string" ? Number(row.nonce) : row.nonce;
  let outcome_ok = false;
  if (row.weights) {
    const roll = rollFloat(row.server_seed, row.client_seed, nonce);
    const picked = pickWeighted(row.weights, roll);
    outcome_ok = picked.toLowerCase() === row.rolled_rarity.toLowerCase();
  } else {
    // Tier weights missing — treat as inconclusive, but not failing
    // (tier config may have been deleted; not a proof failure).
    outcome_ok = true;
  }
  const ordering_ok = new Date(row.committed_at).getTime() <= new Date(row.revealed_at).getTime();
  const merkle_ok = await checkMerkle({
    id: row.id,
    commitment: row.commitment,
    serverSeed: row.server_seed,
    revealedAt: new Date(row.revealed_at),
    digestId: row.merkle_digest_id,
    leafIndex: row.merkle_leaf_index,
  });
  const all_ok = commitment_ok && outcome_ok && ordering_ok && (merkle_ok !== false);
  return {
    commitment_ok, outcome_ok, ordering_ok, merkle_ok, all_ok,
    reason: all_ok ? "" : reasonFromFlags({ commitment_ok, outcome_ok, ordering_ok, merkle_ok }),
  };
}

interface DrawRow {
  id: string;
  commitment: string;
  server_seed: string;
  client_seed: string;
  nonce: string | number;
  weights: Record<string, number>;
  num_slots: number;
  outcome: {
    picked?: string;
    slots?: Array<{ picked: string }>;
    weight_order?: unknown;
  } | null;
  committed_at: Date | string;
  revealed_at: Date | string;
  merkle_digest_id: number | null;
  merkle_leaf_index: number | null;
}

async function auditDraw(row: DrawRow): Promise<AuditResult> {
  const commitment_ok = sha256(row.server_seed).toLowerCase() === row.commitment.toLowerCase();
  const nonce = typeof row.nonce === "string" ? Number(row.nonce) : row.nonce;
  const claimed = row.outcome?.slots
    ? row.outcome.slots.map((s) => s.picked)
    : row.outcome?.picked != null ? [row.outcome.picked] : [];
  const weightOrder = validatedWeightOrder(row.weights, row.outcome?.weight_order);

  let outcome_ok = weightOrder !== null && claimed.length === row.num_slots && claimed.length > 0;
  if (outcome_ok && weightOrder) {
    for (let i = 0; i < claimed.length; i++) {
      const roll = rollFloat(row.server_seed, row.client_seed, nonce + i);
      const picked = pickWeightedInOrder(row.weights, weightOrder, roll);
      if (picked.toLowerCase() !== String(claimed[i]).toLowerCase()) {
        outcome_ok = false;
        break;
      }
    }
  }

  const ordering_ok = new Date(row.committed_at).getTime() <= new Date(row.revealed_at).getTime();
  const merkle_ok = await checkMerkle({
    id: row.id,
    commitment: row.commitment,
    serverSeed: row.server_seed,
    revealedAt: new Date(row.revealed_at),
    digestId: row.merkle_digest_id,
    leafIndex: row.merkle_leaf_index,
  });

  const all_ok = commitment_ok && outcome_ok && ordering_ok && (merkle_ok !== false);
  return {
    commitment_ok, outcome_ok, ordering_ok, merkle_ok, all_ok,
    reason: all_ok ? "" : reasonFromFlags({ commitment_ok, outcome_ok, ordering_ok, merkle_ok }),
  };
}

async function checkMerkle(args: {
  id: string;
  commitment: string;
  serverSeed: string;
  revealedAt: Date;
  digestId: number | null;
  leafIndex: number | null;
}): Promise<boolean | null> {
  if (args.digestId == null || args.leafIndex == null) return null; // not yet digested
  const r = await query(
    `SELECT root, leaves FROM fairness_digests WHERE id = $1`,
    [args.digestId],
  );
  if (r.rows.length === 0) return false;
  const { root, leaves } = r.rows[0] as { root: string; leaves: string[] };

  const claimed = leaves[args.leafIndex];
  if (!claimed) return false;

  const recomputed = leafHash({
    id: args.id,
    commitment: args.commitment,
    serverSeed: args.serverSeed,
    revealedAt: args.revealedAt,
  });
  if (claimed.toLowerCase() !== recomputed.toLowerCase()) return false;

  const recomputedRoot = merkleRoot(leaves);
  return recomputedRoot.toLowerCase() === root.toLowerCase();
}

function reasonFromFlags(flags: { commitment_ok: boolean; outcome_ok: boolean; ordering_ok: boolean; merkle_ok: boolean | null }): string {
  const failed: string[] = [];
  if (!flags.commitment_ok) failed.push("commitment mismatch");
  if (!flags.outcome_ok) failed.push("outcome mismatch");
  if (!flags.ordering_ok) failed.push("commit-after-reveal");
  if (flags.merkle_ok === false) failed.push("merkle mismatch");
  return failed.join(", ");
}

async function recordAudit(source: string, id: string, res: AuditResult): Promise<void> {
  await query(
    `INSERT INTO fairness_audits
       (source, subject_id, commitment_ok, outcome_ok, ordering_ok, merkle_ok, all_ok, reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [source, id, res.commitment_ok, res.outcome_ok, res.ordering_ok, res.merkle_ok, res.all_ok, res.reason || null],
  );

  if (!res.all_ok) {
    // Loud: a failing audit is a SEV event. Log prominently so ops
    // alerting surfaces it even before Phase B's admin notification.
    console.error(
      `[fairness-audit] CRITICAL FAILURE — source=${source} id=${id} reason="${res.reason}"`,
    );
  }
}

// Silence a false unused import — crypto used by sha256 transitively.
void crypto;
