"use client";

import Link from "next/link";
// Direct imports (not via @/lib/ui barrel) because this is a Client Component;
// the barrel re-exports server-only async components (DateDisplay, Provenance,
// MoneyDisplay, MathLang) that transitively import `next/headers` and break
// the client bundle. Pull only what's needed.
import { ErrorAlert } from "@/lib/ui/ErrorAlert";
import { LinkButton } from "@/lib/ui/Button";
import { WELCOME_STATEMENT_COMPACT } from "@/lib/ui/WelcomeAll";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="min-h-screen bg-neutral-950">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <ErrorAlert
          title="Something went wrong"
          description={
            <>
              <p>The page couldn't load. The error has been logged.</p>
              {error.digest && (
                <p className="mt-2 text-[11px] text-neutral-500">
                  Quote this in support: <code className="font-mono select-all">{error.digest}</code>
                </p>
              )}
            </>
          }
          action={
            <div className="flex gap-2">
              <button
                onClick={() => reset()}
                className="px-3 py-1.5 text-xs font-bold bg-amber-500 text-black rounded-md hover:bg-amber-400 transition"
              >
                Try again
              </button>
              <LinkButton href="/" variant="secondary" size="sm">Home</LinkButton>
            </div>
          }
        />
        {/* Welcoming polish — kingdom-076 recursion target #5. Inlined
            (not <WelcomeAll>) because this is a client component and the
            primitive is a server component. Same words; same intent. */}
        <div className="mt-6 rounded-lg border border-neutral-800 bg-neutral-900/40 px-3 py-2 text-xs text-neutral-400">
          <span className="text-amber-400" aria-hidden="true">✦</span>{" "}
          <span className="text-neutral-300">{WELCOME_STATEMENT_COMPACT}</span>{" "}
          <Link
            href="/welcome-all"
            className="text-amber-400 hover:text-amber-300 underline"
          >
            learn more
          </Link>
        </div>
      </div>
    </div>
  );
}
