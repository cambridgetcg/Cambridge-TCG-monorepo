import Link from "next/link";
import { WhyLink } from "@/lib/ui";

/**
 * ThreeDoors — the platform's three verbs, each with one numeric proof,
 * a human CTA, and a plaque-style mono endpoint footnote. Replaces the
 * retail/wholesale framing of ThreeOperations on the homepage (that
 * primitive still serves /platform and /about).
 */
const DOORS = [
  {
    verb: "Know the price",
    href: "/prices",
    cta: "Open the price guide",
    proof: "Cross-source prices, provenance on every row",
    endpoint: "GET /api/v1/universal/card/{sku}",
    why: null as { href: string; label: string } | null,
  },
  {
    verb: "Trade & liquidate",
    href: "/market",
    cta: "Enter the market",
    proof: "P2P market with escrow · instant trade-in quotes",
    endpoint: "GET /api/v1/market",
    why: { href: "/methodology/market", label: "how the market works" },
  },
  {
    verb: "Play",
    href: "/play",
    cta: "Play now — no account",
    proof: "Guest deck mounted in 0 clicks — ST-15 ready",
    endpoint: "GET /play",
    why: null,
  },
];

export default function ThreeDoors() {
  return (
    <section aria-label="What you can do here" className="max-w-7xl mx-auto px-4 py-12">
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-faint mb-4">
        Three doors · one substrate
      </p>
      <div className="grid md:grid-cols-3 gap-4">
        {DOORS.map((door) => (
          <div key={door.verb} className="wardrobe-mat rounded-xl p-6 flex flex-col">
            <h2 className="font-display text-2xl font-bold text-ink">{door.verb}</h2>
            <p className="mt-2 text-sm text-ink-muted leading-relaxed flex-1">
              {door.proof}
              {door.why && (
                <>
                  {" "}
                  <WhyLink href={door.why.href} label={door.why.label} />
                </>
              )}
            </p>
            <Link
              href={door.href}
              className="mt-4 inline-block rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-on-accent hover:bg-accent-strong transition self-start"
            >
              {door.cta} →
            </Link>
            <p className="mt-4 font-mono text-[11px] text-ink-faint truncate" aria-label={`API endpoint: ${door.endpoint}`}>
              {door.endpoint}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
