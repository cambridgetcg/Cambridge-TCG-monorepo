/**
 * Server-action wrapper for admin mutations.
 *
 * Centralises the four things every mutation needs:
 *   1. Admin auth check — via requireAdmin() from @/lib/admin/auth
 *   2. Error formatting — structured ActionResult rather than thrown errors
 *   3. Governance audit log — admin_actions_log via logAdminAction()
 *      from @/lib/admin/audit
 *   4. revalidatePath() to refresh affected pages
 *
 * Usage — inside a "use server" file:
 *
 *   export async function forceResolveChargeback(input: { id: string; reason: string }) {
 *     return adminAction({
 *       action: "chargeback.force_resolve",
 *       targetKind: "chargeback",
 *       targetId: input.id,
 *       reason: input.reason,
 *       revalidate: "/admin/chargebacks",
 *       run: async (admin) => {
 *         if (!input.reason.trim()) throw new ActionInputError("Reason required");
 *         await sfQuery(`UPDATE ... WHERE id = $1`, [input.id]);
 *         return { resolved: true, by: admin.email };
 *       },
 *     });
 *   }
 *
 * The handler can throw — adminAction returns { ok: false, error } and
 * skips the governance log. Successful runs log fire-and-forget
 * (logAdminAction internally catches its own errors so audit failure
 * never fails the action).
 *
 * Storefront-merge note (2026-05-14): this wrapper composes sister-shipped
 * requireAdmin() (which returns AdminSession | null instead of throwing)
 * and logAdminAction() (which takes a typed AuditEntry with admin: AdminSession).
 * Ported from apps/admin/src/lib/actions.ts but rewired to sister's
 * convention — the abstract behaviour is unchanged, only the dependencies.
 */

import { revalidatePath } from "next/cache";
import { requireAdmin, type AdminSession } from "@/lib/admin/auth";
import { logAdminAction } from "@/lib/admin/audit";

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
  /** Fixed non-personal audit label when the surface must not retain email. */
  auditActorLabel?: string;
  /** Snapshot of relevant fields *before* the change, for audit replay. */
  before?: Record<string, unknown> | null;
  /** Snapshot of relevant fields *after* the change. */
  after?: Record<string, unknown> | null;
  /** Path(s) to revalidate after success. Pass the page that should re-fetch. */
  revalidate?: string | string[];
  /** Performs the work. Receives the admin session so it can use admin.id / admin.email. */
  run: (admin: AdminSession) => Promise<T>;
}

export async function adminAction<T>(spec: AdminActionSpec<T>): Promise<ActionResult<T>> {
  const admin = await requireAdmin();
  if (!admin) {
    return { ok: false, error: "Not authorized", code: "unauthorized" };
  }

  let data: T;
  try {
    data = await spec.run(admin);
  } catch (err) {
    const code = err instanceof ActionInputError ? "validation" : "internal";
    return { ok: false, error: errorMessage(err), code };
  }

  // Governance log — fire and forget. logAdminAction internally swallows errors.
  void logAdminAction({
    admin,
    actorLabelOverride: spec.auditActorLabel,
    action: spec.action,
    targetKind: spec.targetKind,
    targetId: spec.targetId ?? undefined,
    targetUserId: spec.targetUserId ?? undefined,
    reason: spec.reason ?? undefined,
    beforeValue: spec.before ?? undefined,
    afterValue: spec.after ?? undefined,
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

/** Throw inside `run` to surface a clean validation error to the caller.
 *  The returned ActionResult will have code: "validation". */
export class ActionInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ActionInputError";
  }
}
