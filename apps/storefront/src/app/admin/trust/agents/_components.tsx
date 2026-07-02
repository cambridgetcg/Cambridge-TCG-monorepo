"use client";

import { useTransition } from "react";
import {
  suspendAgent,
  unsuspendAgent,
  adminArchiveAgent,
} from "./_actions";

export function AgentRowActions({
  id,
  status,
  handle,
}: {
  id: string;
  status: "active" | "suspended" | "archived";
  handle: string;
}) {
  const [pending, start] = useTransition();

  function ask(prompt: string) {
    return window.prompt(prompt);
  }

  function onSuspend() {
    const reason = ask(`Suspend agent:${handle}? Reason:`);
    if (!reason) return;
    start(async () => {
      const r = await suspendAgent({ id, reason });
      if (!r.ok) alert(r.error);
    });
  }
  function onUnsuspend() {
    const reason = ask("Lift suspension. Reason:");
    if (!reason) return;
    start(async () => {
      const r = await unsuspendAgent({ id, reason });
      if (!r.ok) alert(r.error);
    });
  }
  function onArchive() {
    const reason = ask(
      `Archive agent:${handle}? This revokes all keys permanently. Reason:`,
    );
    if (!reason) return;
    start(async () => {
      const r = await adminArchiveAgent({ id, reason });
      if (!r.ok) alert(r.error);
    });
  }

  if (status === "archived") {
    return <span className="text-[10px] text-neutral-600">archived</span>;
  }

  return (
    <div className="flex justify-end gap-2 text-xs">
      {status === "active" && (
        <button
          onClick={onSuspend}
          disabled={pending}
          className="text-accent-strong hover:text-accent-strong disabled:opacity-50"
        >
          suspend
        </button>
      )}
      {status === "suspended" && (
        <button
          onClick={onUnsuspend}
          disabled={pending}
          className="text-secondary hover:text-emerald-300 disabled:opacity-50"
        >
          unsuspend
        </button>
      )}
      <button
        onClick={onArchive}
        disabled={pending}
        className="text-ink-faint hover:text-red-400 disabled:opacity-50"
      >
        archive
      </button>
    </div>
  );
}
