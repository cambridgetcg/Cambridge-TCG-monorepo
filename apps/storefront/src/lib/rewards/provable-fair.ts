// Provably Fair Raffle Draw System
//
// Uses a cryptographic commit-reveal scheme:
// 1. COMMIT: Before entries close, generate server_seed, publish SHA-256(server_seed)
// 2. DRAW:   After entries close, compute winner deterministically:
//            combined = server_seed + entry_hash
//            winner_index = BigInt(SHA-256(combined)) % total_weighted_entries
// 3. VERIFY: Anyone can replay: check commitment matches seed, replay the draw
//
// Optional blockchain anchoring: publish commitment hash on-chain for immutability

import crypto from "crypto";
import { query } from "@/lib/db";
import type { RaffleEntry } from "./types";

// ── Hashing ──

export function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function generateServerSeed(): string {
  return crypto.randomBytes(32).toString("hex");
}

// ── Commit (before entries close) ──

/**
 * Idempotent: only writes a seed if one isn't already present. The UPDATE
 * is guarded by `server_seed IS NULL` so a second call (e.g. belt-and-
 * braces from the auto-draw cron) can't overwrite an earlier commitment.
 * Returns the current (possibly pre-existing) seed + commitment.
 */
export async function commitSeed(raffleId: string): Promise<{
  seedCommitment: string;
  serverSeed: string;
}> {
  const newSeed = generateServerSeed();
  const newCommit = sha256(newSeed);

  const r = await query(
    `UPDATE raffles
        SET seed_commitment = $2, server_seed = $3,
            provably_fair = true, updated_at = NOW()
      WHERE id = $1 AND server_seed IS NULL
     RETURNING seed_commitment, server_seed`,
    [raffleId, newCommit, newSeed]
  );

  let seedCommitment: string;
  let serverSeed: string;
  if (r.rowCount && r.rowCount > 0) {
    seedCommitment = r.rows[0].seed_commitment;
    serverSeed = r.rows[0].server_seed;
    // Fresh commit — stamp the proof record's committed_at
    await query(
      `INSERT INTO raffle_draw_proofs (raffle_id, seed_commitment, committed_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT DO NOTHING`,
      [raffleId, seedCommitment]
    );
  } else {
    // Already committed — return the existing pair without modification.
    const existing = await query(
      `SELECT seed_commitment, server_seed FROM raffles WHERE id = $1`,
      [raffleId]
    );
    seedCommitment = existing.rows[0]?.seed_commitment ?? "";
    serverSeed = existing.rows[0]?.server_seed ?? "";
  }

  return { seedCommitment, serverSeed };
}

// ── Draw (provably fair) ──

