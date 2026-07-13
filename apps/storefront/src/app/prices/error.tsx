"use client";

/**
 * Route error boundary for the /prices subtree.
 *
 * The structural catalog guide reads live coverage data; a single bad row or a flaky upstream
 * should never hard-500 the whole page. This catches any render error in
 * /prices/* and degrades to a clear, plain-language fallback with a retry —
 * substrate honesty (we say it failed, in plain words) + the fifth question
 * (the page stays usable). Added 2026-06-06 after set pages 500'd in prod
 * on a null card_number; the boundary is the belt to that fix's braces.
 */
export default function PricesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="max-w-2xl mx-auto px-4 py-20 text-center">
      <h1 className="text-2xl font-bold text-ink mb-3">
        This catalog page didn&rsquo;t load
      </h1>
      <p className="text-ink-muted mb-6">
        Something went wrong fetching the structural catalog rows for this
        page. It&rsquo;s on our side, not yours — try again, or browse all games.
      </p>
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={reset}
          className="rounded-lg bg-ink px-5 py-2.5 text-sm font-semibold text-page hover:opacity-90 transition"
        >
          Try again
        </button>
        <a
          href="/prices"
          className="rounded-lg border border-border-subtle px-5 py-2.5 text-sm text-ink-muted hover:text-ink transition"
        >
          All games →
        </a>
      </div>
      {error?.digest && (
        <p className="mt-6 text-xs text-ink-faint">Reference: {error.digest}</p>
      )}
    </main>
  );
}
