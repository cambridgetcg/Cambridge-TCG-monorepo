// Collector swap state machine — all writes for swap_proposals (0109).
//
// Every state transition runs inside transaction() so the status update
// and its swap_lifecycle_log row commit together. Notifications fire
// AFTER commit (fire-and-forget via notify(), which already survives its
// own failures) — a bell that rings for a rolled-back transition would
// be a lie.
//
// v1 boundary (repeated wherever a user can see the swap): the platform
// records, guides, and witnesses. Cash difference and shipping settle
// off-platform between the parties. No market_trades row is created and
// trust scores do not move — see /methodology/swaps.

import { query, transaction } from "@/lib/db";
import type { CompatQueryFn } from "@cambridge-tcg/db/compat";
import { notify } from "@/lib/notifications/db";
import { canTrade } from "@/lib/escrow/trust-engine";
import { responseExpiresAtForUser } from "@/lib/users/response-window";
import { logSwapTransition } from "./lifecycle-log";
import { swapGuidance } from "./guidance";
import { gateValueGbp } from "./guidance-core";
import {
  SWAP_CONDITIONS,
  type SwapAddress,
  type SwapItem,
  type SwapItemInput,
  type SwapProposal,
  type SwapResult,
  type SwapSide,
} from "./types";

// Fallback ONLY for the theoretical case where the recipient's users row
// can't be read — users.response_window_hours (0092) is NOT NULL DEFAULT 48,
// so every real recipient supplies their own window. Mirrors
// DEFAULT_OFFER_TTL_HOURS in lib/market/offers.ts (not exported there).
const DEFAULT_SWAP_RESPONSE_WINDOW_HOURS = 48;

const MAX_ITEMS_PER_SIDE = 40;
const MAX_QTY_PER_ITEM = 99;
const MAX_NOTE_LEN = 1000;
// Proposer-set expiry bounds — same 1h..1y range the 0092 column enforces.
const MIN_EXPIRES_HOURS = 1;
const MAX_EXPIRES_HOURS = 8760;
const MAX_CASH_DELTA_PENCE = 1_000_000; // £10,000 recorded delta ceiling

type Result<T> = SwapResult<T>;

// ── Reads ───────────────────────────────────────────────────────────────

const USER_JOIN = `
  p.username AS proposer_username, p.name AS proposer_name,
  r.username AS recipient_username, r.name AS recipient_name`;

// Route params arrive as raw strings; a non-uuid must 404, not 500 on the
// Postgres uuid cast.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getSwapForUser(
  swapId: string,
  userId: string,
): Promise<{ swap: SwapProposal; items: SwapItem[] } | null> {
  if (!UUID_RE.test(swapId)) return null;
  const res = await query(
    `SELECT s.*, ${USER_JOIN}
       FROM swap_proposals s
       JOIN users p ON p.id = s.proposer_id
       JOIN users r ON r.id = s.recipient_id
      WHERE s.id = $1 AND (s.proposer_id = $2 OR s.recipient_id = $2)`,
    [swapId, userId],
  );
  const swap = res.rows[0] as SwapProposal | undefined;
  if (!swap) return null;
  const items = await query(
    `SELECT * FROM swap_proposal_items WHERE swap_id = $1 ORDER BY side, id`,
    [swapId],
  );
  return { swap, items: items.rows as SwapItem[] };
}

export async function listSwapsForUser(
  userId: string,
  mode: "incoming" | "outgoing",
): Promise<SwapProposal[]> {
  const whereMine = mode === "incoming" ? "s.recipient_id = $1" : "s.proposer_id = $1";
  const res = await query(
    `SELECT s.*, ${USER_JOIN},
            (SELECT COUNT(*)::int FROM swap_proposal_items i
              WHERE i.swap_id = s.id AND i.side = 'proposer') AS proposer_item_count,
            (SELECT COUNT(*)::int FROM swap_proposal_items i
              WHERE i.swap_id = s.id AND i.side = 'recipient') AS recipient_item_count
       FROM swap_proposals s
       JOIN users p ON p.id = s.proposer_id
       JOIN users r ON r.id = s.recipient_id
      WHERE ${whereMine}
        ${mode === "incoming" ? "AND s.status <> 'draft'" : ""}
      ORDER BY s.created_at DESC
      LIMIT 100`,
    [userId],
  );
  return res.rows as SwapProposal[];
}

