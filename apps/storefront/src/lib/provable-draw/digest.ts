// Merkle digest publisher for provable-fair draws.
//
// Runs from the maintenance cron. Takes every draw revealed since the
// last digest (both bounty_pulls and verifiable_draws), builds a Merkle
// tree over their per-draw leaf hashes, writes the root to
// fairness_digests and stamps each draw with its digest_id + leaf_index.
//
// The leaf format is stable and minimal: sha256(id | commitment |
// server_seed | revealed_at_iso). This lets a third party who stores
// their own copy of (id, commitment, server_seed, revealed_at) recompute
// the leaf and verify inclusion against our published root — without
// needing to trust our leaf JSON.

import crypto from "crypto";
import { query } from "@/lib/db";

const MAX_LEAVES_PER_DIGEST = 1024; // cap batch size so leaves[] JSON stays small
const GENESIS_HASH = "0".repeat(64);

/** Most-recent chain_hash in fairness_digests, or genesis if none yet exists. */
async function fetchLatestChainHash(): Promise<string> {
  const r = await query(
    `SELECT chain_hash FROM fairness_digests
      WHERE chain_hash IS NOT NULL
      ORDER BY id DESC LIMIT 1`,
  );
  return r.rows[0]?.chain_hash ?? GENESIS_HASH;
}

/**
 * Backfill chain links on existing digests that predate migration 0066.
 * Walks id-ascending and stamps prev_hash + chain_hash for each null row.
 * Safe to call repeatedly — the WHERE clause skips already-linked rows.
 * Not called from the hot cron path; exposed so a one-off admin action
 * (or Phase E's health page) can seed the chain.
 */
export async function backfillDigestChain(): Promise<{ stamped: number }> {
  const r = await query(
    `SELECT id, root, chain_hash
       FROM fairness_digests
      ORDER BY id ASC`,
  );

  let prev = GENESIS_HASH;
  let stamped = 0;
  for (const row of r.rows) {
    if (row.chain_hash) {
      prev = row.chain_hash;
      continue;
    }
    const cur = sha256hex(
      Buffer.concat([Buffer.from(prev, "hex"), Buffer.from(row.root, "hex")]),
    );
    await query(
      `UPDATE fairness_digests SET prev_hash = $2, chain_hash = $3 WHERE id = $1`,
      [row.id, prev, cur],
    );
    prev = cur;
    stamped++;
  }
  return { stamped };
}

export function leafHash(parts: {
  id: string;
  commitment: string;
  serverSeed: string | null;
  revealedAt: Date;
}): string {
  const serialised = `${parts.id}|${parts.commitment}|${parts.serverSeed ?? ""}|${parts.revealedAt.toISOString()}`;
  return sha256hex(serialised);
}

function sha256hex(s: string | Buffer): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

/** Pairwise-hash a layer, duplicating the last element on odd sizes. */
function nextLayer(layer: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < layer.length; i += 2) {
    const left = layer[i];
    const right = i + 1 < layer.length ? layer[i + 1] : layer[i]; // dup last on odd
    out.push(sha256hex(Buffer.concat([Buffer.from(left, "hex"), Buffer.from(right, "hex")])));
  }
  return out;
}

/** Compute the Merkle root from an array of leaf hashes. */
export function merkleRoot(leaves: string[]): string {
  if (leaves.length === 0) return sha256hex(""); // empty-tree sentinel
  let layer = leaves;
  while (layer.length > 1) {
    layer = nextLayer(layer);
  }
  return layer[0];
}

/** Build the sibling path for a given leaf index, bottom-up. */
export function inclusionPath(leaves: string[], index: number): Array<{ side: "L" | "R"; hash: string }> {
  const path: Array<{ side: "L" | "R"; hash: string }> = [];
  let layer = leaves;
  let idx = index;
  while (layer.length > 1) {
    const isRight = idx % 2 === 1;
    const siblingIdx = isRight ? idx - 1 : (idx + 1 < layer.length ? idx + 1 : idx);
    path.push({
      side: isRight ? "L" : "R",
      hash: layer[siblingIdx],
    });
    layer = nextLayer(layer);
    idx = Math.floor(idx / 2);
  }
  return path;
}

