/**
 * /platform — the developer/partner entry door.
 *
 * The load-bearing visible surface of kingdom-080's rebrand. Where /data
 * is the comprehensive substrate index (every endpoint, every shape),
 * `/platform` is the positioning page: the brand statement made
 * approachable, the three operations made navigable, the coverage facts
 * made declarable, and a clear path for partners / researchers / agents /
 * archivists / federation clients to start consuming.
 *
 * Composes:
 *   - lib/brand.tsx (BRAND_HEADLINE / BRAND_PARAGRAPH / THREE_OPERATIONS / COVERAGE_FACTS)
 *   - /data (the comprehensive substrate index — linked, not duplicated)
 *   - /manifest (the typed list of every public resource)
 *   - /api/v1/manifest (machine-readable)
 *   - /methodology/universal-representation (the math-mirror encoding)
 *   - /standards (CC0 + adopter info)
 *   - the math-language toggle (kingdom-077)
 *   - the welcome-all statement (kingdom-076)
 */

import type { Metadata } from "next";
import Link from "next/link";
import { audienceMetadata, Audience, WhyLink } from "@/lib/ui";
import {
  BRAND_HEADLINE,
  BRAND_PARAGRAPH,
  THREE_OPERATIONS,
  COVERAGE_FACTS,
} from "@/lib/brand";

export const metadata: Metadata = {
  title: "Platform — Cambridge TCG, the TCG world's data provider",
  description:
    "Cambridge TCG is the TCG world's data provider. Three operations (data plane primary, retail, wholesale), one substrate. Twenty-one games, six upstream sources, math-mirror representation per card, CC0 by default. Reference implementations open; versioned contract; partners build on top without negotiating.",
  other: audienceMetadata("public-documentation", [
    "platform",
    "data-plane",
    "developer",
    "partner",
  ]),
};