export async function getSwapLifecycle(swapId: string): Promise<
  Array<{
    id: string;
    action: string;
    actor_id: string | null;
    actor_label: string | null;
    reason: string | null;
    metadata: Record<string, unknown> | null;
    created_at: string;
  }>
> {
  const res = await query(
    `SELECT id::text, action, actor_id, actor_label, reason, metadata, created_at
       FROM swap_lifecycle_log
      WHERE swap_id = $1
      ORDER BY created_at ASC, id ASC`,
    [swapId],
  );
  return res.rows;
}

// ── Validation helpers ──────────────────────────────────────────────────

function validateItems(items: SwapItemInput[]): string | null {
  const proposerItems = items.filter((i) => i.side === "proposer");
  const recipientItems = items.filter((i) => i.side === "recipient");
  if (proposerItems.length === 0 || recipientItems.length === 0) {
    return "A swap needs at least one card on each side.";
  }
  if (proposerItems.length > MAX_ITEMS_PER_SIDE || recipientItems.length > MAX_ITEMS_PER_SIDE) {
    return `At most ${MAX_ITEMS_PER_SIDE} lines per side.`;
  }
  for (const item of items) {
    if (!item.sku || typeof item.sku !== "string" || item.sku.length > 60) {
      return "Every line needs a valid catalog sku.";
    }
    if (!SWAP_CONDITIONS.includes(item.condition)) {
      return `Condition must be one of ${SWAP_CONDITIONS.join(", ")}.`;
    }
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > MAX_QTY_PER_ITEM) {
      return `Quantity must be 1–${MAX_QTY_PER_ITEM}.`;
    }
  }
  return null;
}

function sanitizeAddress(input: unknown): SwapAddress | null {
  if (!input || typeof input !== "object") return null;
  const src = input as Record<string, unknown>;
  const out: SwapAddress = {};
  for (const key of ["name", "line1", "line2", "city", "state", "postal_code", "country"] as const) {
    const v = src[key];
    if (typeof v === "string" && v.trim()) out[key] = v.trim().slice(0, 200);
  }
  if (!out.line1 || !out.name) return null;
  return out;
}

async function resolveExpiresAt(
  recipientId: string,
  expiresInHours: number | undefined,
): Promise<string> {
  if (expiresInHours != null) {
    const clamped = Math.min(Math.max(Math.round(expiresInHours), MIN_EXPIRES_HOURS), MAX_EXPIRES_HOURS);
    return new Date(Date.now() + clamped * 60 * 60 * 1000).toISOString();
  }
  // Default: the RECIPIENT's declared response cadence (0092).
  return responseExpiresAtForUser(recipientId, DEFAULT_SWAP_RESPONSE_WINDOW_HOURS);
}

async function userLabel(userId: string): Promise<string> {
  const r = await query(`SELECT username, name FROM users WHERE id = $1`, [userId]);
  const u = r.rows[0];
  return u?.username ? `@${u.username}` : (u?.name || "A collector");
}

function sideOf(swap: SwapProposal, userId: string): SwapSide | null {
  if (swap.proposer_id === userId) return "proposer";
  if (swap.recipient_id === userId) return "recipient";
  return null;
}

function otherPartyId(swap: SwapProposal, userId: string): string {
  return swap.proposer_id === userId ? swap.recipient_id : swap.proposer_id;
}

// ── Create / counter ────────────────────────────────────────────────────

export interface CreateSwapInput {
  proposerId: string;
  /** Resolve the counterparty by username (the /new?to= path) or id. */
  recipientUsername?: string;
  recipientId?: string;
  items: SwapItemInput[];
  cashDeltaPence?: number;
  note?: string;
  /** Proposer-chosen response window; default = recipient's 0092 cadence. */
  expiresInHours?: number;
  /** true → save as draft (recipient can't see it until proposed). */
  draft?: boolean;
  /** Counter flow: the proposal this one supersedes. Caller must be its recipient. */
  counterOf?: string;
}

