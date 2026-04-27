// Browser-safe re-implementation of the rng helpers in @/lib/bounty/rng.
//
// Used by the public verifier page to re-run the math in the user's
// browser — the point of provably-fair is that the user can confirm the
// outcome WITHOUT trusting our server. Keeping this file separate (no
// `crypto` Node module, only Web Crypto) means it tree-shakes cleanly
// into the client bundle.

export async function sha256Hex(input: string): Promise<string> {
  const enc = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Hash two hex strings as concatenated bytes, returning hex. Used for Merkle pairs. */
export async function sha256HexPair(leftHex: string, rightHex: string): Promise<string> {
  const leftBytes = hexToBytes(leftHex);
  const rightBytes = hexToBytes(rightHex);
  const combined = new Uint8Array(leftBytes.length + rightBytes.length);
  combined.set(leftBytes, 0);
  combined.set(rightBytes, leftBytes.length);
  const digest = await crypto.subtle.digest("SHA-256", combined);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    out[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return out;
}

/**
 * Compute a Merkle leaf for a revealed draw. Must match server-side
 * leafHash in src/lib/provable-draw/digest.ts byte-for-byte.
 */
export async function computeLeaf(parts: {
  id: string;
  commitment: string;
  serverSeed: string | null;
  revealedAtIso: string;
}): Promise<string> {
  return sha256Hex(`${parts.id}|${parts.commitment}|${parts.serverSeed ?? ""}|${parts.revealedAtIso}`);
}

/**
 * Walk a leaf array bottom-up to the Merkle root. Mirrors server-side
 * merkleRoot + nextLayer — odd sizes duplicate the last element.
 */
export async function merkleRoot(leaves: string[]): Promise<string> {
  if (leaves.length === 0) return sha256Hex("");
  let layer = leaves.slice();
  while (layer.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < layer.length; i += 2) {
      const left = layer[i];
      const right = i + 1 < layer.length ? layer[i + 1] : layer[i];
      next.push(await sha256HexPair(left, right));
    }
    layer = next;
  }
  return layer[0];
}

/** Same logic as server-side rollFloat. Must match byte-for-byte. */
export async function rollFloat(serverSeed: string, clientSeed: string, nonce: number): Promise<number> {
  const combined = `${serverSeed}:${clientSeed}:${nonce}`;
  const hash = await sha256Hex(combined);
  const slice = hash.slice(0, 13); // 52 bits
  const intValue = parseInt(slice, 16);
  return intValue / 0x10000000000000;
}

/** Same logic as server-side pickWeighted. */
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

export interface VerificationInputs {
  commitment: string;
  serverSeed: string;
  clientSeed: string;
  nonce: number;
  rarityWeights: Record<string, number>;
  rolledRarity: string;
}

export interface VerificationResult {
  commitmentMatches: boolean;
  recomputedHash: string;
  recomputedRoll: number;
  recomputedRarity: string;
  rarityMatches: boolean;
  ok: boolean;
}

/** Run all checks. Returns each leg's pass/fail so the UI can
 *  show which parts of the proof are good. */
export async function verifyPull(inputs: VerificationInputs): Promise<VerificationResult> {
  const recomputedHash = await sha256Hex(inputs.serverSeed);
  const commitmentMatches = recomputedHash.toLowerCase() === inputs.commitment.toLowerCase();

  const recomputedRoll = await rollFloat(inputs.serverSeed, inputs.clientSeed, inputs.nonce);
  const recomputedRarity = pickWeighted(inputs.rarityWeights, recomputedRoll);
  const rarityMatches = recomputedRarity.toLowerCase() === inputs.rolledRarity.toLowerCase();

  return {
    commitmentMatches,
    recomputedHash,
    recomputedRoll,
    recomputedRarity,
    rarityMatches,
    ok: commitmentMatches && rarityMatches,
  };
}
