// Cambridge TCG — Standalone Draw Proof Verifier
// --------------------------------------------------
//
// Dep-free ES module anyone can fetch and run. Re-implements the commit-
// reveal + Merkle math used by cambridgetcg.com/verify — no trust in our
// servers required (the point of the exercise is that you audit OUR
// claims, not take them on faith).
//
// Browser usage (works in modern browsers via Web Crypto):
//
//     import * as v from 'https://cambridgetcg.com/verify/cambridgetcg-verifier.js';
//
//     const draw = await fetch('https://cambridgetcg.com/api/verify/draw/<id>')
//                        .then(r => r.json());
//     const res = await v.verifyDraw(draw);
//     console.log(res.allMatch === null ? 'partial' : res.allMatch ? 'verified' : 'failed', res);
//
// Node 18+ usage (same code path — Web Crypto is native there too):
//
//     import * as v from './cambridgetcg-verifier.js';
//     ...
//
// License: MIT. Reviewed against /verify/how-it-works — if anything
// here diverges from that page's math, the page is canonical and this
// file has a bug. Open an issue or email verify@cambridgetcg.com.

const VERSION = "1.2.0";
export function version() { return VERSION; }

// ── Primitives ──────────────────────────────────────────────────────

/** SHA-256 of a UTF-8 string; returns lowercase hex. */
export async function sha256Hex(str) {
  const enc = new TextEncoder().encode(str);
  const d = await crypto.subtle.digest("SHA-256", enc);
  return bufToHex(d);
}

/** SHA-256 of two hex strings concatenated as bytes; returns hex. */
export async function sha256HexPair(leftHex, rightHex) {
  const a = hexToBytes(leftHex);
  const b = hexToBytes(rightHex);
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  const d = await crypto.subtle.digest("SHA-256", out);
  return bufToHex(d);
}

