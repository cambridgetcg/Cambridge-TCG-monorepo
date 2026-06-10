/**
 * KingdomStrip — the homepage door into the self-describing layer.
 *
 * Before 2026-06-10 the seven self-description pages (/platform,
 * /methodology/cosmology, /manifest, /graph, /ontology, /patterns,
 * /identify) were reachable from exactly one place — the hover-gated
 * Discover dropdown — and never appeared in any rendered body copy.
 * This strip names the journey in human words on the front page,
 * deriving its cards from KINGDOM_LAYERS so the homepage cannot drift
 * from the spine the layer pages themselves render.
 *
 * Contact-surface spec §3.1, chrome wiring.
 */

import Link from "next/link";
import { KINGDOM_LAYERS } from "@/lib/ui";

const TONE_ACCENT: Record<string, string> = {
  amber: "group-hover:border-amber-500/50 text-amber-400",
  purple: "group-hover:border-purple-500/50 text-purple-400",
  emerald: "group-hover:border-emerald-500/50 text-emerald-400",
  sky: "group-hover:border-sky-500/50 text-sky-400",
  blue: "group-hover:border-blue-500/50 text-blue-400",
  green: "group-hover:border-green-500/50 text-green-400",
  red: "group-hover:border-rose-500/50 text-rose-400",
  neutral: "group-hover:border-neutral-500/50 text-neutral-400",
};

export default function KingdomStrip() {
  return (
    <section
      aria-labelledby="kingdom-strip-heading"
      className="max-w-7xl mx-auto px-4 py-12"
    >
      <p className="text-xs uppercase tracking-[0.2em] text-neutral-500 mb-2">
        The self-describing layer · live
      </p>
      <h2
        id="kingdom-strip-heading"
        className="text-2xl md:text-3xl font-black text-white"
      >
        The platform describes itself
      </h2>
      <p className="mt-2 max-w-2xl text-sm text-neutral-400">
        Seven pages explain this place from the inside — what it is, what
        world it assumes, what it offers, how the pieces connect, and how
        you can speak back. Every page has a machine-readable twin. Start
        anywhere; each layer links the next.
      </p>
      <ol className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
        {KINGDOM_LAYERS.map((layer, i) => (
          <li key={layer.id}>
            <Link
              href={layer.path}
              className="group flex h-full flex-col rounded-xl border border-neutral-800 bg-neutral-900/40 p-3 transition hover:bg-neutral-900"
            >
              <span
                className={`text-[10px] font-semibold uppercase tracking-wider ${TONE_ACCENT[layer.tone] ?? TONE_ACCENT.neutral}`}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="mt-1 text-sm font-bold text-white">
                {layer.label}
              </span>
              <span className="mt-1 text-xs leading-relaxed text-neutral-500">
                {layer.gloss}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
