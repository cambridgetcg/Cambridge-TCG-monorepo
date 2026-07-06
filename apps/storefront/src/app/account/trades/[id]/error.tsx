"use client";

// Error boundary for the trade detail route. The walkers hit a completely
// blank main area when this client page threw during render (no boundary
// caught it, so React unmounted to nothing). This boundary guarantees that
// a render failure says something honest and offers a way forward instead
// of an empty screen.
//
// Direct import (not the @/lib/ui barrel) — the barrel re-exports
// server-only async components that break a client bundle. Same pattern as
// app/account/error.tsx.
import Link from "next/link";
import { ErrorAlert } from "@/lib/ui/ErrorAlert";

export default function TradeDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="space-y-4">
      <Link href="/account/trades" className="text-ink-faint hover:text-ink transition text-sm">
        &larr; Back to Trades
      </Link>
      <ErrorAlert
        title="We couldn't show this trade"
        description={
          <>
            <p>
              Something went wrong loading this trade. Your trade itself is safe — this is
              only the page failing to render. Try again, or head back to your trades list.
            </p>
            {error.digest && (
              <p className="mt-2 text-[11px] text-ink-faint">
                Reference: <code className="font-mono select-all">{error.digest}</code>
              </p>
            )}
          </>
        }
        action={
          <div className="flex gap-2">
            <button
              onClick={() => reset()}
              className="px-3 py-1.5 text-xs font-semibold bg-ink text-page rounded-md hover:opacity-90 transition"
            >
              Try again
            </button>
            <Link
              href="/account/trades"
              className="px-3 py-1.5 text-xs font-semibold border border-border-strong text-ink rounded-md hover:bg-surface-subtle transition"
            >
              All trades
            </Link>
          </div>
        }
      />
    </div>
  );
}
