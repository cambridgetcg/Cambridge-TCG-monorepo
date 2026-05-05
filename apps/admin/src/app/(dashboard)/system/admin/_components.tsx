"use client";

/**
 * Client-side action triggers for /system/admin.
 *
 * AdminRowActions: revoke button on the current-admins table. Disabled
 * when the row is the viewing admin (lockout protection enforced again
 * server-side; the client disable is just UX).
 *
 * GrantAdminForm: button next to a candidate row on the search results.
 * Prompts for a reason and calls grantAdmin.
 */

import { useTransition } from "react";
import { grantAdmin, revokeAdmin } from "./_actions";

interface AdminRowActionsProps {
  target: {
    user_id: string;
    email: string | null;
    is_self: boolean;
  };
}

export function AdminRowActions({ target }: AdminRowActionsProps) {
  const [pending, startTransition] = useTransition();

  if (target.is_self) {
    return <span className="text-xs text-neutral-600 italic">you</span>;
  }

  function revoke() {
    const reason = window.prompt(
      `Reason for revoking admin from ${target.email ?? target.user_id}?`,
    );
    if (!reason) return;
    startTransition(async () => {
      const result = await revokeAdmin({ user_id: target.user_id, reason });
      if (!result.ok) window.alert(result.error);
    });
  }

  return (
    <button
      type="button"
      onClick={revoke}
      disabled={pending}
      className="text-xs px-2 py-1 border border-red-500/40 rounded text-red-400 hover:bg-red-500/10 disabled:opacity-50"
    >
      {pending ? "…" : "Revoke"}
    </button>
  );
}

interface GrantAdminFormProps {
  target: {
    user_id: string;
    email: string | null;
  };
}

export function GrantAdminForm({ target }: GrantAdminFormProps) {
  const [pending, startTransition] = useTransition();

  function grant() {
    const reason = window.prompt(
      `Reason for granting admin to ${target.email ?? target.user_id}?`,
    );
    if (!reason) return;
    startTransition(async () => {
      const result = await grantAdmin({ user_id: target.user_id, reason });
      if (!result.ok) window.alert(result.error);
    });
  }

  return (
    <button
      type="button"
      onClick={grant}
      disabled={pending}
      className="text-xs px-3 py-1.5 bg-amber-500 text-black font-bold rounded hover:bg-amber-400 disabled:opacity-50 whitespace-nowrap"
    >
      {pending ? "…" : "Grant admin"}
    </button>
  );
}