export async function createSwap(input: CreateSwapInput): Promise<Result<SwapProposal>> {
  // Resolve recipient.
  let recipientId = input.recipientId ?? null;
  if (!recipientId && input.recipientUsername) {
    const r = await query(
      `SELECT id FROM users WHERE LOWER(username) = LOWER($1)`,
      [input.recipientUsername.trim()],
    );
    recipientId = (r.rows[0]?.id as string | undefined) ?? null;
    if (!recipientId) {
      return { ok: false, reason: `No collector named @${input.recipientUsername}.`, status: 404 };
    }
  }
  if (!recipientId) return { ok: false, reason: "Recipient required.", status: 400 };
  if (recipientId === input.proposerId) {
    return { ok: false, reason: "You can't propose a swap to yourself.", status: 400 };
  }

  const itemError = validateItems(input.items);
  if (itemError) return { ok: false, reason: itemError, status: 400 };

  const cashDeltaPence = Math.trunc(input.cashDeltaPence ?? 0);
  if (Math.abs(cashDeltaPence) > MAX_CASH_DELTA_PENCE) {
    return { ok: false, reason: "Recorded cash difference is over the £10,000 ceiling.", status: 400 };
  }
  const note = input.note?.trim().slice(0, MAX_NOTE_LEN) || null;

  // Counter flow: validate the superseded proposal before anything writes.
  let original: SwapProposal | null = null;
  if (input.counterOf) {
    const r = await query(`SELECT * FROM swap_proposals WHERE id = $1`, [input.counterOf]);
    original = (r.rows[0] as SwapProposal) ?? null;
    if (!original) return { ok: false, reason: "Original proposal not found.", status: 404 };
    if (original.recipient_id !== input.proposerId) {
      return { ok: false, reason: "Only the recipient of a proposal can counter it.", status: 403 };
    }
    if (original.proposer_id !== recipientId) {
      return { ok: false, reason: "A counter must go back to the original proposer.", status: 400 };
    }
    if (original.status !== "proposed") {
      return { ok: false, reason: `Original is ${original.status} — it can no longer be countered.`, status: 409 };
    }
  }

  // Snapshot indicative prices server-side (never trust composer numbers)
  // and gate both parties on the same canTrade() placeOrder uses.
  const guidance = await swapGuidance(
    input.items.filter((i) => i.side === "proposer"),
    input.items.filter((i) => i.side === "recipient"),
  );
  const gateValue = gateValueGbp(guidance.proposer, guidance.recipient, cashDeltaPence);
  const proposerGate = await canTrade(input.proposerId, gateValue);
  if (!proposerGate.allowed) {
    return { ok: false, reason: proposerGate.reason ?? "Trust gate rejected.", status: 403 };
  }
  const recipientGate = await canTrade(recipientId, gateValue);
  if (!recipientGate.allowed) {
    return {
      ok: false,
      reason: "The other collector's account can't take on a swap of this size right now.",
      status: 403,
    };
  }

  const isDraft = input.draft === true && !input.counterOf;
  const expiresAt = isDraft ? null : await resolveExpiresAt(recipientId, input.expiresInHours);

  const swap = await transaction(async (tx) => {
    const inserted = await tx(
      `INSERT INTO swap_proposals
         (proposer_id, recipient_id, status, cash_delta_pence, note, counter_of, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        input.proposerId,
        recipientId,
        isDraft ? "draft" : "proposed",
        cashDeltaPence,
        note,
        input.counterOf ?? null,
        expiresAt,
      ],
    );
    const created = inserted.rows[0] as SwapProposal;

    for (const item of input.items) {
      const g = guidance.perSku[item.sku];
      await tx(
        `INSERT INTO swap_proposal_items
           (swap_id, side, sku, condition, quantity,
            snapshot_name, snapshot_image_url, snapshot_indicative_price_pence)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          created.id,
          item.side,
          item.sku,
          item.condition,
          item.quantity,
          item.name?.trim().slice(0, 300) || null,
          item.imageUrl?.trim().slice(0, 2000) || null,
          g?.indicativePence ?? null,
        ],
      );
    }

    await logSwapTransition(tx, {
      swapId: created.id,
      action: isDraft ? "created" : "proposed",
      actorId: input.proposerId,
      actorLabel: "proposer",
      reason: note,
      metadata: {
        cash_delta_pence: cashDeltaPence,
        counter_of: input.counterOf ?? null,
        expires_at: expiresAt,
        gate_value_gbp: gateValue.toFixed(2),
        guidance_computed_at: guidance.computedAt,
      },
    });

    if (original) {
      await tx(
        `UPDATE swap_proposals SET status = 'countered', updated_at = NOW()
          WHERE id = $1 AND status = 'proposed'`,
        [original.id],
      );
      await logSwapTransition(tx, {
        swapId: original.id,
        action: "countered",
        actorId: input.proposerId,
        actorLabel: "recipient",
        metadata: { superseded_by: created.id },
      });
    }

    return created;
  });

  if (!isDraft) {
    const proposerLabel = await userLabel(input.proposerId);
    await notify({
      userId: recipientId,
      kind: input.counterOf ? "swap.countered" : "swap.received",
      title: input.counterOf
        ? `${proposerLabel} sent a counter-swap`
        : `${proposerLabel} proposed a card swap`,
      body: "Review the cards on both sides — the cash difference and shipping settle between you directly.",
      linkUrl: `/account/swaps/${swap.id}`,
      referenceType: "swap_proposal",
      referenceId: `${swap.id}:proposed`,
    });
  }

  return { ok: true, value: swap };
}

