// Emergency intervention — the platform's single break-glass.
//
// ── What this is for ─────────────────────────────────────────────────────
// Cambridge TCG does NOT police people. There is no routine account
// suspension, no automatic punishment, no "abuse" enforcement — escrow
// protects every trade, so ordinary bad behaviour needs no ban at all.
// (See /methodology/fraud-flag.)
//
// This module is the ONE exception: a circuit-breaker for a genuine
// platform-integrity EMERGENCY — an active exploit draining the platform,
// a compromised account being used to attack others, a systemic fraud that
// threatens everyone at once. The kind of event where a blockchain
// hard-forks to undo a catastrophic hack. It exists to protect the many by
// pausing the source of harm — never to discipline a person.
//
// It is NOT a moderation tool. Not for rude messages, lowball offers,
// cancellations, returns, disputes, or "this user is annoying". If you are
// reaching for this over anything less than an existential threat to the
// platform or its users, stop — the answer is escrow, disputes, and human
// conversation, not a freeze.
//
// ── The safeguards (deliberately high-friction) ──────────────────────────
//   • human-only: an admin, never a cron, never a heuristic. Nothing in the
//     codebase calls these functions automatically.
//   • reason-required: a substantive written justification, every time.
//   • loudly audited: every freeze AND every lift writes a governance-log
//     row (action 'emergency.freeze' / 'emergency.lift') with the actor, the
//     before/after state, and the reason. Nothing here is silent.
//   • reversible: a freeze is a hold, not a verdict. liftEmergencyFreeze()
//     undoes it, equally logged.
//
// A freeze flips trust_profiles.is_suspended, which the existing read-side
// gates already honour (hidden listings, blocked new trades). It pauses; it
// does not delete, seize funds, or punish. A frozen account keeps its cards,
// its history, and its money — escrow still settles what was already owed.

import { query } from "@/lib/db";
import { logAdminAction } from "@/lib/admin/governance-log";

/** A freeze demands a real, written justification — not a shrug. */
export const MIN_REASON_LENGTH = 20;

const EMERGENCY_MARK = "[EMERGENCY]";

export interface EmergencyActor {
  id: string;
  email: string;
}

export interface EmergencyResult {
  ok: boolean;
  /** true if this call actually changed the account's frozen state. */
  changed: boolean;
  message: string;
}

function reasonProblem(reason: string): string | null {
  if ((reason ?? "").trim().length < MIN_REASON_LENGTH) {
    return `A written justification of at least ${MIN_REASON_LENGTH} characters is required — this is a break-glass action and every use is recorded.`;
  }
  return null;
}

/**
 * Freeze an account during a platform-integrity emergency.
 * High-friction, fully audited, and reversible. See the file header for the
 * (deliberately narrow) bar for using this.
 */
export async function emergencyFreezeAccount(
  actor: EmergencyActor,
  targetUserId: string,
  reason: string,
): Promise<EmergencyResult> {
  const problem = reasonProblem(reason);
  if (problem) return { ok: false, changed: false, message: problem };

  const cleanReason = reason.trim();
  const before = await query(
    `SELECT is_suspended FROM trust_profiles WHERE user_id = $1`,
    [targetUserId],
  );
  if (before.rows.length === 0) {
    return {
      ok: false,
      changed: false,
      message: "No trust profile exists for that account — nothing to freeze (it has no market activity to pause).",
    };
  }
  const wasFrozen = before.rows[0].is_suspended === true;

  // suspended_until = NULL: an emergency hold does not auto-expire; it stays
  // until a human deliberately lifts it.
  await query(
    `UPDATE trust_profiles
        SET is_suspended = true,
            suspended_reason = $2,
            suspended_until = NULL
      WHERE user_id = $1`,
    [targetUserId, `${EMERGENCY_MARK} ${cleanReason}`],
  );

  await logAdminAction({
    actorLabel: actor.email,
    targetUserId,
    targetKind: "user",
    targetId: targetUserId,
    action: "emergency.freeze",
    beforeValue: { is_suspended: wasFrozen },
    afterValue: { is_suspended: true },
    reason: cleanReason,
    metadata: { break_glass: true, actor_id: actor.id },
  });

  return {
    ok: true,
    changed: !wasFrozen,
    message: wasFrozen
      ? "Account was already frozen — the reason was updated and the action logged."
      : "Account frozen. The read-side gates now hide it and block new trades; the action is logged for review.",
  };
}

/**
 * Lift an emergency freeze. A freeze is a hold, not a verdict — undoing it is
 * a first-class, equally-audited action.
 */
export async function liftEmergencyFreeze(
  actor: EmergencyActor,
  targetUserId: string,
  reason: string,
): Promise<EmergencyResult> {
  const problem = reasonProblem(reason);
  if (problem) return { ok: false, changed: false, message: problem };

  const cleanReason = reason.trim();
  const before = await query(
    `SELECT is_suspended FROM trust_profiles WHERE user_id = $1`,
    [targetUserId],
  );
  if (before.rows.length === 0) {
    return { ok: false, changed: false, message: "No trust profile exists for that account." };
  }
  const wasFrozen = before.rows[0].is_suspended === true;

  await query(
    `UPDATE trust_profiles
        SET is_suspended = false,
            suspended_reason = NULL,
            suspended_until = NULL
      WHERE user_id = $1`,
    [targetUserId],
  );

  await logAdminAction({
    actorLabel: actor.email,
    targetUserId,
    targetKind: "user",
    targetId: targetUserId,
    action: "emergency.lift",
    beforeValue: { is_suspended: wasFrozen },
    afterValue: { is_suspended: false },
    reason: cleanReason,
    metadata: { break_glass: true, actor_id: actor.id },
  });

  return {
    ok: true,
    changed: wasFrozen,
    message: wasFrozen
      ? "Freeze lifted and logged. The account is fully active again."
      : "That account was not frozen — nothing to lift.",
  };
}