export interface DigestResult {
  digested: number;
  root: string | null;
  digestId: number | null;
  skipped: boolean;
}

/**
 * Collect all undigested revealed draws, build a digest, publish it,
 * stamp each draw with its digest id + leaf index. Called from the
 * maintenance cron.
 *
 * Non-throwing on empty windows; caller can treat { skipped: true } as
 * "nothing to do this tick".
 */
export async function runFairnessDigest(): Promise<DigestResult> {
  // Pull undigested draws from both sources. The sort is stable by
  // revealed_at + id so leaf indices are deterministic even if two
  // sources are merged.
  const bountyRes = await query(
    `SELECT id::text AS id, rng_server_seed_hash AS commitment, rng_server_seed AS server_seed, revealed_at
       FROM bounty_pulls
      WHERE revealed_at IS NOT NULL AND merkle_digest_id IS NULL
      ORDER BY revealed_at ASC, id ASC
      LIMIT $1`,
    [MAX_LEAVES_PER_DIGEST],
  );
  const vdRes = await query(
    `SELECT id::text AS id, commitment, server_seed, revealed_at
       FROM verifiable_draws
      WHERE revealed_at IS NOT NULL AND merkle_digest_id IS NULL
      ORDER BY revealed_at ASC, id ASC
      LIMIT $1`,
    [MAX_LEAVES_PER_DIGEST - bountyRes.rows.length],
  );

  type Draw = {
    source: "bounty" | "vd";
    id: string;
    commitment: string;
    server_seed: string | null;
    revealed_at: Date;
  };
  const draws: Draw[] = [
    ...bountyRes.rows.map((r): Draw => ({
      source: "bounty",
      id: r.id,
      commitment: r.commitment,
      server_seed: r.server_seed,
      revealed_at: new Date(r.revealed_at),
    })),
    ...vdRes.rows.map((r): Draw => ({
      source: "vd",
      id: r.id,
      commitment: r.commitment,
      server_seed: r.server_seed,
      revealed_at: new Date(r.revealed_at),
    })),
  ];

  if (draws.length === 0) {
    return { digested: 0, root: null, digestId: null, skipped: true };
  }

  // Sort the merged list chronologically for stable leaf ordering.
  draws.sort((a, b) => {
    const t = a.revealed_at.getTime() - b.revealed_at.getTime();
    return t !== 0 ? t : a.id.localeCompare(b.id);
  });

  const leaves = draws.map((d) => leafHash({
    id: d.id,
    commitment: d.commitment,
    serverSeed: d.server_seed,
    revealedAt: d.revealed_at,
  }));
  const root = merkleRoot(leaves);

  const windowFrom = draws[0].revealed_at;
  const windowTo = draws[draws.length - 1].revealed_at;

  // Extend the chain: fetch the previous digest's chain_hash and link
  // this one in. On first run (or if prior rows predate migration 0066)
  // we use the genesis placeholder. Chain is append-only; rewriting any
  // historical digest breaks this link and all descendants.
  const prevHash = await fetchLatestChainHash();
  const chainHash = sha256hex(
    Buffer.concat([Buffer.from(prevHash, "hex"), Buffer.from(root, "hex")]),
  );

  const digestInsert = await query(
    `INSERT INTO fairness_digests (root, leaf_count, leaves, window_from, window_to, prev_hash, chain_hash)
     VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7)
     RETURNING id`,
    [root, leaves.length, JSON.stringify(leaves), windowFrom, windowTo, prevHash, chainHash],
  );
  const digestId: number = digestInsert.rows[0].id;

  // Stamp each draw with its leaf index. Two updates (one per source
  // table) — could be one CTE but the two-query approach keeps it
  // debuggable per-source.
  for (let i = 0; i < draws.length; i++) {
    const d = draws[i];
    const sql = d.source === "bounty"
      ? `UPDATE bounty_pulls     SET merkle_digest_id = $2, merkle_leaf_index = $3 WHERE id = $1::uuid`
      : `UPDATE verifiable_draws SET merkle_digest_id = $2, merkle_leaf_index = $3 WHERE id = $1::uuid`;
    await query(sql, [d.id, digestId, i]);
  }

  return { digested: draws.length, root, digestId, skipped: false };
}