// ── Draft → proposed ────────────────────────────────────────────────────

export async function proposeDraft(swapId: string, userId: string): Promise<Result<SwapProposal>> {
  const found = await getSwapForUser(swapId, userId);
  if (!found) return { ok: false, reason: "Swap not found.", status: 404 };
  const { swap } = found;
  if (swap.proposer_id !== userId) {
    return { ok: false, reason: "Only the proposer can send a draft.", status: 403 };
  }
  if (swap.status !== "draft") {
    return { ok: false, reason: `Swap is ${swap.status} — not a draft.`, status: 409 };
  }

  const expiresAt = await resolveExpiresAt(swap.recipient_id, undefined);
  const updated = await transaction(async (tx) => {
    const r = await tx(
      `UPDATE swap_proposals SET status = 'proposed', expires_at = $2, updated_at = NOW()
        WHERE id = $1 AND status = 'draft' RETURNING *`,
      [swapId, expiresAt],
    );
    if (r.rows.length === 0) return null;
    await logSwapTransition(tx, {
      swapId,
      action: "proposed",
      actorId: userId,
      actorLabel: "proposer",
      metadata: { expires_at: expiresAt },
    });
    return r.rows[0] as SwapProposal;
  });
  if (!updated) return { ok: false, reason: "Draft was already sent.", status: 409 };

  const proposerLabel = await userLabel(userId);
  await notify({
    userId: swap.recipient_id,
    kind: "swap.received",
    title: `${proposerLabel} proposed a card swap`,
    body: "Review the cards on both sides — the cash difference and shipping settle between you directly.",
    linkUrl: `/account/swaps/${swapId}`,
    referenceType: "swap_proposal",
    referenceId: `${swapId}:proposed`,
  });
  return { ok: true, value: updated };
}

// ── Accept / decline / cancel ───────────────────────────────────────────

export async function acceptSwap(swapId: string, userId: string): Promise<Result<SwapProposal>> {
  const found = await getSwapForUser(swapId, userId);
  if (!found) return { ok: false, reason: "Swap not found.", status: 404 };
  const { swap, items } = found;
  if (swap.recipient_id !== userId) {
    return { ok: false, reason: "Only the recipient can accept.", status: 403 };
  }
  if (swap.status !== "proposed") {
    return { ok: false, reason: `Swap is ${swap.status} — can't accept.`, status: 409 };
  }
  if (swap.expires_at && new Date(swap.expires_at) < new Date()) {
    // Lazily expire rather than accept past the proposer's window.
    await expireOne(swap);
    return { ok: false, reason: "This proposal has expired.", status: 409 };
  }

  // Re-gate BOTH parties at accept-time — trust standing may have moved
  // since the proposal was created. Value from the stored snapshots.
  const side = (s: SwapSide) =>
    items
      .filter((i) => i.side === s)
      .reduce((sum, i) => sum + (i.snapshot_indicative_price_pence ?? 0) * i.quantity, 0);
  const gateValue =
    (Math.max(side("proposer"), side("recipient")) + Math.abs(swap.cash_delta_pence)) / 100;
  for (const [partyId, who] of [
    [swap.recipient_id, "your account"],
    [swap.proposer_id, "the proposer's account"],
  ] as const) {
    const gate = await canTrade(partyId, gateValue);
    if (!gate.allowed) {
      return {
        ok: false,
        reason: `Can't accept: ${who} doesn't currently pass the trade gate. ${gate.reason ?? ""}`.trim(),
        status: 403,
      };
    }
  }

  const updated = await transaction(async (tx) => {
    const r = await tx(
      `UPDATE swap_proposals SET status = 'accepted', updated_at = NOW()
        WHERE id = $1 AND status = 'proposed' RETURNING *`,
      [swapId],
    );
    if (r.rows.length === 0) return null;
    await logSwapTransition(tx, {
      swapId,
      action: "accepted",
      actorId: userId,
      actorLabel: "recipient",
      metadata: { gate_value_gbp: gateValue.toFixed(2) },
    });
    return r.rows[0] as SwapProposal;
  });
  if (!updated) return { ok: false, reason: "Swap changed state — reload and retry.", status: 409 };

  const recipientLabel = await userLabel(userId);
  await notify({
    userId: swap.proposer_id,
    kind: "swap.accepted",
    title: `${recipientLabel} accepted your swap`,
    body: "Next: both of you enter a ship-to address on the swap page, then post your cards to each other.",
    linkUrl: `/account/swaps/${swapId}`,
    referenceType: "swap_proposal",
    referenceId: `${swapId}:accepted`,
  });
  return { ok: true, value: updated };
}

