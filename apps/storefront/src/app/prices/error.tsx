"use client";

/**
 * Route error boundary for the /prices subtree.
 *
 * The price guide reads live data; a single bad row or a flaky upstream
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
      <h1 className="text-2xl font-bold text-white mb-3">
        This price page didn&rsquo;t load
      </h1>
      <p className="text-neutral-400 mb-6">
        Something went wrong fetching the prices for this page. It&rsquo;s on
        our side, not yours — try again, or browse the full price guide.
      </p>
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={reset}
          className="rounded-lg bg-amber-500 px-5 py-2.5 text-sm font-semibold text-black hover:bg-amber-400 transition"
        >
          Try again
        </button>
        <a
          href="/prices"
          className="rounded-lg border border-neutral-700 px-5 py-2.5 text-sm text-neutral-300 hover:text-white transition"
        >
          All games →
        </a>
      </div>
      {error?.digest && (
        <p className="mt-6 text-xs text-neutral-600">Reference: {error.digest}</p>
      )}
    </main>
  );
}
