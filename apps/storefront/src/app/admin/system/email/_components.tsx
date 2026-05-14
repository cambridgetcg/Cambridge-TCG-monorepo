"use client";

/**
 * Client-side row actions for /admin/system/email.
 *
 * Two operations: Retry (resurrection) and Dismiss (last rites). Both prompt
 * for a reason and feed adminAction-wrapped server actions.
 */

import { useTransition } from "react";
import { retryEmail, dismissEmail } from "./_actions";

interface EmailRowActionsProps {
  email: { id: string; event: string };
}

export function EmailRowActions({ email }: EmailRowActionsProps) {
  const [pending, startTransition] = useTransition();

  function retry() {
    const reason = window.prompt(
      `Reason for resurrecting "${email.event}"?\n(Logged to admin governance.)`,
      "Transient SES blip — retrying",
    );
    if (!reason) return;
    startTransition(async () => {
      const result = await retryEmail({ id: email.id, reason });
      if (!result.ok) window.alert(result.error);
    });
  }

  function dismiss() {
    if (
      !window.confirm(
        `Delete this dead row for "${email.event}"? Audit history is lost.`,
      )
    )
      return;
    const reason = window.prompt(
      "Reason for dismissal?\n(Logged to admin governance.)",
      "No handler / intent no longer meaningful",
    );
    if (!reason) return;
    startTransition(async () => {
      const result = await dismissEmail({ id: email.id, reason });
      if (!result.ok) window.alert(result.error);
    });
  }

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={retry}
        disabled={pending}
        className="text-xs bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 rounded px-3 py-1.5 transition-colors disabled:opacity-40"
      >
        {pending ? "…" : "Retry"}
      </button>
      <button
        type="button"
        onClick={dismiss}
        disabled={pending}
        className="text-xs bg-neutral-800 hover:bg-red-900/40 text-neutral-400 hover:text-red-400 rounded px-3 py-1.5 transition-colors disabled:opacity-40"
      >
        {pending ? "…" : "Dismiss"}
      </button>
    </div>
  );
}