export async function provablyFairDraw(raffleId: string): Promise<{
  winner: RaffleEntry | null;
  proof: DrawProof;
}> {
  // Get raffle + seed
  const raffleResult = await query(`SELECT * FROM raffles WHERE id=$1`, [raffleId]);
  if (raffleResult.rows.length === 0) throw new Error("Raffle not found");
  const raffle = raffleResult.rows[0];

  // Get all entries ordered deterministically (by creation time, then ID)
  const entriesResult = await query(
    `SELECT e.*, u.name as user_name, u.email as user_email
     FROM raffle_entries e JOIN users u ON e.user_id=u.id
     WHERE e.raffle_id=$1 ORDER BY e.created_at ASC, e.id ASC`,
    [raffleId]
  );
  const entries = entriesResult.rows as (RaffleEntry & { user_name: string; user_email: string })[];

  if (entries.length === 0) {
    const proof: DrawProof = {
      raffle_id: raffleId,
      seed_commitment: raffle.seed_commitment || "",
      server_seed: raffle.server_seed || "",
      entry_hash: "",
      combined_hash: "",
      winner_index: -1,
      total_weighted_entries: 0,
      entries: [],
      winner: null,
    };
    await query(`UPDATE raffles SET status='completed', winner_drawn_at=NOW(), updated_at=NOW() WHERE id=$1`, [raffleId]);
    return { winner: null, proof };
  }

  // If no seed was pre-committed, generate one now (less ideal but still fair)
  let serverSeed = raffle.server_seed;
  let seedCommitment = raffle.seed_commitment;
  if (!serverSeed) {
    const commit = await commitSeed(raffleId);
    serverSeed = commit.serverSeed;
    seedCommitment = commit.seedCommitment;
  }

  // Build entry list for hashing (deterministic order)
  const entryList = entries.map(e => ({
    id: e.id,
    user_id: e.user_id,
    user_name: e.user_name,
    entry_count: e.entry_count,
  }));

  // Compute entry hash (fingerprint of all entries)
  const entryString = entries.map(e => `${e.id}:${e.user_id}:${e.entry_count}`).join("|");
  const entryHash = sha256(entryString);

  // Compute draw
  const combined = serverSeed + entryHash;
  const drawHash = sha256(combined);

  // Convert hash to BigInt, mod by total weighted entries
  const totalWeighted = entries.reduce((s, e) => s + e.entry_count, 0);
  const hashBigInt = BigInt("0x" + drawHash);
  const winnerIndex = Number(hashBigInt % BigInt(totalWeighted));

  // Walk through entries to find the winner
  let cumulative = 0;
  let winnerEntry: RaffleEntry | null = null;
  for (const entry of entries) {
    cumulative += entry.entry_count;
    if (winnerIndex < cumulative) {
      winnerEntry = entry;
      break;
    }
  }

  // Update raffle
  await query(
    `UPDATE raffles SET status='completed', winner_user_id=$2, winner_drawn_at=NOW(),
     entry_hash=$3, draw_hash=$4, winner_index=$5, updated_at=NOW()
     WHERE id=$1`,
    [raffleId, winnerEntry?.user_id, entryHash, drawHash, winnerIndex]
  );

  // Update winner's entry status
  if (winnerEntry) {
    await query(
      `UPDATE auction_bids SET status='winning' WHERE id=$1`,
      [winnerEntry.id]
    );
    // Social side-effects (was on the legacy drawRaffleWinner; moved
    // here so they fire whichever draw path runs).
    try {
      const { postActivity } = await import("@/lib/social/db");
      const { awardAchievement } = await import("@/lib/social/db");
      void postActivity(winnerEntry.user_id, "raffle_won", "Won a raffle!").catch(() => {});
      void awardAchievement(winnerEntry.user_id, "raffle_winner").catch(() => {});
    } catch {
      /* social is best-effort */
    }
  }

  // Save proof
  const proof: DrawProof = {
    raffle_id: raffleId,
    seed_commitment: seedCommitment,
    server_seed: serverSeed,
    entry_hash: entryHash,
    combined_hash: drawHash,
    winner_index: winnerIndex,
    total_weighted_entries: totalWeighted,
    entries: entryList,
    winner: winnerEntry ? {
      user_id: winnerEntry.user_id,
      entry_count: winnerEntry.entry_count,
    } : null,
  };

  await query(
    `UPDATE raffle_draw_proofs SET server_seed=$2, entry_hash=$3, combined_hash=$4,
     winner_index=$5, total_weighted_entries=$6, entry_list=$7, drawn_at=NOW(), verified=true
     WHERE raffle_id=$1`,
    [raffleId, serverSeed, entryHash, drawHash, winnerIndex, totalWeighted, JSON.stringify(entryList)]
  );

  return { winner: winnerEntry, proof };
}

// ── Verify (anyone can do this) ──