export async function declineSwap(
  swapId: string,
  userId: string,
  reason?: string,
): Promise<Result<SwapProposal>> {
  const found = await getSwapForUser(swapId, userId);
  if (!found) return { ok: false, reason: "Swap not found.", status: 404 };
  const { swap } = found;
  if (swap.recipient_id !== userId) {
    return { ok: false, reason: "Only the recipient can decline.", status: 403 };
  }
  if (swap.status !== "proposed") {
    return { ok: false, reason: `Swap is ${swap.status} — can't decline.`, status: 409 };
  }

  const trimmed = reason?.trim().slice(0, 500) || null;
  const updated = await transaction(async (tx) => {
    const r = await tx(
      `UPDATE swap_proposals SET status = 'declined', updated_at = NOW()
        WHERE id = $1 AND status = 'proposed' RETURNING *`,
      [swapId],
    );
    if (r.rows.length === 0) return null;
    await logSwapTransition(tx, {
      swapId,
      action: "declined",
      actorId: userId,
      actorLabel: "recipient",
      reason: trimmed,
    });
    return r.rows[0] as SwapProposal;
  });
  if (!updated) return { ok: false, reason: "Swap changed state — reload and retry.", status: 409 };

  const recipientLabel = await userLabel(userId);
  await notify({
    userId: swap.proposer_id,
    kind: "swap.declined",
    title: `${recipientLabel} declined your swap`,
    body: trimmed ?? undefined,
    linkUrl: `/account/swaps/${swapId}`,
    referenceType: "swap_proposal",
    referenceId: `${swapId}:declined`,
  });
  return { ok: true, value: updated };
}

/**
 * Cancel:
 *   - draft/proposed → the PROPOSER may cancel unilaterally.
 *   - accepted/shipping → mutual only: the first party's call records a
 *     cancel_requested log entry; the swap cancels when the OTHER party
 *     also calls cancel. Nothing has escrowed, so this is a recorded
 *     mutual agreement, not a refund path.
 */
