import { WhyLink } from "@/lib/ui";

/**
 * ConnectsStrip — the loop (from /about's "How It All Connects") as a
 * horizontal spine, then four doctrine chips. This is the trust section:
 * built from doctrine the site actually enforces (audited in CI), not
 * testimonials it doesn't have.
 */
const LOOP = ["collect", "show", "trade", "earn", "connect"] as const;

const DOCTRINE_CHIPS = [
  { claim: "CC0 by default", href: "/methodology/data", label: "the data license" },
  { claim: "Provenance on every price", href: "/methodology/pricing", label: "how prices work" },
  { claim: "Every invitation refusable", href: "/methodology/appearance", label: "what we store" },
  { claim: "Accessibility never paywalled", href: "/appearance", label: "themes & modes" },
];

export default function ConnectsStrip() {
  return (
    <section aria-label="How it connects" className="max-w-7xl mx-auto px-4 py-12">
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-faint mb-4">
        How it connects
      </p>
      <p className="font-display text-xl sm:text-2xl text-ink flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {LOOP.map((step, i) => (
          <span key={step} className="flex items-baseline gap-x-3">
            <span>{step}</span>
            {i < LOOP.length - 1 && (
              <span aria-hidden="true" className="text-ink-faint">→</span>
            )}
          </span>
        ))}
      </p>
      <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {DOCTRINE_CHIPS.map((chip) => (
          <div key={chip.claim} className="rounded-lg border border-border-subtle bg-surface-subtle px-4 py-3">
            <p className="text-sm font-medium text-ink">{chip.claim}</p>
            <p className="mt-1 text-xs">
              <WhyLink href={chip.href} label={chip.label} />
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