export function verifyDraw(proof: DrawProof): VerificationResult {
  const checks: { name: string; passed: boolean; detail: string }[] = [];

  // Check 1: Seed commitment matches
  const computedCommitment = sha256(proof.server_seed);
  checks.push({
    name: "Seed Commitment",
    passed: computedCommitment === proof.seed_commitment,
    detail: `SHA-256(${proof.server_seed.substring(0, 8)}...) = ${computedCommitment.substring(0, 16)}... ${computedCommitment === proof.seed_commitment ? "matches" : "MISMATCH"} commitment`,
  });

  // Check 2: Entry hash matches
  const entryString = proof.entries.map(e => `${e.id}:${e.user_id}:${e.entry_count}`).join("|");
  const computedEntryHash = sha256(entryString);
  checks.push({
    name: "Entry Hash",
    passed: computedEntryHash === proof.entry_hash,
    detail: `SHA-256(${proof.entries.length} entries) = ${computedEntryHash.substring(0, 16)}...`,
  });

  // Check 3: Draw hash matches
  const combined = proof.server_seed + proof.entry_hash;
  const computedDrawHash = sha256(combined);
  checks.push({
    name: "Draw Hash",
    passed: computedDrawHash === proof.combined_hash,
    detail: `SHA-256(seed + entries) = ${computedDrawHash.substring(0, 16)}...`,
  });

  // Check 4: Winner index is correct
  const hashBigInt = BigInt("0x" + computedDrawHash);
  const computedIndex = Number(hashBigInt % BigInt(proof.total_weighted_entries));
  checks.push({
    name: "Winner Index",
    passed: computedIndex === proof.winner_index,
    detail: `${computedDrawHash.substring(0, 16)}... mod ${proof.total_weighted_entries} = ${computedIndex}`,
  });

  // Check 5: Winner matches index
  let cumulative = 0;
  let computedWinner: string | null = null;
  for (const entry of proof.entries) {
    cumulative += entry.entry_count;
    if (proof.winner_index < cumulative) {
      computedWinner = entry.user_id;
      break;
    }
  }
  checks.push({
    name: "Winner Selection",
    passed: computedWinner === proof.winner?.user_id,
    detail: `Index ${proof.winner_index} → user ${computedWinner?.substring(0, 8)}...`,
  });

  return {
    valid: checks.every(c => c.passed),
    checks,
  };
}

// ── Get proof for public viewing ──

export async function getDrawProof(raffleId: string): Promise<DrawProof | null> {
  const result = await query(
    `SELECT * FROM raffle_draw_proofs WHERE raffle_id=$1 AND drawn_at IS NOT NULL`,
    [raffleId]
  );
  if (result.rows.length === 0) return null;

  const row = result.rows[0];

  // Populate winner from raffle data
  const raffleResult = await query(
    `SELECT r.winner_user_id, e.entry_count FROM raffles r
     LEFT JOIN raffle_entries e ON e.raffle_id=r.id AND e.user_id=r.winner_user_id
     WHERE r.id=$1`,
    [raffleId]
  );
  const winnerData = raffleResult.rows[0];

  return {
    raffle_id: row.raffle_id,
    seed_commitment: row.seed_commitment,
    server_seed: row.server_seed,
    entry_hash: row.entry_hash,
    combined_hash: row.combined_hash,
    winner_index: row.winner_index,
    total_weighted_entries: row.total_weighted_entries,
    entries: row.entry_list || [],
    winner: winnerData?.winner_user_id ? {
      user_id: winnerData.winner_user_id,
      entry_count: winnerData.entry_count || 0,
    } : null,
    blockchain_tx_hash: row.blockchain_tx_hash,
    blockchain_network: row.blockchain_network,
  };
}

// ── Types ──

export interface DrawProof {
  raffle_id: string;
  seed_commitment: string;
  server_seed: string;
  entry_hash: string;
  combined_hash: string;
  winner_index: number;
  total_weighted_entries: number;
  entries: { id: string; user_id: string; user_name?: string; entry_count: number }[];
  winner: { user_id: string; entry_count: number } | null;
  blockchain_tx_hash?: string;
  blockchain_network?: string;
}

export interface VerificationResult {
  valid: boolean;
  checks: { name: string; passed: boolean; detail: string }[];
}
