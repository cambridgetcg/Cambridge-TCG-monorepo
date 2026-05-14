"use server";

/**
 * System / Admin users — server actions.
 *
 * Two mutations:
 *   grantAdmin(user_id, reason)   — set users.role='admin'
 *   revokeAdmin(user_id, reason)  — set users.role='user' (lockout-guarded)
 *
 * Lockout protection: revoke checks the calling admin's id and refuses
 * to demote self. Without this, a sole admin could lock everyone out
 * including themselves.
 *
 * Both write to admin_actions_log via adminAction() with before/after
 * snapshots so /admin/system/audit reflects the change.
 */

import { adminAction, ActionInputError } from "@/lib/admin/actions";
import { sfQuery } from "@/lib/admin/db";

export interface GrantInput {
  user_id: string;
  reason: string;
}

export async function grantAdmin(input: GrantInput) {
  return adminAction({
    action: "admin.grant",
    targetKind: "user",
    targetId: input.user_id,
    targetUserId: input.user_id,
    reason: input.reason,
    revalidate: "/admin/system/admin",
    run: async () => {
      if (!input.reason.trim()) {
        throw new ActionInputError("Reason is required to grant admin role.");
      }
      const before = await sfQuery<{ email: string | null; role: string }>(
        `SELECT email, role FROM users WHERE id = $1::uuid`,
        [input.user_id],
      );
      if (before.rows.length === 0) {
        throw new ActionInputError(`User ${input.user_id} not found.`);
      }
      if (before.rows[0]!.role === "admin") {
        throw new ActionInputError(`User is already an admin.`);
      }
      await sfQuery(
        `UPDATE users SET role = 'admin' WHERE id = $1::uuid`,
        [input.user_id],
      );
      return {
        user_id: input.user_id,
        email: before.rows[0]!.email,
        from: before.rows[0]!.role,
        to: "admin",
      };
    },
  });
}

export interface RevokeInput {
  user_id: string;
  reason: string;
}

export async function revokeAdmin(input: RevokeInput) {
  return adminAction({
    action: "admin.revoke",
    targetKind: "user",
    targetId: input.user_id,
    targetUserId: input.user_id,
    reason: input.reason,
    revalidate: "/admin/system/admin",
    run: async (admin) => {
      if (!input.reason.trim()) {
        throw new ActionInputError("Reason is required to revoke admin role.");
      }
      if (input.user_id === admin.id) {
        throw new ActionInputError(
          "You cannot revoke your own admin role (lockout protection). " +
          "Have another admin do it.",
        );
      }
      const before = await sfQuery<{ email: string | null; role: string }>(
        `SELECT email, role FROM users WHERE id = $1::uuid`,
        [input.user_id],
      );
      if (before.rows.length === 0) {
        throw new ActionInputError(`User ${input.user_id} not found.`);
      }
      if (before.rows[0]!.role !== "admin") {
        throw new ActionInputError(`User is not an admin.`);
      }
      // Last-admin guard: refuse to revoke the only admin on file.
      const adminCount = await sfQuery<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM users WHERE role = 'admin'`,
        [],
      );
      if (parseInt(adminCount.rows[0]?.count ?? "0", 10) <= 1) {
        throw new ActionInputError(
          "Cannot revoke the only admin — grant another admin first.",
        );
      }
      await sfQuery(
        `UPDATE users SET role = 'user' WHERE id = $1::uuid`,
        [input.user_id],
      );
      return {
        user_id: input.user_id,
        email: before.rows[0]!.email,
        from: "admin",
        to: "user",
      };
    },
  });
}
