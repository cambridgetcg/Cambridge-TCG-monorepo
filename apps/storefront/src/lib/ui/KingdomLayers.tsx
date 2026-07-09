/**
 * KingdomLayers — the layer spine of the platform's self-description.
 *
 * Seven pages describe the platform to its participants, each at a
 * different depth: platform (why), cosmology (in what world), manifest
 * (what's offered), graph (how it connects), ontology (what each kind
 * is), patterns (what forms recur), identify (who is speaking — both
 * ways). Before 2026-06-10 each page hand-rolled its companion links in
 * a prose blockquote with inconsistent naming, so the stack was never
 * visible as one walkable journey. This strip is the single source for
 * the stack's order, labels, and plain-English glosses.
 *
 * The embassy is deliberately not a stop — it is recognised by its
 * protocols, not by a banner (docs/connections/the-recognition.md).
 *
 * Spec: docs/superpowers/specs/2026-06-10-kingdom-contact-surface-design.md §3.1.
 */

import Link from "next/link";
import type { Tone } from "./Badge";

export type KingdomLayerId =
  | "platform"
  | "cosmology"
  | "manifest"
  | "graph"
  | "ontology"
  | "patterns"
  | "identify";

export interface KingdomLayer {
  id: KingdomLayerId;
  path: string;
  /** Short human label — "The mesh", not "Typed meaning-graph". */
  label: string;
  /** One plain-English sentence a first-time visitor can hold. */
  gloss: string;
  tone: Tone;
}

export const KINGDOM_LAYERS: readonly KingdomLayer[] = [
  {
    id: "platform",
    path: "/platform",
    label: "The platform",
    gloss: "Why this exists and who it serves.",
    tone: "amber",
  },
  {
    id: "cosmology",
    path: "/methodology/cosmology",
    label: "The world",
    gloss: "What we treat as real — and what we don't model yet.",
    tone: "purple",
  },
  {
    id: "manifest",
    path: "/manifest",
    label: "The directory",
    gloss: "Everything on offer, in one list.",
    tone: "emerald",
  },
  {
    id: "graph",
    path: "/graph",
    label: "The mesh",
    gloss: "How every piece connects to every other.",
    tone: "sky",
  },
  {
    id: "ontology",
    path: "/ontology",
    label: "The schema",
    gloss: "What each kind of thing is, property by property.",
    tone: "blue",
  },
  {
    id: "patterns",
    path: "/patterns",
    label: "The forms",
    gloss: "The shapes that keep recurring, named so they can be reused.",
    tone: "green",
  },
  {
    id: "identify",
    path: "/identify",
    label: "The mirror",
    gloss: "The platform declares itself — and you can declare yourself back.",
    tone: "red",
  },
];

// Muted dots — one per Badge tone; plum/moss/teal literals match
// Badge's TONE_CLS so the tone vocabulary reads the same everywhere.
const DOT_CLS: Record<Tone, string> = {
  amber: "bg-warning",
  red: "bg-danger",
  emerald: "bg-ok",
  blue: "bg-info",
  purple: "bg-[#6a5a8f]",
  neutral: "bg-ink-faint",
  green: "bg-[#567436]",
  sky: "bg-[#3e7d8f]",
};

interface KingdomLayersProps {
  /** Which layer the rendering page is. */
  current: KingdomLayerId;
}

/**
 * Horizontal wrap-friendly strip: seven stops with a you-are-here
 * highlight, the current layer's gloss, and prev/next links. Server
 * component — no client JS.
 */
export function KingdomLayers({ current }: KingdomLayersProps) {
  const idx = KINGDOM_LAYERS.findIndex((l) => l.id === current);
  const layer = KINGDOM_LAYERS[idx];
  const prev = idx > 0 ? KINGDOM_LAYERS[idx - 1] : null;
  const next = idx < KINGDOM_LAYERS.length - 1 ? KINGDOM_LAYERS[idx + 1] : null;

  return (
    <nav
      aria-label="Self-description layers"
      className="not-prose my-6 rounded-lg border border-border-subtle bg-surface px-4 py-3"
    >
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-2 text-xs">
        {KINGDOM_LAYERS.map((l, i) => {
          const isCurrent = l.id === current;
          return (
            <li key={l.id} className="flex items-center gap-1">
              {i > 0 && (
                <span aria-hidden="true" className="text-ink-faint px-0.5">
                  →
                </span>
              )}
              {isCurrent ? (
                <span
                  aria-current="page"
                  className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent-wash px-2.5 py-1 font-semibold text-accent-strong"
                >
                  <span
                    aria-hidden="true"
                    className={`h-1.5 w-1.5 rounded-full ${DOT_CLS[l.tone]}`}
                  />
                  {l.label}
                </span>
              ) : (
                <Link
                  href={l.path}
                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-ink-muted transition hover:bg-surface-subtle hover:text-ink"
                >
                  <span
                    aria-hidden="true"
                    className={`h-1.5 w-1.5 rounded-full opacity-60 ${DOT_CLS[l.tone]}`}
                  />
                  {l.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-sm text-ink-muted">
        <span className="text-ink">
          Layer {idx + 1} of {KINGDOM_LAYERS.length}.
        </span>{" "}
        {layer.gloss}
        <span className="ml-2 whitespace-nowrap text-xs text-ink-faint">
          {prev && (
            <Link href={prev.path} className="hover:text-accent">
              ← {prev.label}
            </Link>
          )}
          {prev && next && <span className="px-1.5">·</span>}
          {next && (
            <Link href={next.path} className="hover:text-accent">
              {next.label} →
            </Link>
          )}
        </span>
      </p>
    </nav>
  );
}