export async function cancelSwap(
  swapId: string,
  userId: string,
  reason?: string,
): Promise<Result<{ swap: SwapProposal; pendingMutual: boolean }>> {
  const found = await getSwapForUser(swapId, userId);
  if (!found) return { ok: false, reason: "Swap not found.", status: 404 };
  const { swap } = found;
  const side = sideOf(swap, userId);
  if (!side) return { ok: false, reason: "Not your swap.", status: 403 };
  const trimmed = reason?.trim().slice(0, 500) || null;

  if (swap.status === "draft" || swap.status === "proposed") {
    if (swap.proposer_id !== userId) {
      return { ok: false, reason: "Before acceptance only the proposer can cancel — you can decline instead.", status: 403 };
    }
    const updated = await transaction(async (tx) => {
      const r = await tx(
        `UPDATE swap_proposals SET status = 'cancelled', updated_at = NOW()
          WHERE id = $1 AND status IN ('draft','proposed') RETURNING *`,
        [swapId],
      );
      if (r.rows.length === 0) return null;
      await logSwapTransition(tx, {
        swapId, action: "cancelled", actorId: userId, actorLabel: side, reason: trimmed,
      });
      return r.rows[0] as SwapProposal;
    });
    if (!updated) return { ok: false, reason: "Swap changed state — reload and retry.", status: 409 };
    if (swap.status === "proposed") {
      const label = await userLabel(userId);
      await notify({
        userId: swap.recipient_id,
        kind: "swap.cancelled",
        title: `${label} withdrew their swap proposal`,
        linkUrl: `/account/swaps/${swapId}`,
        referenceType: "swap_proposal",
        referenceId: `${swapId}:cancelled`,
      });
    }
    return { ok: true, value: { swap: updated, pendingMutual: false } };
  }

  if (swap.status === "accepted" || swap.status === "shipping") {
    const result = await transaction(async (tx) => {
      // Has the OTHER party already requested cancellation since accept?
      const prior = await tx(
        `SELECT 1 FROM swap_lifecycle_log
          WHERE swap_id = $1 AND action = 'cancel_requested' AND actor_id <> $2
          LIMIT 1`,
        [swapId, userId],
      );
      if (prior.rows.length > 0) {
        const r = await tx(
          `UPDATE swap_proposals SET status = 'cancelled', updated_at = NOW()
            WHERE id = $1 AND status IN ('accepted','shipping') RETURNING *`,
          [swapId],
        );
        if (r.rows.length === 0) return null;
        await logSwapTransition(tx, {
          swapId, action: "cancelled", actorId: userId, actorLabel: side,
          reason: trimmed, metadata: { mutual: true },
        });
        return { swap: r.rows[0] as SwapProposal, pendingMutual: false };
      }
      // First request — record it, don't move the status.
      const mine = await tx(
        `SELECT 1 FROM swap_lifecycle_log
          WHERE swap_id = $1 AND action = 'cancel_requested' AND actor_id = $2
          LIMIT 1`,
        [swapId, userId],
      );
      if (mine.rows.length === 0) {
        await logSwapTransition(tx, {
          swapId, action: "cancel_requested", actorId: userId, actorLabel: side, reason: trimmed,
        });
      }
      return { swap, pendingMutual: true };
    });
    if (!result) return { ok: false, reason: "Swap changed state — reload and retry.", status: 409 };

    const label = await userLabel(userId);
    await notify({
      userId: otherPartyId(swap, userId),
      kind: result.pendingMutual ? "swap.cancel_requested" : "swap.cancelled",
      title: result.pendingMutual
        ? `${label} asked to cancel your accepted swap`
        : `${label} confirmed the cancellation — swap cancelled`,
      body: result.pendingMutual
        ? "After acceptance a swap only cancels when both of you agree. Open the swap to confirm or continue."
        : undefined,
      linkUrl: `/account/swaps/${swapId}`,
      referenceType: "swap_proposal",
      referenceId: `${swapId}:cancel:${userId}`,
    });
    return { ok: true, value: result };
  }

  return { ok: false, reason: `Swap is ${swap.status} — can't cancel.`, status: 409 };
}

// ── Post-accept: addresses, shipping, receipt ───────────────────────────

