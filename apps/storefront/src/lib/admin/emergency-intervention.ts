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
//   • loudly audited: every freeze AND every lift commits with a governance-
//     log row (action 'emergency.freeze' / 'emergency.lift') carrying the
//     authenticated actor, before/after state, and reason. If that row cannot
//     be written, the state mutation rolls back and the caller sees failure.
//   • reversible: a freeze is a hold, not a verdict. liftEmergencyFreeze()
//     undoes it, equally logged.
//
// A freeze flips trust_profiles.is_suspended, which the existing read-side
// gates already honour (hidden listings, blocked new trades). It pauses; it
// does not delete or seize funds. A frozen account keeps its cards and
// history; current payout sweeps pause pending disbursement until the hold is
// lifted, which must be considered before using the break-glass.

import { transaction } from "@/lib/db";
import { writeAdminAction } from "@/lib/admin/governance-log";

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
  try {
    return await transaction(async (q) => {
      // This row is also the suspension lock used by market matching. A
      // concurrent order can finish before this lock, or observe the freeze
      // after it, but cannot cross the state transition unnoticed.
      const before = await q(
        `SELECT is_suspended FROM trust_profiles WHERE user_id = $1 FOR UPDATE`,
        [targetUserId],
      );
      if (before.rows.length === 0) {
        return {
          ok: false,
          changed: false,
          message:
            "No trust profile exists for that account — nothing to freeze (it has no market activity to pause).",
        };
      }
      const wasFrozen = before.rows[0].is_suspended === true;

      // suspended_until = NULL: an emergency hold does not auto-expire; it
      // stays until a human deliberately lifts it.
      await q(
        `UPDATE trust_profiles
            SET is_suspended = true,
                suspended_reason = $2,
                suspended_until = NULL
          WHERE user_id = $1`,
        [targetUserId, `${EMERGENCY_MARK} ${cleanReason}`],
      );

      await writeAdminAction(
        {
          actorId: actor.id,
          actorLabel: actor.email,
          targetUserId,
          targetKind: "user",
          targetId: targetUserId,
          action: "emergency.freeze",
          beforeValue: { is_suspended: wasFrozen },
          afterValue: { is_suspended: true },
          reason: cleanReason,
          metadata: { break_glass: true },
        },
        q,
      );

      return {
        ok: true,
        changed: !wasFrozen,
        message: wasFrozen
          ? "Account was already frozen — the reason was updated and the action logged."
          : "Account frozen. Public market orders are hidden and new trades are blocked; the action is logged for review.",
      };
    });
  } catch (err) {
    console.error("[emergency] freeze transaction failed:", err);
    return {
      ok: false,
      changed: false,
      message:
        "Freeze was not applied because the account change and its governance record could not be committed together.",
    };
  }
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
  try {
    return await transaction(async (q) => {
      const before = await q(
        `SELECT is_suspended FROM trust_profiles WHERE user_id = $1 FOR UPDATE`,
        [targetUserId],
      );
      if (before.rows.length === 0) {
        return {
          ok: false,
          changed: false,
          message: "No trust profile exists for that account.",
        };
      }
      const wasFrozen = before.rows[0].is_suspended === true;

      if (wasFrozen) {
        await q(
          `UPDATE trust_profiles
              SET is_suspended = false,
                  suspended_reason = NULL,
                  suspended_until = NULL
            WHERE user_id = $1`,
          [targetUserId],
        );
      }

      await writeAdminAction(
        {
          actorId: actor.id,
          actorLabel: actor.email,
          targetUserId,
          targetKind: "user",
          targetId: targetUserId,
          action: "emergency.lift",
          beforeValue: { is_suspended: wasFrozen },
          afterValue: { is_suspended: false },
          reason: cleanReason,
          metadata: { break_glass: true, no_op: !wasFrozen },
        },
        q,
      );

      return {
        ok: true,
        changed: wasFrozen,
        message: wasFrozen
          ? "Freeze lifted and logged. The account is fully active again."
          : "That account was not frozen — the reviewed no-op was logged.",
      };
    });
  } catch (err) {
    console.error("[emergency] lift transaction failed:", err);
    return {
      ok: false,
      changed: false,
      message:
        "Freeze was not lifted because the account change and its governance record could not be committed together.",
    };
  }
}
