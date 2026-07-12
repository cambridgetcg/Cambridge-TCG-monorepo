// Bounty Pull RNG — deterministic commit/reveal draw receipts.
//
// Flow per pull:
//   1. Generate a fresh server_seed (32 random bytes).
//   2. Store commitment = sha256(server_seed) in our DB BEFORE the roll.
//      This is not external pre-roll publication.
//   3. Combine server_seed + client_seed + nonce to produce the deterministic
//      roll result.
//   4. Persist server_seed in `bounty_pulls.rng_server_seed` so anyone can
//      verify sha256(revealed_seed) === committed_hash.
//
// client_seed format is `${userId}:${random16hex}` — userId anchors it to
// a specific account (so a server can't replay another user's roll against
// this user) and the random suffix means two pulls by the same user use
// distinct client_seeds. nonce is 48 random bits; both serve as cryptographic
// salt so sequential rolls cannot collide on the (server,client,nonce) tuple
// even if two requests fire in the same millisecond.

import crypto from "crypto";

export function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function generateServerSeed(): string {
  return crypto.randomBytes(32).toString("hex");
}

/** 16-byte hex suffix to mix into client_seed alongside userId. */
export function generateClientSeedSuffix(): string {
  return crypto.randomBytes(16).toString("hex");
}

/**
 * 48 bits of randomness as a regular Number — fits safely in
 * Number.MAX_SAFE_INTEGER (2^53) and in Postgres BIGINT, leaving 5 bits
 * of headroom for the resolver's nonce+attempt arithmetic.
 */
export function generateNonce(): number {
  const buf = crypto.randomBytes(6);
  // Big-endian read of 6 bytes → integer in [0, 2^48)
  return (buf[0] * 2 ** 40) +
         (buf[1] * 2 ** 32) +
         (buf[2] * 2 ** 24) +
         (buf[3] * 2 ** 16) +
         (buf[4] * 2 ** 8)  +
          buf[5];
}

// Returns a uniform float in [0, 1) derived deterministically from the seed.
export function rollFloat(serverSeed: string, clientSeed: string, nonce: number): number {
  const combined = `${serverSeed}:${clientSeed}:${nonce}`;
  const hash = sha256(combined);
  // Take the first 13 hex chars (52 bits) — enough precision for weighted draws.
  const slice = hash.slice(0, 13);
  const intValue = parseInt(slice, 16);
  return intValue / 0x10000000000000; // 2^52
}

// Pick a key from `weights` proportional to its value. Weights sum to ~1.0.
export function pickWeighted<T extends string>(
  weights: Record<T, number>,
  roll: number,
): T {
  const entries = Object.entries(weights) as [T, number][];
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let cursor = roll * total;
  for (const [key, w] of entries) {
    cursor -= w;
    if (cursor <= 0) return key;
  }
  return entries[entries.length - 1][0];
}