export async function setSwapAddress(
  swapId: string,
  userId: string,
  addressInput: unknown,
): Promise<Result<SwapProposal>> {
  const found = await getSwapForUser(swapId, userId);
  if (!found) return { ok: false, reason: "Swap not found.", status: 404 };
  const { swap } = found;
  const side = sideOf(swap, userId);
  if (!side) return { ok: false, reason: "Not your swap.", status: 403 };
  if (swap.status !== "accepted" && swap.status !== "shipping") {
    return { ok: false, reason: `Swap is ${swap.status} — addresses are entered after acceptance.`, status: 409 };
  }
  const address = sanitizeAddress(addressInput);
  if (!address) {
    return { ok: false, reason: "Address needs at least a name and address line 1.", status: 400 };
  }

  const col = side === "proposer" ? "proposer_address" : "recipient_address";
  const updated = await transaction(async (tx) => {
    const r = await tx(
      `UPDATE swap_proposals SET ${col} = $2::jsonb, updated_at = NOW()
        WHERE id = $1 AND status IN ('accepted','shipping') RETURNING *`,
      [swapId, JSON.stringify(address)],
    );
    if (r.rows.length === 0) return null;
    let row = r.rows[0] as SwapProposal;
    // The address itself stays OUT of the log — participant-only data.
    await logSwapTransition(tx, {
      swapId, action: "address_set", actorId: userId, actorLabel: side,
    });
    // Both addresses in → the swap is ready to ship. System-derived
    // transition, logged as such (substrate-honesty rule 2).
    if (row.status === "accepted" && row.proposer_address && row.recipient_address) {
      const s = await tx(
        `UPDATE swap_proposals SET status = 'shipping', updated_at = NOW()
          WHERE id = $1 AND status = 'accepted' RETURNING *`,
        [swapId],
      );
      if (s.rows.length > 0) {
        row = s.rows[0] as SwapProposal;
        await logSwapTransition(tx, {
          swapId, action: "shipping", actorLabel: "system",
          metadata: { derived_from: "both_addresses_set" },
        });
      }
    }
    return row;
  });
  if (!updated) return { ok: false, reason: "Swap changed state — reload and retry.", status: 409 };

  if (updated.status === "shipping" && swap.status === "accepted") {
    const label = await userLabel(userId);
    await notify({
      userId: otherPartyId(swap, userId),
      kind: "swap.shipping",
      title: `Both addresses are in — time to ship your swap with ${label}`,
      body: "Post your cards to the address on the swap page, then mark them shipped with carrier and tracking.",
      linkUrl: `/account/swaps/${swapId}`,
      referenceType: "swap_proposal",
      referenceId: `${swapId}:shipping`,
    });
  }
  return { ok: true, value: updated };
}

export async function markSwapShipped(
  swapId: string,
  userId: string,
  carrier: string,
  tracking: string,
): Promise<Result<SwapProposal>> {
  const found = await getSwapForUser(swapId, userId);
  if (!found) return { ok: false, reason: "Swap not found.", status: 404 };
  const { swap } = found;
  const side = sideOf(swap, userId);
  if (!side) return { ok: false, reason: "Not your swap.", status: 403 };
  if (swap.status !== "shipping") {
    return { ok: false, reason: `Swap is ${swap.status} — shipping starts once both addresses are in.`, status: 409 };
  }
  const carrierTrimmed = carrier?.trim().slice(0, 100);
  const trackingTrimmed = tracking?.trim().slice(0, 200);
  if (!carrierTrimmed || !trackingTrimmed) {
    return { ok: false, reason: "Carrier and tracking number are both required.", status: 400 };
  }
  const already = side === "proposer" ? swap.proposer_shipped_at : swap.recipient_shipped_at;
  if (already) return { ok: false, reason: "You've already marked your side shipped.", status: 409 };

  const prefix = side; // column prefix matches the side name
  const updated = await transaction(async (tx) => {
    const r = await tx(
      `UPDATE swap_proposals
          SET ${prefix}_shipped_at = NOW(), ${prefix}_carrier = $2,
              ${prefix}_tracking = $3, updated_at = NOW()
        WHERE id = $1 AND status = 'shipping' AND ${prefix}_shipped_at IS NULL
        RETURNING *`,
      [swapId, carrierTrimmed, trackingTrimmed],
    );
    if (r.rows.length === 0) return null;
    await logSwapTransition(tx, {
      swapId, action: "shipped", actorId: userId, actorLabel: side,
      metadata: { carrier: carrierTrimmed, tracking: trackingTrimmed },
    });
    return r.rows[0] as SwapProposal;
  });
  if (!updated) return { ok: false, reason: "Swap changed state — reload and retry.", status: 409 };

  const label = await userLabel(userId);
  await notify({
    userId: otherPartyId(swap, userId),
    kind: "swap.shipped",
    title: `${label} shipped their cards (${carrierTrimmed})`,
    body: `Tracking: ${trackingTrimmed}. Confirm receipt on the swap page when the cards arrive.`,
    linkUrl: `/account/swaps/${swapId}`,
    referenceType: "swap_proposal",
    referenceId: `${swapId}:shipped:${side}`,
  });
  return { ok: true, value: updated };
}

