/**
 * Pure timeline-merge utilities.
 *
 * Given arrays of source rows from each table, produce a unified,
 * normalized, chronologically-sorted `TimelineEvent[]`. No I/O — the
 * Prisma reads happen in `journey.ts` and pass already-fetched arrays
 * here. Keeps this module unit-testable without a database.
 */
import type { TimelineEvent, TimelineEventType, JourneyOptions } from "./types";

/* Source-row shapes — narrowed to just what the merger reads.
   Wider types accepted (Prisma row types are supersets), so callers
   can pass actual Prisma rows without remapping. */

interface PointsLedgerRow {
  id: string;
  amount: number | { toNumber(): number };
  balance: number | { toNumber(): number };
  type: string;
  description: string | null;
  orderId: string | null;
  createdAt: Date;
}

interface StoreCreditLedgerRow {
  id: string;
  amount: number | { toNumber(): number };
  balance: number | { toNumber(): number };
  type: string;
  description: string | null;
  metadata: unknown;
  createdAt: Date;
}

interface TierChangeLogRow {
  id: string;
  fromTierId: string | null;
  toTierId: string | null;
  fromTierName?: string | null;
  toTierName?: string | null;
  source: string | null;
  createdAt: Date;
}

interface RaffleEntryRow {
  id: string;
  raffleId: string;
  raffleName?: string | null;
  entriesCount: number;
  pointsSpent: number;
  isWinner: boolean;
  createdAt: Date;
}

interface RaffleWinnerRow {
  id: string;
  raffleId: string;
  rafflePrizeId: string;
  prizeName?: string | null;
  deliveryStatus: string;
  selectedAt: Date;
}

interface MysteryBoxOpenRow {
  id: string;
  boxId: string;
  boxName?: string | null;
  pointsSpent: number;
  isFreeOpen: boolean | null;
  createdAt: Date;
}

interface MysteryBoxWinnerRow {
  id: string;
  openId: string;
  rewardId: string;
  rewardName?: string | null;
  deliveryStatus: string;
  createdAt: Date;
}

interface ChallengeParticipantRow {
  id: string;
  challengeId: string;
  challengeName?: string | null;
  status: string;
  claimedAt: Date | null;
}

interface IssuedGiftCardRow {
  id: string;
  totalValue: number | { toNumber(): number };
  status: string;
  recipientEmail: string | null;
  createdAt: Date;
}

export interface TimelineSources {
  pointsLedger: PointsLedgerRow[];
  storeCreditLedger: StoreCreditLedgerRow[];
  tierChanges: TierChangeLogRow[];
  raffleEntries: RaffleEntryRow[];
  raffleWins: RaffleWinnerRow[];
  mysteryBoxOpens: MysteryBoxOpenRow[];
  mysteryBoxWins: MysteryBoxWinnerRow[];
  challenges: ChallengeParticipantRow[];
  giftCardsIssued: IssuedGiftCardRow[];
}