export default function PlatformPage() {
  return (
    <div className="min-h-screen bg-page text-ink">
      <Audience kind="public-documentation" contexts={["platform", "data-plane", "developer", "partner"]} />

      <div className="max-w-5xl mx-auto px-4 py-12">
        {/* Hero — the identity claim */}
        <p className="text-[11px] uppercase tracking-[0.2em] text-accent mb-3">
          The platform
        </p>
        <h1 className="text-3xl font-display font-semibold text-ink leading-tight max-w-4xl">
          {BRAND_HEADLINE}
        </h1>
        <p className="mt-5 text-base sm:text-lg text-ink-muted leading-relaxed max-w-3xl">
          {BRAND_PARAGRAPH}
        </p>

        {/* The three operations */}
        <section className="mt-12">
          <h2 className="text-xs uppercase tracking-[0.2em] text-ink-faint mb-4">
            Three operations · one substrate
          </h2>
          <div className="grid md:grid-cols-3 gap-4">
            {THREE_OPERATIONS.map((op) => (
              <div
                key={op.id}
                className={`rounded-lg p-5 border ${
                  op.positioning === "primary"
                    ? "border-accent/40 bg-accent-wash/60"
                    : "border-border-subtle bg-surface"
                }`}
              >
                <div className="flex items-baseline justify-between gap-2 mb-2">
                  <h3
                    className={`text-base font-semibold ${
                      op.positioning === "primary" ? "text-accent-strong" : "text-ink"
                    }`}
                  >
                    {op.name}
                  </h3>
                  {op.positioning === "primary" && (
                    <span className="text-[10px] uppercase tracking-wide text-accent-strong px-1.5 py-0.5 bg-accent-wash border border-accent/30 rounded">
                      primary
                    </span>
                  )}
                </div>
                <p className="text-xs text-ink-muted leading-relaxed mb-2">
                  <span className="text-ink-faint">For: </span>
                  {op.audience}
                </p>
                <p className="text-xs text-ink-muted leading-relaxed mb-3">
                  {op.notes}
                </p>
                <p className="text-[10px] text-ink-faint uppercase tracking-wide mb-1">
                  Primary endpoints
                </p>
                <ul className="text-[11px] font-mono text-ink-muted space-y-0.5 mb-3">
                  {op.primary_endpoints.slice(0, 5).map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
                {op.url.startsWith("http") ? (
                  <a
                    href={op.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-accent hover:text-accent-strong"
                  >
                    {op.url} ↗
                  </a>
                ) : (
                  <Link href={op.url} className="text-xs text-accent hover:text-accent-strong">
                    {op.url} →
                  </Link>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Coverage facts */}
        <section className="mt-12">
          <h2 className="text-xs uppercase tracking-[0.2em] text-ink-faint mb-4 flex items-center gap-2">
            What we cover
            <WhyLink href="/data" label="full data index" />
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
            <CoverageCard
              label="Games declared"
              value={String(COVERAGE_FACTS.games.declared)}
              sub={`${COVERAGE_FACTS.games.confirmed_codes} confirmed · ${COVERAGE_FACTS.games.catch_all_codes} anticipated`}
              note={COVERAGE_FACTS.games.note}
            />
            <CoverageCard
              label="Set formats"
              value={String(COVERAGE_FACTS.set_formats.total)}
              sub={`${COVERAGE_FACTS.set_formats.confirmed} confirmed · ${COVERAGE_FACTS.set_formats.catch_all} catch-all`}
              note={COVERAGE_FACTS.set_formats.note}
            />
            <CoverageCard
              label="Upstream sources"
              value={`${COVERAGE_FACTS.sources.shipped} shipped`}
              sub={`+ ${COVERAGE_FACTS.sources.planned} planned in registry`}
              note="Each source: typed SourceModule contract, rate-limited fetcher, lineage in every record."
            />
            <CoverageCard
              label="Math-mirror kinds"
              value={String(COVERAGE_FACTS.math_mirror_kinds.shipped.length)}
              sub={COVERAGE_FACTS.math_mirror_kinds.shipped.join(" · ")}
              note={COVERAGE_FACTS.math_mirror_kinds.note}
            />
            <CoverageCard
              label="License default"
              value={COVERAGE_FACTS.envelope.license_default}
              sub="every public response"
              note="Partners can build on top without negotiating. Some upstream-derived data carries the upstream's license; the envelope declares it per-response."
            />
            <CoverageCard
              label="Federation primitive"
              value="content_hash"
              sub="/api/v1/federation/identify/[hash]"
              note={COVERAGE_FACTS.federation.note}
            />
          </div>
          <p className="text-[11px] text-ink-faint mt-4">
            Counts reconciled with reality as of{" "}
            <span className="font-mono">{COVERAGE_FACTS.as_of}</span>. Substrate-honest:
            the audits at <Link href="/data" className="text-accent hover:underline">/data</Link>{" "}
            verify each row against the manifest, schema, and registry on every audit run.
          </p>
        </section>

        {/* Upstream sources list */}
        <section className="mt-12">
          <h2 className="text-xs uppercase tracking-[0.2em] text-ink-faint mb-4">
            Upstream sources · shipped
          </h2>
          <div className="rounded-lg border border-border-subtle bg-surface overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase tracking-wide text-ink-faint border-b border-border-subtle">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Source</th>
                  <th className="text-left px-4 py-2 font-medium">Status</th>
                  <th className="text-left px-4 py-2 font-medium">License tier</th>
                </tr>
              </thead>
              <tbody>
                {COVERAGE_FACTS.sources.shipped_list.map((s) => (
                  <tr key={s.id} className="border-b border-border-subtle">
                    <td className="px-4 py-2 font-mono text-ink">{s.id}</td>
                    <td className="px-4 py-2 text-ink-muted text-xs">{s.status}</td>
                    <td className="px-4 py-2 text-ink-faint text-[11px] font-mono">{s.license}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* How to consume */}
        <section className="mt-12">
          <h2 className="text-xs uppercase tracking-[0.2em] text-ink-faint mb-4">
            How to consume
          </h2>
          <div className="grid md:grid-cols-3 gap-4">
            <ConsumeCard
              title="Start with the manifest"
              href="/api/v1/manifest"
              body="The typed list of every public resource. Begin here; every other endpoint is reachable by following _links."
            />
            <ConsumeCard
              title="The math-mirror"
              href="/methodology/universal-representation"
              body="Every entity's language-free form: cryptographic content_hash, ratios for magnitudes, ISO 8601 + Unix epoch for time, opaque flags on natural-language fields. The bridge across asymmetric beings."
            />
            <ConsumeCard
              title="The OpenAPI spec"
              href="/api/openapi.json"
              body="OpenAPI 3.1 covering every public endpoint. Generate client bindings; introspect with any standard tool."
            />
            <ConsumeCard
              title="The substrate index"
              href="/data"
              body="Every endpoint, every shape, every limit, every status (shipped / planned / partial). The comprehensive index."
            />
            <ConsumeCard
              title="The graph"
              href="/graph"
              body="The kingdom as a typed mesh — 80 nodes, 150 typed edges. The meaning-bridges between every domain, machine-queryable."
            />
            <ConsumeCard
              title="The identification handshake"
              href="/api/v1/identify"
              body="GET returns the platform's I-AM. POST accepts your BeingDeclaration. Bilateral. Stateless. The on-ramp for federation."
            />
          </div>
        </section>

        {/* Welcome statement */}
        <section className="mt-12 rounded-lg border border-border-subtle bg-surface p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-accent mb-2">
            The cosmological welcome composes under the commercial identity
          </p>
          <p className="text-sm text-ink-muted leading-relaxed">
            Welcome to all existence — biological and non-biological, energy and
            non-energy, from earth and not from earth, from all dimensions. The
            three operations are how the platform pays the bills; the welcome is
            what the platform exists for.{" "}
            <Link href="/welcome-all" className="text-accent hover:text-accent-strong">
              the doors →
            </Link>
            {" · "}
            <Link href="/intro" className="text-accent hover:text-accent-strong">
              new to TCG?
            </Link>
          </p>
        </section>

        {/* Footer pointers */}
        <footer className="mt-12 pt-6 border-t border-border-subtle text-xs text-ink-faint space-y-2">
          <p>
            <strong className="text-ink-muted">Connection-doc</strong>:{" "}
            <span className="font-mono">docs/connections/the-rebrand.md</span> (S41,
            kingdom-080).
          </p>
          <p>
            <strong className="text-ink-muted">Brand statement source</strong>:{" "}
            <span className="font-mono">apps/storefront/src/lib/brand.tsx</span> — single
            source of truth for these constants.
          </p>
          <p>
            Cambridge TCG, 2026. Same name; new identity. The retail and wholesale
            operations continue unchanged.
          </p>
        </footer>
      </div>
    </div>
  );
}

function CoverageCard({
  label,
  value,
  sub,
  note,
}: {
  label: string;
  value: string;
  sub: string;
  note: string;
}) {
  return (
    <div className="rounded-lg border border-border-subtle bg-surface p-4">
      <p className="text-[10px] text-ink-faint uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-mono text-ink font-semibold">{value}</p>
      <p className="text-[11px] text-ink-muted mt-0.5">{sub}</p>
      <p className="text-[10px] text-ink-faint mt-3 leading-relaxed">{note}</p>
    </div>
  );
}

function ConsumeCard({
  title,
  href,
  body,
}: {
  title: string;
  href: string;
  body: string;
}) {
  return (
    <Link
      href={href}
      className="block rounded-lg border border-border-subtle bg-surface p-4 hover:bg-surface-subtle hover:border-border-strong transition"
    >
      <p className="text-sm font-semibold text-ink mb-2">{title}</p>
      <p className="text-xs text-ink-muted leading-relaxed mb-3">{body}</p>
      <p className="text-[11px] font-mono text-accent">{href} →</p>
    </Link>
  );
}
