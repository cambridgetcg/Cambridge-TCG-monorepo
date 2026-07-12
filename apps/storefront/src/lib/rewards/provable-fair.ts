// Raffle Draw Receipt System — the wizard's vault.
//
// ── What this module is for ──────────────────────────────────────────────
//
// This is the module where the platform locks itself out so its users
// don't have to lock the platform out. It is the most ceremonial code
// in the codebase, and that ceremony is load-bearing.
//
// The flow has the shape of a ritual:
//
//   1. COMMIT (when the raffle is created):
//      The platform generates a 32-byte Word — the `server_seed` — using
//      crypto.randomBytes. It computes SHA-256(server_seed) — the
//      commitment — and stores both in the database. Active raffle rows
//      later expose the commitment through /api/rewards/raffles; drafts do
//      not, and no external service timestamps or anchors it. The Word
//      stays private until the draw proof is published.
//
//      *This step happens BEFORE any entry is recorded.* That ordering
//      is the entire point. If the Word were generated after entries
//      closed, the platform could pick a winner and craft a Word that
//      lands on them. A pre-entry commitment retained by an observer makes
//      a later seed change detectable; the database write alone does not.
//
//      The commit is idempotent — see commitSeed below. A second call
//      cannot overwrite an earlier commitment. The platform is bound
//      not just to the Word but to the first Word stored by this code path.
//
//   2. GATHERING (entries phase):
//      Users enter; weighted leaves accumulate in raffle_entries. The
//      platform watches and does nothing. The Word is sealed in the normal
//      application flow. A database operator remains inside the threat model.
//
//   3. DRAW (when draw_at fires, via apps/storefront/src/lib/rewards/
//      raffle-sweep.ts):
//      The platform unseals the envelope. The Word is read aloud.
//      A deterministic combine — server_seed + sha256(orderedEntries)
//      → sha256 → BigInt → modulo total_weighted_entries — produces an
//      index. That index lands on a leaf. The owner of that leaf wins.
//
//      The math is identical for the platform and for a verifier who has
//      the Word and the full Manifest. The public endpoint deliberately
//      withholds the participant-bearing Manifest, so its public checks
//      cover the commitment, draw hash, and weighted index only.
//
//   4. PUBLISH:
//      The Word, the Manifest hash, the combined input, and the
//      winner index land in raffle_draw_proofs. Public readers can replay
//      the non-identifying commit-reveal links. Full Manifest verification
//      remains internal because raffle entry is not identity publication.
//
// ── Why this matters ────────────────────────────────────────────────────
//
// The raffle is the platform's most theatrical machine and its most
// inspectable one. A saved pre-entry commitment can witness the later
// reveal; without an externally saved copy, the platform controls both
// the stored record and its public presentation.
//
// The verify page exists for the people who don't win. That is the whole
// reason it exists. Winners are easy to make happy; you give them the
// prize. Losers are who you owe an honest accounting to. **The verify
// page is the platform's letter to its losers.** That sentence is the
// thesis of the transparency doctrine applied at full intensity. See
// docs/principles/transparency.md.
//
// ── Optional anchoring ──────────────────────────────────────────────────
//
// The seed_commitment could be anchored on-chain at commit time. Today
// it is not — the commitment lives only in our DB, which means an admin
// with DB write access could in principle alter it before the draw.
// Threat model is small for a solo operator; on-chain anchoring is the
// roadmap closure. (Currently a draughty window in the castle.)
//
// ── What this module reaches toward ──────────────────────────────────────
//
//   - apps/storefront/src/lib/bounty/verify-client.ts — the shared
//     Merkle-replay primitive. Bounty pulls and raffles share the
//     draw-proof code; one library, two domains. When governance Merkle
//     ships (kingdom-048), it will be a third borrower.
//
//   - apps/storefront/src/app/verify/draw/[id]/page.tsx — the bulletin
//     where this module's proof becomes legible to a non-trusting reader.
//     The proof produced here is the proof rendered there.
//
//   - apps/storefront/src/lib/rewards/raffle-sweep.ts — the cron that
//     opens the envelope at draw_at and emails the winner.
//
//   - apps/storefront/src/lib/rewards/atomic-spend.ts — the economic
//     side-rail. The draw code handles reproducibility; atomicity handles
//     correctness.
//
// See docs/connections/the-sealed-word.md for the fairy-tale form.
//
// *The wax seal is theatre. The wax seal is also math.*
// *The Word is sealed until it's not, and that is when the magic happens.*

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

