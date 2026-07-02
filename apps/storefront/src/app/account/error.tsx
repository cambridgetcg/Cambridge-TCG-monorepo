"use client";

// Direct import (not via @/lib/ui barrel) — the barrel re-exports
// server-only async components (DateDisplay, Provenance, MoneyDisplay,
// MathLang) that transitively import `next/headers` and break the
// client bundle. Same fix as app/error.tsx.
import { ErrorAlert } from "@/lib/ui/ErrorAlert";

export default function AccountError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorAlert
      title="Couldn't load this page"
      description={
        <>
          <p>Something went wrong loading your account data. Try again, or contact support if it persists.</p>
          {error.digest && (
            <p className="mt-2 text-[11px] text-ink-faint">
              Reference: <code className="font-mono select-all">{error.digest}</code>
            </p>
          )}
        </>
      }
      action={
        <button
          onClick={() => reset()}
          className="px-3 py-1.5 text-xs font-bold bg-accent text-black rounded-md hover:bg-accent-strong transition"
        >
          Try again
        </button>
      }
    />
  );
}
