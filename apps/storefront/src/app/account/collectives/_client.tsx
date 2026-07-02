"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import {
  acceptInviteAction,
  leaveCollectiveAction,
  removeMemberAction,
} from "./_actions";

export function AcceptDeclineButtons({ slug }: { slug: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  return (
    <div>
      <div className="flex gap-2">
        <button
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await acceptInviteAction(slug);
              if (!r.ok) setError(r.error ?? "Failed.");
              else router.refresh();
            })
          }
          className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-500 text-black hover:bg-emerald-400 disabled:opacity-50"
        >
          {pending ? "…" : "Accept"}
        </button>
        <button
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await leaveCollectiveAction(slug);
              if (!r.ok) setError(r.error ?? "Failed.");
              else router.refresh();
            })
          }
          className="px-3 py-1.5 rounded-lg text-xs bg-surface-elevated text-ink-muted hover:bg-neutral-700 disabled:opacity-50"
        >
          Decline
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}

export function RemoveMemberButton({
  slug,
  userId,
  displayName,
}: {
  slug: string;
  userId: string;
  displayName: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  return (
    <>
      <button
        disabled={pending}
        onClick={() => {
          if (!window.confirm(`Remove ${displayName} from this collective?`)) return;
          start(async () => {
            setError(null);
            const r = await removeMemberAction(slug, userId);
            if (!r.ok) setError(r.error ?? "Failed.");
            else router.refresh();
          });
        }}
        className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
      >
        {pending ? "…" : "Remove"}
      </button>
      {error && <span className="ml-2 text-xs text-red-400">{error}</span>}
    </>
  );
}
