// External-reputation verification flow.
//
// Two-phase from the user's perspective:
//   1. issueCode  — user submits (platform, profileUrl, username); we
//      generate verification_code, persist a row, return the code for
//      them to paste on their public profile.
//   2. verifyCode — user clicks "I've added it"; we fetch the URL,
//      scan for the code, persist verified=true + decay_at, recompute
//      trust, audit.
//
// Re-verification follow the same shape on the cron path (Phase D);
// runVerificationCheck below is the shared core.

import { query } from "@/lib/db";
import { generateVerificationCode, safeFetchText, DECAY_DAYS, FAILED_CHECK_LIMIT } from "./index";
import { logExternalRepTransition } from "./lifecycle-log";
import { assertValidProfileUrl, assertAttemptAllowed, ExternalRepGateError } from "./gates";

export interface IssueCodeArgs {
  userId: string;
  platform: string;
  profileUrl: string;
  username: string;
}

export interface IssuedCode {
  repId: string;
  verificationCode: string;
  platformLabel: string;
  profileUrl: string;
}

/**
 * Phase 1: issue a code for the user to paste. Idempotent per
 * (user_id, platform, username) — re-issuing for an already-pending
 * row returns the existing code rather than creating a duplicate.
 */
export async function issueVerificationCode(args: IssueCodeArgs): Promise<IssuedCode> {
  const def = assertValidProfileUrl({ platform: args.platform, profileUrl: args.profileUrl });
  await assertAttemptAllowed({ userId: args.userId, platform: args.platform });

  // Look for an existing unverified row for this (user, platform, username)
  const existing = await query(
    `SELECT id, verification_code FROM external_reputation
      WHERE user_id = $1 AND platform = $2 AND username = $3 AND verified = false
      ORDER BY created_at DESC LIMIT 1`,
    [args.userId, args.platform, args.username],
  );
  if (existing.rows.length > 0 && existing.rows[0].verification_code) {
    return {
      repId: existing.rows[0].id,
      verificationCode: existing.rows[0].verification_code,
      platformLabel: def.label,
      profileUrl: args.profileUrl,
    };
  }

  const code = generateVerificationCode();
  const insertRes = await query(
    `INSERT INTO external_reputation
       (user_id, platform, username, profile_url, verification_method,
        verification_code, verification_attempted_at)
     VALUES ($1, $2, $3, $4, 'paste_code', $5, NOW())
     RETURNING id`,
    [args.userId, args.platform, args.username, args.profileUrl, code],
  );
  const repId: string = insertRes.rows[0].id;

  void logExternalRepTransition({
    repId,
    action: "code_issued",
    actorId: args.userId,
    reason: `Issued for ${def.label} profile ${args.username}`,
  });

  return { repId, verificationCode: code, platformLabel: def.label, profileUrl: args.profileUrl };
}

export interface VerifyResult {
  ok: boolean;
  message: string;
  decayAt?: string;
}

/**
 * Phase 2: fetch the profile URL, scan for the code. On success,
 * mark verified + set decay_at + recompute trust + audit. On failure,
 * stamp failed_check_count and surface a guidance message.
 *
 * Shared by the customer-initiated verify endpoint AND the daily
 * decay re-check cron (with isReverify=true so we don't re-bump
 * verification_attempted_at against the rate limit).
 */
export async function runVerificationCheck(repId: string, opts: { isReverify?: boolean; actorLabel?: string } = {}): Promise<VerifyResult> {
  const repRes = await query(
    `SELECT id, user_id, platform, profile_url, verification_code, failed_check_count
       FROM external_reputation WHERE id = $1`,
    [repId],
  );
  if (repRes.rows.length === 0) {
    return { ok: false, message: "Verification record not found." };
  }
  const rep = repRes.rows[0];
  if (!rep.verification_code) {
    return { ok: false, message: "No verification code on this entry." };
  }

  if (!opts.isReverify) {
    void logExternalRepTransition({ repId, action: "verify_attempted" });
    await query(
      `UPDATE external_reputation SET verification_attempted_at = NOW() WHERE id = $1`,
      [repId],
    );
  }

  let body: string;
  try {
    body = await safeFetchText(rep.profile_url);
  } catch (err) {
    const reason = err instanceof Error ? err.message : "fetch failed";
    return await recordFailure(repId, rep, reason, opts);
  }

  if (!body.toLowerCase().includes(rep.verification_code.toLowerCase())) {
    return await recordFailure(
      repId,
      rep,
      `Code not found on profile page. Make sure ${rep.verification_code} is visible.`,
      opts,
    );
  }

  // Success path — persist verified, decay clock, audit, recompute.
  const decayAt = new Date(Date.now() + DECAY_DAYS * 86_400_000);
  await query(
    `UPDATE external_reputation
        SET verified = true,
            verified_at = COALESCE(verified_at, NOW()),
            verified_by = NULL,
            verification_method = 'paste_code',
            last_check_at = NOW(),
            decay_at = $2,
            failed_check_count = 0
      WHERE id = $1`,
    [repId, decayAt],
  );

  void logExternalRepTransition({
    repId,
    action: "verify_succeeded",
    actorLabel: opts.actorLabel ?? null,
    reason: opts.isReverify ? "Re-verification cron pass" : "Customer verified via paste-code",
    metadata: { decay_at: decayAt.toISOString() },
  });

  // Recompute trust so the verified rep contribution flows into the
  // 10-pt external-rep bucket immediately. Without this, the score
  // stays stale until daily recompute or another trigger.
  try {
    const { calculateTrustScore } = await import("@/lib/escrow/trust-engine");
    void calculateTrustScore(rep.user_id).catch((err) =>
      console.error("[external-rep/verify] trust recompute failed:", err),
    );
  } catch { /* import failure ignored */ }

  return {
    ok: true,
    message: `Verified! ${rep.platform} reputation is now contributing to your trust score.`,
    decayAt: decayAt.toISOString(),
  };
}

async function recordFailure(
  repId: string,
  rep: { failed_check_count: number; verified?: boolean },
  reason: string,
  opts: { isReverify?: boolean },
): Promise<VerifyResult> {
  const newCount = (rep.failed_check_count ?? 0) + 1;

  // Re-verification (cron path): bump count, downgrade verified flag
  // when we cross the threshold.
  const shouldDowngrade = opts.isReverify && newCount >= FAILED_CHECK_LIMIT;
  await query(
    `UPDATE external_reputation
        SET failed_check_count = $2,
            last_check_at      = NOW(),
            verified           = CASE WHEN $3::boolean THEN false ELSE verified END,
            decay_at           = CASE WHEN $3::boolean THEN NULL ELSE decay_at END
      WHERE id = $1`,
    [repId, newCount, shouldDowngrade],
  );

  void logExternalRepTransition({
    repId,
    action: opts.isReverify ? "decay_failed" : "verify_failed",
    reason,
    metadata: { failed_check_count: newCount, downgraded: shouldDowngrade },
  });

  if (shouldDowngrade) {
    // Recompute trust to drop the now-unverified contribution.
    try {
      const repRow = await query(`SELECT user_id FROM external_reputation WHERE id = $1`, [repId]);
      const uid = repRow.rows[0]?.user_id;
      if (uid) {
        const { calculateTrustScore } = await import("@/lib/escrow/trust-engine");
        void calculateTrustScore(uid).catch(() => { /* ignore */ });
      }
    } catch { /* ignore */ }
  }

  return {
    ok: false,
    message: shouldDowngrade
      ? `Verification lost after ${newCount} failed re-checks. Re-issue a new code to restore.`
      : reason,
  };
}

export { ExternalRepGateError };
