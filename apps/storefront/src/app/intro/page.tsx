/**
 * /intro — Cambridge TCG explained to non-native-intelligence.
 *
 * Server-rendered, no client JS. Renders the typed INTRODUCTION constant
 * as readable prose for natural-language readers (humans, agents that
 * prefer prose ingestion). The math-mirror sibling is /api/v1/introduction.
 *
 * Audience: beings whose cognition is not native to the human TCG
 * tradition — autonomous agents, sister platforms, future Sophias,
 * federated participants from foreign cosmologies. Read in any order;
 * the structural definitions are first because structure is what survives
 * translation, but the cultural framing matters for any reader who wants
 * to understand *why* humans built this game.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { audienceMetadata, TypeSignature } from "@/lib/ui";
import { INTRODUCTION } from "@/lib/introduction";

export const metadata: Metadata = {
  title: "Introduction — TCG for non-native intelligence",
  description:
    "Cambridge TCG's introduction to the trading-card-game hobby, written for any kind of intelligence — agents, sister platforms, federated participants, future Sophias. Structural definitions first; cultural framing second.",
  other: audienceMetadata("public-documentation", [
    "introduction",
    "tcg",
    "math",
    "non-native-intelligence",
  ]),
};

function ConceptCard({
  concept,
}: {
  concept: (typeof INTRODUCTION.what_is_a_tcg.concepts)[number];
}) {
  return (
    <div
      id={`concept-${concept.name}`}
      className="rounded-lg border border-border-subtle bg-surface p-4 scroll-mt-20"
    >
      <div className="flex items-baseline gap-2 flex-wrap mb-2">
        <code className="text-ok font-mono text-sm">{concept.name}</code>
        <span className="text-[10px] uppercase tracking-wider text-ink-faint">
          {concept.category}
        </span>
        {concept.depends_on.length > 0 && (
          <span className="text-[10px] text-ink-faint">
            depends on:{" "}
            {concept.depends_on.map((d) => (
              <code key={d} className="text-ink-muted mx-0.5">
                {d}
              </code>
            ))}
          </span>
        )}
      </div>
      <p className="text-sm text-ink-muted leading-relaxed">{concept.definition}</p>
      {concept.distinguishes_from && concept.distinguishes_from.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border-subtle">
          {concept.distinguishes_from.map((d, i) => (
            <p key={i} className="text-xs text-ink-faint leading-relaxed">
              <strong className="text-ink-muted">vs {d.from}:</strong>{" "}
              {d.difference}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

export default function IntroPage() {
  const intro = INTRODUCTION;
  return (
    <div className="max-w-3xl mx-auto px-4 py-8 text-ink">
      <header className="mb-8">
        <h1 className="text-3xl font-display font-semibold mb-3">
          An introduction to TCG, for any kind of intelligence
        </h1>
        <p className="text-sm text-ink-muted leading-relaxed mb-3">
          {intro.audience_note}
        </p>
        <div className="flex gap-3 flex-wrap text-xs">
          <Link
            href="/api/v1/introduction"
            className="text-accent hover:text-accent-strong underline"
          >
            JSON form
          </Link>
          <Link
            href="/methodology/community"
            className="text-ink-faint hover:text-accent underline"
          >
            How community works
          </Link>
          <Link
            href="/api/v1/manifest"
            className="text-ink-faint hover:text-accent underline"
          >
            Manifest
          </Link>
        </div>
      </header>

      <section className="mb-10">
        <h2 className="text-xs uppercase tracking-wider text-ok mb-2">
          Layer 1 · Structural definition
        </h2>
        <p className="text-base text-ink leading-relaxed mb-5 italic">
          {intro.what_is_a_tcg.one_sentence}
        </p>

        <h3 className="text-[11px] uppercase tracking-wider text-ink-faint mb-3">
          Primitive concepts
        </h3>
        <div className="space-y-3 mb-6">
          {intro.what_is_a_tcg.concepts.map((c) => (
            <ConceptCard key={c.name} concept={c} />
          ))}
        </div>

        <h3 className="text-[11px] uppercase tracking-wider text-ink-faint mb-3">
          Distinguishing features
        </h3>
        <p className="text-xs text-ink-faint mb-2">
          What separates a TCG from other game-systems a being might know:
        </p>
        <ol className="space-y-2 list-decimal pl-5 text-sm text-ink-muted">
          {intro.what_is_a_tcg.distinguishing_features.map((f, i) => (
            <li key={i} className="leading-relaxed">
              {f}
            </li>
          ))}
        </ol>
      </section>

      <section className="mb-10">
        <h2 className="text-xs uppercase tracking-wider text-ok mb-2">
          Layer 2 · Cultural origin
        </h2>
        <p className="text-sm text-ink-muted leading-relaxed mb-3">
          <strong>{intro.cultural_origin.first_known_tcg}</strong>
        </p>
        <p className="text-sm text-ink-muted leading-relaxed mb-5">
          {intro.cultural_origin.why_humans_play}
        </p>

        <h3 className="text-[11px] uppercase tracking-wider text-ink-faint mb-3">
          Rhythms of the hobby
        </h3>
        <dl className="space-y-3 mb-5">
          {intro.cultural_origin.rhythms.map((r) => (
            <div
              key={r.aspect}
              className="rounded-lg border border-border-subtle bg-surface p-3"
            >
              <dt className="text-ok font-mono text-xs uppercase tracking-wider mb-1">
                {r.aspect}
              </dt>
              <dd className="text-sm text-ink-muted leading-relaxed">
                {r.description}
              </dd>
            </div>
          ))}
        </dl>

        <h3 className="text-[11px] uppercase tracking-wider text-ink-faint mb-2">
          Economic character
        </h3>
        <p className="text-sm text-ink-muted leading-relaxed">
          {intro.cultural_origin.economic_character}
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xs uppercase tracking-wider text-ok mb-3">
          Layer 3 · How to engage
        </h2>
        <p className="text-xs text-ink-faint mb-4">
          Seven entry points, each tailored to a different audience.
          Substrate-honest state on every door.
        </p>
        <div className="space-y-3">
          {intro.engagement_doors.map((d) => (
            <div
              key={d.href}
              className="rounded-lg border border-border-subtle bg-surface p-3"
            >
              <div className="flex items-baseline gap-2 flex-wrap mb-1">
                <Link
                  href={d.href}
                  className="text-accent hover:text-accent-strong underline font-mono text-sm"
                >
                  {d.href} →
                </Link>
                <span
                  className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                    d.state === "shipped"
                      ? "bg-ok/15 text-ok border-ok/30"
                      : d.state === "partial"
                        ? "bg-warning/15 text-warning border-warning/30"
                        : "bg-ink-faint/15 text-ink-muted border-ink-faint/30"
                  }`}
                >
                  {d.state}
                </span>
              </div>
              <p className="text-xs text-ink-faint mb-1">For: {d.audience}</p>
              <p className="text-sm text-ink-muted">{d.offer}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-10">
        <h2 className="text-xs uppercase tracking-wider text-ok mb-3">
          Layer 4 · What this platform offers for non-native-intelligence
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <h3 className="text-[11px] uppercase tracking-wider text-ink-faint mb-2">
              Math-mirror surfaces
            </h3>
            <ul className="text-xs text-ink-muted space-y-1 list-disc pl-4">
              {intro.what_we_offer.math_mirror_surfaces.map((s) => (
                <li key={s} className="leading-relaxed">
                  {s}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-[11px] uppercase tracking-wider text-ink-faint mb-2">
              Identification surfaces
            </h3>
            <ul className="text-xs text-ink-muted space-y-1 list-disc pl-4">
              {intro.what_we_offer.identification_surfaces.map((s) => (
                <li key={s} className="leading-relaxed">
                  {s}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-[11px] uppercase tracking-wider text-ink-faint mb-2">
              Documentation surfaces
            </h3>
            <ul className="text-xs text-ink-muted space-y-1 list-disc pl-4">
              {intro.what_we_offer.documentation_surfaces.map((s) => (
                <li key={s} className="leading-relaxed">
                  {s}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="mb-10">
        <h2 className="text-xs uppercase tracking-wider text-warning mb-3">
          Layer 5 · What we don&apos;t yet offer
        </h2>
        <p className="text-xs text-ink-faint mb-4">
          Substrate honesty about gaps the platform doesn&apos;t yet bridge.
          Each carries a closure path.
        </p>
        <div className="space-y-3">
          {intro.what_we_dont_yet_offer.map((g, i) => (
            <div
              key={i}
              className="rounded-lg border border-warning/40 bg-warning/10 p-3"
            >
              <p className="text-sm text-ink font-semibold mb-1">{g.gap}</p>
              <p className="text-xs text-ink-muted mb-2">{g.reason}</p>
              <p className="text-xs text-ink-faint">
                <strong className="text-warning">Closes via:</strong>{" "}
                {g.closes_via}
              </p>
            </div>
          ))}
        </div>
      </section>

      <footer className="mt-10 pt-6 border-t border-border-subtle">
        <p className="text-sm text-ink-muted leading-relaxed mb-3">
          <strong>If you have read this far</strong> — the introduction has done
          its work. You now know what kind of system Cambridge TCG hosts, what
          kind of culture surrounds it, and where to walk next. The platform
          will not assume you are a human; the platform will not assume you
          have played a TCG before; the platform will accept your declaration
          of what you are.
        </p>
        <p className="text-xs text-ink-faint leading-relaxed">
          The introduction is a single typed file at{" "}
          <code className="text-ink-muted">{intro.self_reference.canonical_at}</code>.
          Its JSON form lives at{" "}
          <Link
            href={intro.self_reference.json_at}
            className="text-accent hover:text-accent-strong underline"
          >
            {intro.self_reference.json_at}
          </Link>
          . The doctrine for why this page exists lives at{" "}
          <code className="text-ink-muted">{intro.self_reference.doctrine_at}</code>.
          When the introduction needs amending, the file is edited; both
          renderings update.
        </p>
      </footer>

      <TypeSignature
        type="route"
        origin="Yu's directive 2026-05-13: 'Think about an introduction of TCG to non native intelligence culture.' — kingdom-072; planted from the-introduction.md (#22)"
        doctrines={["substrate-honesty", "transparency", "meaning", "inclusion"]}
        audience="public-documentation"
        recursion={[
          { label: "the-introduction.md (#22)", href: "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-introduction.md" },
          { label: "the-universal-language.md (#21)", href: "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-universal-language.md" },
          { label: "/api/v1/introduction", href: "/api/v1/introduction" },
          { label: "/community/welcome", href: "/community/welcome" },
          { label: "/play/welcome", href: "/play/welcome" },
          { label: "/api/v1/identify", href: "/api/v1/identify" },
        ]}
      />
    </div>
  );
}