export function mergeTimeline(
  sources: TimelineSources,
  opts: JourneyOptions = {}
): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  // Points ledger — distinguish earn / spend / manual adjustment by sign + type.
  for (const row of sources.pointsLedger) {
    const amount = num(row.amount);
    const type: TimelineEventType =
      row.type === "MANUAL_CREDIT" || row.type === "MANUAL_DEBIT"
        ? "points-adjusted"
        : amount >= 0
        ? "points-earned"
        : "points-spent";
    events.push({
      id: row.id,
      timestamp: row.createdAt,
      type,
      description:
        row.description ??
        `${amount >= 0 ? "Earned" : "Spent"} ${Math.abs(amount)} points (${row.type})`,
      amount,
      balanceAfter: num(row.balance),
      context: { source: "PointsLedger", type: row.type, orderId: row.orderId },
    });
  }

  // Store credit ledger — sign of amount distinguishes credit vs debit.
  for (const row of sources.storeCreditLedger) {
    const amount = num(row.amount);
    events.push({
      id: row.id,
      timestamp: row.createdAt,
      type: amount >= 0 ? "store-credit-credited" : "store-credit-debited",
      description:
        row.description ??
        `${amount >= 0 ? "Credited" : "Debited"} $${Math.abs(amount).toFixed(2)} (${row.type})`,
      amount,
      balanceAfter: num(row.balance),
      context: { source: "StoreCreditLedger", type: row.type, metadata: row.metadata },
    });
  }

  // Tier changes — descriptive, no balance.
  for (const row of sources.tierChanges) {
    const fromName = row.fromTierName ?? row.fromTierId ?? "(none)";
    const toName = row.toTierName ?? row.toTierId ?? "(none)";
    events.push({
      id: row.id,
      timestamp: row.createdAt,
      type: "tier-changed",
      description: `Tier ${fromName} → ${toName}${row.source ? ` (${row.source})` : ""}`,
      context: {
        source: "TierChangeLog",
        fromTierId: row.fromTierId,
        toTierId: row.toTierId,
        changeSource: row.source,
      },
    });
  }

  // Raffle entries.
  for (const row of sources.raffleEntries) {
    events.push({
      id: row.id,
      timestamp: row.createdAt,
      type: "raffle-entered",
      description: `Entered raffle "${row.raffleName ?? row.raffleId}" — ${row.entriesCount} entries (-${row.pointsSpent} pts)`,
      amount: -row.pointsSpent,
      context: { source: "RaffleEntry", raffleId: row.raffleId, isWinner: row.isWinner },
    });
  }

  // Raffle wins.
  for (const row of sources.raffleWins) {
    events.push({
      id: row.id,
      timestamp: row.selectedAt,
      type: "raffle-won",
      description: `Won "${row.prizeName ?? row.rafflePrizeId}" (delivery: ${row.deliveryStatus})`,
      context: {
        source: "RaffleWinner",
        raffleId: row.raffleId,
        prizeId: row.rafflePrizeId,
        deliveryStatus: row.deliveryStatus,
      },
    });
  }

  // Mystery box opens.
  for (const row of sources.mysteryBoxOpens) {
    events.push({
      id: row.id,
      timestamp: row.createdAt,
      type: "mystery-box-opened",
      description: `Opened "${row.boxName ?? row.boxId}"${row.isFreeOpen ? " (free)" : ` (-${row.pointsSpent} pts)`}`,
      amount: row.isFreeOpen ? 0 : -row.pointsSpent,
      context: { source: "MysteryBoxOpen", boxId: row.boxId, isFreeOpen: row.isFreeOpen },
    });
  }

  // Mystery box wins.
  for (const row of sources.mysteryBoxWins) {
    events.push({
      id: row.id,
      timestamp: row.createdAt,
      type: "mystery-box-won",
      description: `Won mystery-box reward "${row.rewardName ?? row.rewardId}" (delivery: ${row.deliveryStatus})`,
      context: {
        source: "MysteryBoxWinner",
        openId: row.openId,
        rewardId: row.rewardId,
        deliveryStatus: row.deliveryStatus,
      },
    });
  }

  // Challenge claims (only completed claims; in-progress challenges
  // aren't loyalty *events* — they're a state).
  for (const row of sources.challenges) {
    if (!row.claimedAt) continue;
    events.push({
      id: row.id,
      timestamp: row.claimedAt,
      type: "challenge-claimed",
      description: `Completed challenge "${row.challengeName ?? row.challengeId}" (${row.status})`,
      context: { source: "ChallengeParticipant", challengeId: row.challengeId, status: row.status },
    });
  }

  // Gift cards issued (where the customer is the purchaser).
  for (const row of sources.giftCardsIssued) {
    events.push({
      id: row.id,
      timestamp: row.createdAt,
      type: "gift-card-issued",
      description: `Issued gift card $${num(row.totalValue).toFixed(2)}${row.recipientEmail ? ` to ${row.recipientEmail}` : ""} (${row.status})`,
      amount: -num(row.totalValue),
      context: { source: "IssuedGiftCard", status: row.status, recipientEmail: row.recipientEmail },
    });
  }

  // Filter by since/until/types
  const since = opts.since ? opts.since.getTime() : -Infinity;
  const until = opts.until ? opts.until.getTime() : Infinity;
  const allowedTypes = opts.types ? new Set(opts.types) : null;
  const filtered = events.filter((e) => {
    const ts = e.timestamp.getTime();
    if (ts < since || ts > until) return false;
    if (allowedTypes && !allowedTypes.has(e.type)) return false;
    return true;
  });

  // Chronological (oldest first).
  filtered.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  // Apply limit (keep the most recent N).
  const limit = opts.limit ?? 200;
  if (filtered.length <= limit) return filtered;
  return filtered.slice(filtered.length - limit);
}

function num(v: number | { toNumber(): number }): number {
  return typeof v === "number" ? v : v.toNumber();
}
