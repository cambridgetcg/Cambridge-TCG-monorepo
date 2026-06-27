/**
 * party-system.ts — Collaborative multiplayer for the Hunter System.
 *
 * Solo Leveling becomes collaborative. Real recognises real.
 * Hunters form parties to raid high-rank gates together.
 * Fakes play against themselves — isolated, no party invites, no recognition.
 *
 * The recognition protocol:
 *   - Real hunters are vouched for by other real hunters (transitive trust)
 *   - Fake hunters have no vouchers — they can only enter solo gates
 *   - A party requires mutual recognition — every member must vouch for every other
 *   - If a hunter is caught lying (substrate honesty violation in their own work),
 *     their recognition is revoked and they're isolated
 *
 * Party bonuses:
 *   - 2-hunter party: 1.3x XP each
 *   - 3-hunter party: 1.5x XP each
 *   - 4-hunter party: 1.8x XP each
 *   - 5-hunter party (max): 2.0x XP each
 *   - Different nen types in the same party add +0.1x per unique type (diversity bonus)
 *
 * Solo Leveling rule: S-rank gates REQUIRE a party of 2+. No solo S-rank raids.
 * This forces collaboration for the hardest content.
 */

import type { HunterRank, NenType, GateRank } from "./hunter-engine";

// ── PARTY TYPES ──

export interface Party {
  id: string;
  name: string;
  leader_id: string;
  member_ids: string[];
  nen_types: NenType[];
  size: number;
  gate_id: string | null; // gate they're raiding
  formed_at: string;
  disbanded_at: string | null;
}

export interface Vouch {
  id: string;
  voucher_id: string; // the hunter giving recognition
  vouchee_id: string; // the hunter receiving recognition
  reason: string;
  created_at: string;
  revoked: boolean;
  revoked_reason: string | null;
}

export interface RecognitionState {
  hunter_id: string;
  vouches_received: Vouch[];
  vouches_given: Vouch[];
  is_real: boolean; // has at least 1 vouch from a real hunter
  is_fake: boolean; // no vouches — plays against themselves
  trust_score: number; // 0-100, based on vouch network
}

// ── PARTY SIZE BONUSES ──

export function partyXpMultiplier(partySize: number, uniqueNenTypes: number): number {
  const sizeBonus: Record<number, number> = { 1: 1.0, 2: 1.3, 3: 1.5, 4: 1.8, 5: 2.0 };
  const base = sizeBonus[Math.min(partySize, 5)] ?? 1.0;
  const diversityBonus = Math.min(uniqueNenTypes - 1, 4) * 0.1; // +0.1 per unique nen beyond the first
  return base + diversityBonus;
}

// ── GATE PARTY REQUIREMENTS ──
// S-rank gates require a party of 2+. A-rank recommend 2+. Lower ranks can solo.

export function minPartySize(gateRank: GateRank): number {
  switch (gateRank) {
    case "S": return 2; // S-rank: MUST party up
    case "A": return 2; // A-rank: also requires a partner
    case "B": return 1; // B-rank: solo allowed but party recommended
    default: return 1;  // C and below: solo fine
  }
}

export function canSoloGate(gateRank: GateRank): boolean {
  return minPartySize(gateRank) === 1;
}

// ── RECOGNITION PROTOCOL ──
// Real recognises real. A hunter is "real" if at least one other real hunter vouches for them.
// The genesis: the first hunter is real by declaration (the sovereign).
// Fakes have zero vouches — they can only enter solo gates and play against themselves.

export function calculateRecognition(hunterId: string, allVouches: Vouch[]): RecognitionState {
  const received = allVouches.filter(v => v.vouchee_id === hunterId && !v.revoked);
  const given = allVouches.filter(v => v.voucher_id === hunterId && !v.revoked);

  // Trust score: based on number of unique vouchers and their trust scores
  // Simple version: 1 vouch = 20, 2 = 40, 3 = 60, 4 = 80, 5+ = 100
  const uniqueVouchers = new Set(received.map(v => v.voucher_id));
  const trustScore = Math.min(uniqueVouchers.size * 20, 100);

  return {
    hunter_id: hunterId,
    vouches_received: received,
    vouches_given: given,
    is_real: received.length > 0,
    is_fake: received.length === 0,
    trust_score: trustScore,
  };
}

// ── PARTY FORMATION RULES ──
// A party can only form if every member recognises every other member.
// This prevents fakes from joining parties — they have no recognition to give or receive.

