"use client";

import dynamic from "next/dynamic";

const BrowserOnlyKarmaDojo = dynamic(() => import("./KarmaDojo"), {
  ssr: false,
  loading: () => (
    <section
      aria-labelledby="karma-dojo-loading-heading"
      className="not-prose my-10 rounded-lg border border-border-subtle bg-surface p-5 shadow-mat sm:p-6"
    >
      <p className="font-mono text-xs uppercase tracking-[0.18em] text-ink-faint">
        Synthetic local replay
      </p>
      <h2
        id="karma-dojo-loading-heading"
        className="mt-2 font-display text-2xl font-semibold text-ink"
      >
        KARMA Dojo
      </h2>
      <p className="mt-2 text-sm leading-6 text-ink-muted">
        The fixed playground wakes after browser hydration. No policy replay runs during
        server rendering.
      </p>
    </section>
  ),
});

/** Keep the evaluator out of Next.js server prerendering, not merely in a client bundle. */
export default function KarmaDojoIsland() {
  return <BrowserOnlyKarmaDojo />;
}
