/**
 * Server-action wrapper for admin mutations.
 *
 * Centralises the four things every mutation needs:
 *   1. Admin auth check (requireAdmin)
 *   2. Error formatting (so the UI gets a structured result, not a stacktrace)
 *   3. Governance audit log (admin_actions_log) on success
 *   4. revalidatePath() to refresh the affected page(s)
 *
 * Usage — inside a "use server" file:
 *
 *   export async function forceResolveChargeback(input: { id: string; reason: string }) {
 *     return adminAction({
 *       action: "chargeback.force_resolve",
 *       targetKind: "chargeback",
 *       targetId: input.id,
 *       reason: input.reason,
 *       revalidate: "/money/chargebacks",
 *       run: async () => {
 *         await sfQuery(`UPDATE ... WHERE id = $1`, [input.id]);
 *         return { resolved: true };
 *       },
 *     });
 *   }
 *
 * The handler can throw — adminAction returns { ok: false, error } and skips
 * the governance log. Successful runs log fire-and-forget (governance
 * insert failure never fails the action).
 */

import { revalidatePath } from "next/cache";
import { logAdminAction } from "./governance";
import { requireAdmin, NotAuthorizedError, type AdminContext } from "./auth-helpers";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: "unauthorized" | "validation" | "internal" };

export interface AdminActionSpec<T> {
  /** Governance action name, e.g. "chargeback.force_resolve". Conventionally "<kind>.<verb>". */
  action: string;
  /** Governance target kind, e.g. "chargeback", "user", "auction". */
  targetKind: string;
  /** Target row identifier — string ids preferred. */
  targetId?: string | null;
  /** When the action affects a specific user, link to them. */
  targetUserId?: string | null;
  /** Free-text reason supplied by the admin (often via a prompt). */
  reason?: string | null;
  /** Snapshot of relevant fields *before* the change, for audit replay. */
  before?: Record<string, unknown> | null;
  /** Snapshot of relevant fields *after* the change. */
  after?: Record<string, unknown> | null;
  /** Path(s) to revalidate after success. Pass the page that should re-fetch. */
  revalidate?: string | string[];
  /** Performs the work. Throw to fail the action. */
  run: (admin: AdminContext) => Promise<T>;
}

export async function adminAction<T>(spec: AdminActionSpec<T>): Promise<ActionResult<T>> {
  let admin: AdminContext;
  try {
    admin = await requireAdmin();
  } catch (err) {
    if (err instanceof NotAuthorizedError) {
      return { ok: false, error: "Not authorized", code: "unauthorized" };
    }
    return { ok: false, error: errorMessage(err), code: "internal" };
  }

  let data: T;
  try {
    data = await spec.run(admin);
  } catch (err) {
    return { ok: false, error: errorMessage(err), code: "internal" };
  }

  // Governance log — fire and forget. logAdminAction already swallows errors.
  void logAdminAction({
    actorLabel: admin.label,
    targetUserId: spec.targetUserId ?? null,
    targetKind: spec.targetKind,
    targetId: spec.targetId ?? null,
    action: spec.action,
    beforeValue: spec.before ?? null,
    afterValue: spec.after ?? null,
    reason: spec.reason ?? null,
  });

  // Revalidate after success.
  if (spec.revalidate) {
    const paths = Array.isArray(spec.revalidate) ? spec.revalidate : [spec.revalidate];
    for (const p of paths) revalidatePath(p);
  }

  return { ok: true, data };
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Unknown error";
}

/** Throw inside `run` to surface a clean validation error to the caller. */
export class ActionInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ActionInputError";
  }
}