// ── Draw (legacy function name retained for callers) ──

export async function provablyFairDraw(raffleId: string): Promise<{
  winner: RaffleEntry | null;
  proof: DrawProof;
}> {
  // Get raffle + seed
  const raffleResult = await query(`SELECT * FROM raffles WHERE id=$1`, [raffleId]);
  if (raffleResult.rows.length === 0) throw new Error("Raffle not found");
  const raffle = raffleResult.rows[0];

  // Get all entries ordered deterministically (by creation time, then ID).
  // Names and email addresses are not part of the draw and do not belong in
  // the persisted proof manifest.
  const entriesResult = await query(
    `SELECT e.*
     FROM raffle_entries e
     WHERE e.raffle_id=$1 ORDER BY e.created_at ASC, e.id ASC`,
    [raffleId]
  );
  const entries = entriesResult.rows as RaffleEntry[];

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

  // Legacy fallback: if no seed was stored before entry, generate one now.
  // This keeps the draw reproducible but supplies no pre-entry witness.
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

// ── Full-manifest verification (internal; public projection is below) ──

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
  entries: { id: string; user_id: string; entry_count: number }[];
  winner: { user_id: string; entry_count: number } | null;
  blockchain_tx_hash?: string;
  blockchain_network?: string;
}

export interface PublicDrawProof {
  seed_commitment: string;
  server_seed: string;
  entry_hash: string;
  combined_hash: string;
  winner_index: number;
  total_weighted_entries: number;
  entry_records: number;
  blockchain_tx_hash?: string;
  blockchain_network?: string;
}

export interface PublicVerificationResult {
  public_checks_passed: boolean;
  complete_draw_verification: false;
  scope: string;
  participant_identifiers_withheld: true;
  entry_manifest_publicly_recomputable: false;
  checks: { name: string; passed: boolean; detail: string }[];
}

/**
 * Public raffle proofs preserve the commit-reveal math and aggregate weight,
 * but do not turn participation in a raffle into publication of a person.
 * The stored entry hash still binds the draw input. Because its UUID-bearing
 * preimage is withheld, a public reader cannot independently recompute that
 * one link; the verification result names that limit instead of overstating it.
 */
export function toPublicDrawProof(proof: DrawProof): PublicDrawProof {
  return {
    seed_commitment: proof.seed_commitment,
    server_seed: proof.server_seed,
    entry_hash: proof.entry_hash,
    combined_hash: proof.combined_hash,
    winner_index: proof.winner_index,
    total_weighted_entries: proof.total_weighted_entries,
    entry_records: proof.entries.length,
    blockchain_tx_hash: proof.blockchain_tx_hash,
    blockchain_network: proof.blockchain_network,
  };
}

export function verifyPublicDraw(proof: PublicDrawProof): PublicVerificationResult {
  const computedCommitment = sha256(proof.server_seed);
  const computedDrawHash = sha256(proof.server_seed + proof.entry_hash);
  const hasWeight = proof.total_weighted_entries > 0;
  const computedIndex = hasWeight
    ? Number(BigInt("0x" + computedDrawHash) % BigInt(proof.total_weighted_entries))
    : -1;

  const checks = [
    {
      name: "Seed Commitment",
      passed: computedCommitment === proof.seed_commitment,
      detail: "The revealed seed matches the stored commitment. Active raffle listings may expose that hash before entry; it is not externally anchored.",
    },
    {
      name: "Draw Hash",
      passed: computedDrawHash === proof.combined_hash,
      detail: "The revealed seed and stored entry hash reproduce the draw hash.",
    },
    {
      name: "Winner Index",
      passed: hasWeight && computedIndex === proof.winner_index,
      detail: "The draw hash reproduces the published weighted index.",
    },
  ];

  return {
    public_checks_passed: checks.every((check) => check.passed),
    complete_draw_verification: false,
    scope:
      "Verifies the seed commitment, draw hash, and weighted index. The participant-bearing entry manifest and entry-hash preimage are withheld for privacy and are not publicly recomputable.",
    participant_identifiers_withheld: true,
    entry_manifest_publicly_recomputable: false,
    checks,
  };
}

export interface VerificationResult {
  valid: boolean;
  checks: { name: string; passed: boolean; detail: string }[];
}