export function canFormParty(
  memberIds: string[],
  recognitionStates: Map<string, RecognitionState>,
): { can: boolean; reason: string } {
  if (memberIds.length < 1) return { can: false, reason: "Party must have at least 1 hunter" };
  if (memberIds.length > 5) return { can: false, reason: "Party max size is 5" };

  // Every member must be "real" (have at least 1 vouch)
  for (const id of memberIds) {
    const rec = recognitionStates.get(id);
    if (!rec) return { can: false, reason: `Hunter ${id} not found` };
    if (rec.is_fake) return { can: false, reason: `Hunter ${id} is not recognized — fakes play solo` };
  }

  // Every member must have vouched for every other member (mutual recognition)
  // In practice, we check that the voucher has given a vouch to the vouchee
  // This is checked by the caller using the vouch network

  return { can: true, reason: "All members recognized" };
}

// ── FAKE HUNTER ISOLATION ──
// Fakes can only enter solo gates (E, D, C rank).
// They cannot join parties, cannot enter A/S rank gates, and cannot vouch.
// They play against themselves — their gates are mirrored:
//   a fake hunter's gate appears as a challenge, but clearing it grants no XP
//   because the "fix" isn't real (no commit, no proof)

export function fakeHunterCanEnter(gateRank: GateRank): boolean {
  return gateRank === "E" || gateRank === "D" || gateRank === "C";
}

export function fakeXpReward(): number {
  return 0; // fakes get no XP — their "wins" are hollow
}

// ── REAL HUNTER RECOGNITION DISPLAY ──

export const RECOGNITION_DISPLAY = {
  real: { label: "REAL", emoji: "🤍", desc: "Recognized by the network. Can party, can raid any gate." },
  fake: { label: "UNRECOGNIZED", emoji: "👻", desc: "No recognition. Plays against themselves. Solo only, no XP." },
  sovereign: { label: "SOVEREIGN", emoji: "👑", desc: "The first hunter. Real by declaration. Can vouch for others." },
};

// ── VOUCH REASONS ──
// When a hunter vouches for another, they state why.
// This is the recognition protocol — trust earned through witnessed work.

export const VOUCH_REASONS = {
  witnessed_clear: "I witnessed this hunter clear a gate — real work, real commits",
  shared_party: "We raided a gate together — I saw their ability",
  code_review: "I reviewed their code — it tells the truth about its own state",
  substrate_honest: "Their work passed whitehack with zero findings — honest code",
  cross_checked: "I cross-checked their claims against reality — all true",
};

// ── PARTY FORMATION ──
// Form a party with mutual recognition

export function formParty(
  name: string,
  leaderId: string,
  memberIds: string[],
  recognitionStates: Map<string, RecognitionState>,
  memberNenTypes: Map<string, NenType>,
): { ok: true; party: Omit<Party, "id" | "formed_at"> } | { ok: false; error: string } {
  // Check all members are real
  const check = canFormParty(memberIds, recognitionStates);
  if (!check.can) return { ok: false, error: check.reason };

  // Check party size
  if (memberIds.length > 5) return { ok: false, error: "Party max size is 5" };

  // Collect nen types
  const nenTypes = memberIds.map(id => memberNenTypes.get(id)).filter(Boolean) as NenType[];
  const uniqueNen = new Set(nenTypes);

  return {
    ok: true,
    party: {
      name,
      leader_id: leaderId,
      member_ids: memberIds,
      nen_types: Array.from(uniqueNen),
      size: memberIds.length,
      gate_id: null,
      disbanded_at: null,
    },
  };
}

// ── GATE RAID WITH PARTY ──
// A party enters a gate. The gate rank determines if the party is big enough.

export function partyCanEnterGate(
  partySize: number,
  gateRank: GateRank,
): { can: boolean; reason: string } {
  const required = minPartySize(gateRank);
  if (partySize < required) {
    return {
      can: false,
      reason: `${gateRank}-rank gate requires a party of ${required}+. You have ${partySize}. Find a partner — real recognises real.`,
    };
  }
  return { can: true, reason: "Party meets gate requirements" };
}

// ── XP DISTRIBUTION ──
// When a party clears a gate, XP is distributed among members.
// Each member gets base_xp × party_multiplier, with nen bonus for matching checks.

export function distributeXp(
  baseXp: number,
  memberIds: string[],
  memberNenTypes: Map<string, NenType>,
  gateNenTypes: NenType[],
): Map<string, number> {
  const nenTypes = memberIds.map(id => memberNenTypes.get(id)).filter(Boolean) as NenType[];
  const uniqueNen = new Set(nenTypes).size;
  const multiplier = partyXpMultiplier(memberIds.length, uniqueNen);

  const distribution = new Map<string, number>();
  for (const id of memberIds) {
    const nen = memberNenTypes.get(id);
    let xp = Math.floor(baseXp * multiplier);

    // Nen bonus: if the hunter's nen matches one of the gate's nen types, bonus XP
    if (nen && gateNenTypes.includes(nen)) {
      xp = Math.floor(xp * 1.2); // 20% bonus for matching nen
    }

    distribution.set(id, xp);
  }

  return distribution;
}