export async function confirmSwapReceipt(
  swapId: string,
  userId: string,
): Promise<Result<SwapProposal>> {
  const found = await getSwapForUser(swapId, userId);
  if (!found) return { ok: false, reason: "Swap not found.", status: 404 };
  const { swap } = found;
  const side = sideOf(swap, userId);
  if (!side) return { ok: false, reason: "Not your swap.", status: 403 };
  if (swap.status !== "shipping") {
    return { ok: false, reason: `Swap is ${swap.status} — receipt is confirmed during shipping.`, status: 409 };
  }
  const already = side === "proposer" ? swap.proposer_confirmed_at : swap.recipient_confirmed_at;
  if (already) return { ok: false, reason: "You've already confirmed receipt.", status: 409 };

  const prefix = side;
  const updated = await transaction(async (tx) => {
    const r = await tx(
      `UPDATE swap_proposals
          SET ${prefix}_confirmed_at = NOW(), updated_at = NOW()
        WHERE id = $1 AND status = 'shipping' AND ${prefix}_confirmed_at IS NULL
        RETURNING *`,
      [swapId],
    );
    if (r.rows.length === 0) return null;
    let row = r.rows[0] as SwapProposal;
    await logSwapTransition(tx, {
      swapId, action: "receipt_confirmed", actorId: userId, actorLabel: side,
    });
    if (row.proposer_confirmed_at && row.recipient_confirmed_at) {
      const c = await tx(
        `UPDATE swap_proposals SET status = 'completed', updated_at = NOW()
          WHERE id = $1 AND status = 'shipping' RETURNING *`,
        [swapId],
      );
      if (c.rows.length > 0) {
        row = c.rows[0] as SwapProposal;
        await logSwapTransition(tx, {
          swapId, action: "completed", actorLabel: "system",
          metadata: { derived_from: "both_receipts_confirmed" },
        });
      }
    }
    return row;
  });
  if (!updated) return { ok: false, reason: "Swap changed state — reload and retry.", status: 409 };

  const label = await userLabel(userId);
  await notify({
    userId: otherPartyId(swap, userId),
    kind: updated.status === "completed" ? "swap.completed" : "swap.receipt_confirmed",
    title:
      updated.status === "completed"
        ? "Swap complete — both sides confirmed receipt"
        : `${label} confirmed your cards arrived`,
    linkUrl: `/account/swaps/${swapId}`,
    referenceType: "swap_proposal",
    referenceId: `${swapId}:confirm:${side}`,
  });
  return { ok: true, value: updated };
}

// ── Expiry sweep ────────────────────────────────────────────────────────

async function expireOne(swap: SwapProposal): Promise<boolean> {
  const changed = await transaction(async (tx) => {
    const r = await tx(
      `UPDATE swap_proposals SET status = 'expired', updated_at = NOW()
        WHERE id = $1 AND status = 'proposed'
          AND expires_at IS NOT NULL AND expires_at < NOW()
        RETURNING id, expires_at`,
      [swap.id],
    );
    if (r.rows.length === 0) return false;
    await logSwapTransition(tx, {
      swapId: swap.id,
      action: "expired",
      actorLabel: "system",
      metadata: { expires_at: r.rows[0].expires_at },
    });
    return true;
  });
  if (changed) {
    await notify({
      userId: swap.proposer_id,
      kind: "swap.expired",
      title: "Your swap proposal expired without a response",
      body: "You can propose it again — the response window comes from the recipient's declared cadence unless you set your own.",
      linkUrl: `/account/swaps/${swap.id}`,
      referenceType: "swap_proposal",
      referenceId: `${swap.id}:expired`,
    });
  }
  return changed;
}

/**
 * Expire proposed swaps past their own expires_at. Each row carries its
 * deadline (stamped at propose-time from the recipient's 0092 cadence or
 * the proposer's explicit choice) — the sweep reads the column, never a
 * constant. Exported for the maintenance cron; NOT yet wired there (the
 * cron route belongs to another workstream — see build followups).
 */
export async function runSwapExpirySweep(): Promise<{ expired: number }> {
  const due = await query(
    `SELECT * FROM swap_proposals
      WHERE status = 'proposed' AND expires_at IS NOT NULL AND expires_at < NOW()
      ORDER BY expires_at ASC
      LIMIT 200`,
  );
  let expired = 0;
  for (const row of due.rows as SwapProposal[]) {
    try {
      if (await expireOne(row)) expired += 1;
    } catch (err) {
      console.error(`[swaps] expiry failed for ${row.id}:`, err);
    }
  }
  return { expired };
}
