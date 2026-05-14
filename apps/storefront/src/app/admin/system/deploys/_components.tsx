"use client";

import { useTransition, useState } from "react";
import { redeployFromMain } from "./_actions";
import type { VercelProject } from "@/lib/admin/vercel";

export function RedeployButton({ projectKey }: { projectKey: VercelProject["key"] }) {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<string | null>(null);

  function trigger() {
    if (
      !window.confirm(
        `Trigger a production redeploy of ${projectKey} from current main HEAD?\n\n` +
        "This will start a new Vercel deploy. The action is logged to the governance audit.",
      )
    ) {
      return;
    }
    setStatus(null);
    startTransition(async () => {
      const result = await redeployFromMain({ projectKey });
      if (!result.ok) {
        setStatus(`Failed: ${result.error}`);
        return;
      }
      setStatus(`Triggered → ${result.data.sha.slice(0, 8)}`);
    });
  }

  return (
    <div className="flex items-center gap-2 shrink-0">
      <button
        type="button"
        onClick={trigger}
        disabled={pending}
        className="px-3 py-1.5 text-xs bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-white rounded transition disabled:opacity-50"
      >
        {pending ? "Triggering…" : "Redeploy from main"}
      </button>
      {status && (
        <span className="text-xs text-neutral-400 max-w-[140px] truncate" title={status}>
          {status}
        </span>
      )}
    </div>
  );
}