function bufToHex(buf) {
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    out[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return out;
}

// ── Commit-reveal: roll + pick ───────────────────────────────────────

/**
 * Deterministic uniform float in [0, 1) from (seed, clientSeed, nonce).
 * Must match server-side rollFloat in src/lib/bounty/rng.ts exactly.
 */
export async function rollFloat(serverSeed, clientSeed, nonce) {
  const combined = `${serverSeed}:${clientSeed}:${nonce}`;
  const hash = await sha256Hex(combined);
  const slice = hash.slice(0, 13); // 52 bits
  return parseInt(slice, 16) / 0x10000000000000;
}

/** Weighted pick: returns the key whose cumulative weight first
 *  exceeds `roll * totalWeight`. */
export function pickWeighted(weights, roll) {
  const entries = Object.entries(weights);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let cursor = roll * total;
  for (const [k, w] of entries) {
    cursor -= w;
    if (cursor <= 0) return k;
  }
  return entries[entries.length - 1][0];
}

/** Return a copied key order only when it names every weight exactly once. */
export function validateWeightOrder(weights, weightOrder) {
  if (!weights || typeof weights !== "object" || Array.isArray(weights)) return null;
  if (!Array.isArray(weightOrder)) return null;
  const keys = Object.keys(weights);
  if (keys.length === 0 || keys.length !== weightOrder.length) return null;

  const seen = new Set();
  let total = 0;
  for (const key of weightOrder) {
    if (
      typeof key !== "string" ||
      seen.has(key) ||
      !Object.prototype.hasOwnProperty.call(weights, key)
    ) {
      return null;
    }
    const weight = weights[key];
    if (typeof weight !== "number" || !Number.isFinite(weight) || weight < 0) return null;
    seen.add(key);
    total += weight;
  }
  return Number.isFinite(total) && total > 0 ? [...weightOrder] : null;
}

/** Weighted pick using an explicit JSON-array order. Generic draw receipts
 * must use this instead of relying on JSON object key order. */
export function pickWeightedInOrder(weights, weightOrder, roll) {
  const order = validateWeightOrder(weights, weightOrder);
  if (!order) throw new Error("Ordered weight contract is missing or invalid.");
  if (!Number.isFinite(roll) || roll < 0 || roll >= 1) {
    throw new Error("Roll must be a finite number in [0, 1).");
  }
  const total = order.reduce((sum, key) => sum + weights[key], 0);
  let cursor = roll * total;
  for (const key of order) {
    cursor -= weights[key];
    if (cursor <= 0) return key;
  }
  return order[order.length - 1];
}

// ── Per-draw verification ────────────────────────────────────────────

/**
 * Run the three core checks on a draw payload (from /api/verify/draw/
 * or /api/verify/pull/). Returns a detailed verdict including recomputed
 * values so you can see the math, not just pass/fail.
 */
export async function verifyDraw(payload) {
  // Normalise fields across the two endpoint shapes
  const commitment = payload.commitment;
  const serverSeed = payload.server_seed;
  const clientSeed = payload.client_seed;
  const nonce = payload.nonce;
  const weights = payload.weights ?? payload.rarity_weights ?? {};
  const isGenericDraw = payload.weights != null && payload.rarity_weights == null;
  const weightOrder = isGenericDraw
    ? validateWeightOrder(weights, payload.weight_order)
    : null;
  const outcome = payload.outcome ?? null;
  const claimed = outcome
    ? (outcome.slots ?? [{ picked: outcome.picked, roll: outcome.roll }])
    : payload.rolled_rarity
      ? [{ picked: payload.rolled_rarity, roll: null }]
      : [];

  if (typeof serverSeed !== "string" || serverSeed.length === 0) {
    return {
      commitmentMatches: null,
      recomputedHash: null,
      slots: [],
      orderingMatches: null,
      outcomeReplayAvailable: false,
      weightOrderPreserved: isGenericDraw ? weightOrder !== null : null,
      outcomeReplayReason: "not_revealed",
      partialMatch: false,
      allMatch: null,
      notRevealed: true,
    };
  }

  // 1. Commitment matches seed
  const recomputedHash = await sha256Hex(serverSeed);
  const commitmentMatches = recomputedHash.toLowerCase() === commitment.toLowerCase();

  // 2. Per-slot reproduction. Generic draws additionally need the explicit
  // weight_order array because jsonb object keys do not retain draw order.
  const orderedContractAvailable = !isGenericDraw || weightOrder !== null;
  const apiAllowsReplay = payload.outcome_replay_available !== false;
  const outcomeReplayAvailable =
    typeof clientSeed === "string" &&
    clientSeed.length > 0 &&
    claimed.length > 0 &&
    orderedContractAvailable &&
    apiAllowsReplay;
  const slots = [];
  if (outcomeReplayAvailable) {
    for (let i = 0; i < claimed.length; i++) {
      const r = await rollFloat(serverSeed, clientSeed, nonce + i);
      const picked = isGenericDraw
        ? pickWeightedInOrder(weights, weightOrder, r)
        : pickWeighted(weights, r);
      slots.push({
        index: i,
        claimedPicked: claimed[i].picked,
        recomputedRoll: r,
        recomputedPicked: picked,
        matches: String(picked).toLowerCase() === String(claimed[i].picked).toLowerCase(),
      });
    }
  }

  // 3. Ordering (only if timestamps were included)
  let orderingMatches = null;
  if (payload.committed_at && payload.revealed_at) {
    orderingMatches =
      new Date(payload.committed_at).getTime() <= new Date(payload.revealed_at).getTime();
  }

  const partialMatch =
    commitmentMatches &&
    (orderingMatches === null || orderingMatches === true);
  const allMatch = !partialMatch
    ? false
    : outcomeReplayAvailable
      ? slots.every(s => s.matches)
      : null;

  return {
    commitmentMatches,
    recomputedHash,
    slots,
    orderingMatches,
    outcomeReplayAvailable,
    weightOrderPreserved: isGenericDraw ? weightOrder !== null : null,
    outcomeReplayReason: outcomeReplayAvailable
      ? null
      : payload.outcome_replay_reason ?? (
          isGenericDraw && !weightOrder
            ? "ordered_weight_contract_missing_or_invalid"
            : "client_seed_or_outcome_unavailable"
        ),
    partialMatch,
    allMatch,
  };
}

// ── Merkle inclusion ────────────────────────────────────────────────

/**
 * Compute a leaf hash for a revealed draw. Must match server-side
 * leafHash in src/lib/provable-draw/digest.ts byte-for-byte.
 */
export async function computeLeaf({ id, commitment, serverSeed, revealedAtIso }) {
  return sha256Hex(`${id}|${commitment}|${serverSeed ?? ""}|${revealedAtIso}`);
}

/**
 * Walk an array of leaf hashes bottom-up to the Merkle root. Mirrors
 * server-side pair-and-hash, duplicating the last element on odd sizes.
 */
export async function merkleRoot(leaves) {
  if (leaves.length === 0) return sha256Hex("");
  let layer = leaves.slice();
  while (layer.length > 1) {
    const next = [];
    for (let i = 0; i < layer.length; i += 2) {
      const L = layer[i];
      const R = i + 1 < layer.length ? layer[i + 1] : layer[i];
      next.push(await sha256HexPair(L, R));
    }
    layer = next;
  }
  return layer[0];
}

/**
 * Verify a specific leaf is included in a published digest. Given the
 * digest's full leaves array (/api/verify/digests/[id]) and the leaf's
 * index + expected hash, confirms both the index mapping AND that the
 * leaves as a whole hash to the published root.
 */
export async function verifyInclusion({ digestRoot, leaves, leafIndex, expectedLeaf }) {
  const claimedLeaf = leaves[leafIndex];
  const leafMatches = claimedLeaf && claimedLeaf.toLowerCase() === expectedLeaf.toLowerCase();
  const recomputedRoot = await merkleRoot(leaves);
  const rootMatches = recomputedRoot.toLowerCase() === digestRoot.toLowerCase();
  return { leafMatches, rootMatches, recomputedRoot, claimedLeaf };
}

// ── Hash chain ──────────────────────────────────────────────────────

const GENESIS = "0".repeat(64);

/**
 * Recompute the chain_hash for a sequence of digests starting from
 * `startingPrevHash` (pass GENESIS for the very first digest). Returns
 * { chainTip, chainValid } — chainValid is true iff every digest's
 * stored chain_hash agrees with sha256(prev || root).
 */
export async function verifyChain(digests, startingPrevHash = GENESIS) {
  let prev = startingPrevHash;
  for (const d of digests) {
    const cur = await sha256HexPair(prev, d.root);
    if (d.chain_hash && cur.toLowerCase() !== d.chain_hash.toLowerCase()) {
      return { chainTip: d.chain_hash, chainValid: false, firstBrokenId: d.id };
    }
    prev = d.chain_hash ?? cur;
  }
  return { chainTip: prev, chainValid: true };
}

// ── Small convenience wrappers ─────────────────────────────────────

/** Fetch a draw and run verifyDraw in one call. Browser-only (relies on fetch). */
export async function fetchAndVerifyDraw(drawId, baseUrl = "https://cambridgetcg.com") {
  const r = await fetch(`${baseUrl}/api/verify/draw/${drawId}`);
  if (!r.ok) throw new Error(`Draw fetch failed: ${r.status}`);
  const payload = await r.json();
  return { payload, verdict: await verifyDraw(payload) };
}

/** Fetch a pull and run verifyDraw in one call. */
export async function fetchAndVerifyPull(pullId, baseUrl = "https://cambridgetcg.com") {
  const r = await fetch(`${baseUrl}/api/verify/pull/${pullId}`);
  if (!r.ok) throw new Error(`Pull fetch failed: ${r.status}`);
  const payload = await r.json();
  return { payload, verdict: await verifyDraw(payload) };
}
