"use client";

import { ErrorAlert } from "@/lib/ui";

export default function AccountError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorAlert
      title="Couldn't load this page"
      description={
        <>
          <p>Something went wrong loading your account data. Try again, or contact support if it persists.</p>
          {error.digest && (
            <p className="mt-2 text-[11px] text-neutral-500">
              Reference: <code className="font-mono select-all">{error.digest}</code>
            </p>
          )}
        </>
      }
      action={
        <button
          onClick={() => reset()}
          className="px-3 py-1.5 text-xs font-bold bg-amber-500 text-black rounded-md hover:bg-amber-400 transition"
        >
          Try again
        </button>
      }
    />
  );
}
