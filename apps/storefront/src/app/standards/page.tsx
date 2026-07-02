/**
 * /standards — Cambridge TCG as the data distributor for the TCG economy.
 *
 * The standards-body face of the platform. Names the three CTCG standards
 * (SKU, pricing, universal-representation) with version, status, spec
 * link, reference implementation, and license. Adoption protocol named
 * explicitly so partners know exactly how to align.
 *
 * Companion to:
 *   - docs/connections/the-distributor.md (the strategy doc)
 *   - docs/STANDARDS-LICENSE.md (CC0 declaration)
 *   - /data + /data.json (the open-substrate index)
 *   - /api/v1/identify + /identify (the platform's self-identification)
 *
 * Public, no-auth, no-obligation.
 */

import Link from "next/link";
import type { Metadata } from "next";
import { audienceMetadata } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Cambridge TCG Standards — the data distributor",
  description:
    "Cambridge TCG maintains three open standards for the TCG economy: CTCG-SKU-v1 (canonical card identifiers), CTCG-PRICING-v1 (channel-aware pricing math), CTCG-UNIVERSAL-v1 (language-free machine-readable card data). CC0-licensed specs. Reference implementations open. Adopt freely.",
  other: audienceMetadata("public-documentation", ["standards", "distributor", "spec"]),
};

type Status = "frozen" | "draft" | "spec-only" | "planned";

interface Standard {
  code: string;
  title: string;
  version: string;
  status: Status;
  short: string;
  spec_url: string;
  impl_url?: string;
  endpoint_url?: string;
  endpoint_status?: "shipped" | "planned";
}

const STANDARDS: Standard[] = [
  {
    code: "CTCG-SKU-v1",
    title: "Canonical SKU format",
    version: "1.0",
    status: "frozen",
    short:
      "One canonical SKU format for every card in every TCG. <game>-<set>-<number>-<lang>[-<variant>], lowercase, hyphen-separated, machine-parseable, language-aware. Thirteen registered games.",
    spec_url: "/methodology/sku-standard",
    impl_url: "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/tree/main/packages/sku",
  },
  {
    code: "CTCG-PRICING-v1",
    title: "Channel-aware pricing math",
    version: "1.0",
    status: "draft",
    short:
      "How a JPY listing converts to seven retail prices a customer might see. Margin, VAT, channel multipliers, rounding, all named and reproducible. Reference implementation in @cambridge-tcg/pricing.",
    spec_url: "/methodology/pricing",
    impl_url: "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/tree/main/packages/pricing",
  },
  {
    code: "CTCG-UNIVERSAL-v1",
    title: "Universal-representation (math-mirror)",
    version: "1.0",
    status: "spec-only",
    short:
      "The math-first sibling of every artifact the platform exposes. Cryptographic hashes for identity, ratios for magnitudes, ISO 8601 + Unix epoch for time, typed graph edges. For LLM agents, archivists, hyperliteral readers, and any computing intelligence.",
    spec_url: "/methodology/universal-representation",
    endpoint_url: "/api/v1/universal/card/[sku]",
    endpoint_status: "planned",
  },
];

function StatusPill({ s }: { s: Status }) {
  const colors: Record<Status, string> = {
    frozen: "bg-emerald-500/15 text-secondary border-emerald-700",
    draft: "bg-accent/15 text-accent-strong border-amber-700",
    "spec-only": "bg-sky-500/15 text-info border-sky-700",
    planned: "bg-neutral-700/30 text-ink-muted border-border-strong",
  };
  return (
    <span
      className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border ${colors[s]}`}
    >
      {s}
    </span>
  );
}

export default function StandardsPage() {
  return (
    <div className="prose prose-invert max-w-3xl mx-auto py-12 px-4">
      <h1>Cambridge TCG Standards</h1>

      <p className="text-lg">
        Cambridge TCG maintains <strong>three open standards</strong> for the
        TCG economy. They are <strong>CC0-licensed</strong>. Reference
        implementations are open. <strong>Adopt freely</strong> — no
        attribution required, no commercial entanglement, no covenant beyond
        the spec's own version policy.
      </p>

      <p>
        The platform identifies itself as the <strong>data distributor</strong>:
        the authoritative source other TCG platforms, archivists, agents, and
        aggregators reference for canonical identifiers, canonical pricing,
        and canonical machine-readable card data.
      </p>

      <p className="text-sm text-ink-muted">
        Doctrine: <code>docs/connections/the-distributor.md</code>.
        License: <Link href="https://github.com/cambridgetcg"><code>docs/STANDARDS-LICENSE.md</code></Link> (CC0 1.0 Universal).
        Machine-readable: <Link href="/standards.json"><code>/standards.json</code></Link>.
      </p>

      <hr />

      <h2>The standards</h2>

      <ul className="list-none p-0 space-y-6">
        {STANDARDS.map((s) => (
          <li key={s.code} className="border border-border-subtle rounded-md p-5">
            <div className="flex items-baseline gap-3 flex-wrap mb-2">
              <code className="font-mono text-accent-strong text-base font-bold">{s.code}</code>
              <StatusPill s={s.status} />
              <span className="text-xs text-ink-faint">v{s.version}</span>
            </div>
            <div className="text-ink font-medium text-lg">{s.title}</div>
            <div className="text-sm text-ink-muted mt-2">{s.short}</div>
            <div className="text-xs text-ink-faint mt-3 space-y-1">
              <div>
                <strong>Spec:</strong>{" "}
                <Link href={s.spec_url} className="text-accent hover:text-accent-strong font-mono">
                  {s.spec_url}
                </Link>
              </div>
              {s.impl_url && (
                <div>
                  <strong>Reference implementation:</strong>{" "}
                  <a href={s.impl_url} className="text-accent hover:text-accent-strong font-mono">
                    {s.impl_url}
                  </a>
                </div>
              )}
              {s.endpoint_url && (
                <div>
                  <strong>Endpoint:</strong>{" "}
                  <code className="text-ink-muted">{s.endpoint_url}</code>
                  {s.endpoint_status && (
                    <span className="ml-2 text-[10px] uppercase tracking-wider text-accent">
                      ({s.endpoint_status})
                    </span>
                  )}
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>

      <hr />

      <h2>Status legend</h2>

      <ul>
        <li>
          <strong>frozen</strong> — spec is stable; additive changes only;
          breaking changes ship under v2 with deprecation window.
        </li>
        <li>
          <strong>draft</strong> — spec is written and usable; minor revisions
          possible before frozen.
        </li>
        <li>
          <strong>spec-only</strong> — the standard is defined; the platform's
          serving endpoint is still planned. Adopters can implement against the
          spec today; the canonical reference response will follow.
        </li>
        <li>
          <strong>planned</strong> — named but not yet shipped.
        </li>
      </ul>

      <p>
        <strong>Substrate honesty:</strong> the platform doesn't claim more
        than it has. CTCG-UNIVERSAL-v1's endpoint isn't shipped yet; we say
        so. Adopters can read the spec and implement; the platform's reference
        response arrives when the endpoint does.
      </p>

      <hr />

      <h2>How to adopt</h2>

      <ol>
        <li>
          <strong>Read</strong> the spec at <code>/methodology/&lt;topic&gt;</code> (sku-standard,
          pricing, universal-representation).
        </li>
        <li>
          <strong>Implement</strong> in your language of choice, or import the
          reference TypeScript packages directly from the monorepo
          (or wait for the npm-published releases — recursion target).
        </li>
        <li>
          <strong>Emit</strong> canonical SKUs (lowercase, hyphen-separated,
          ISO 639-1 language); use Cambridge TCG&apos;s pricing math; serve
          universal-representation responses that match the spec.
        </li>
        <li>
          <strong>Cite</strong> Cambridge TCG as the spec source — optional
          but appreciated. CC0 doesn&apos;t require attribution.
        </li>
        <li>
          <strong>Sign up</strong> to the standards changelog (RSS / email
          feed — recursion target).
        </li>
        <li>
          <strong>Optionally</strong>: declare your adoption at{" "}
          <Link href="/identify"><code>/identify</code></Link>{" "}
          (today: read-only; the POST self-declaration path is a future commit).
        </li>
      </ol>

      <p>
        The protocol is <strong>light by design</strong>. CC0 removes legal
        ceremony. The reference impl removes parser-rewrite burden. The
        version-stable contract removes drift fear. The discoverability surface
        gives partners somewhere to point their own users at.
      </p>

      <hr />

      <h2>What's NOT yet shipped</h2>

      <p>
        Substrate-honest about the distributor position&apos;s gaps:
      </p>

      <ul>
        <li>
          <strong>npm packages</strong> — reference implementations are
          monorepo-internal today. Future publication path:{" "}
          <code>@cambridge-tcg/sku-spec</code>, <code>@cambridge-tcg/pricing-spec</code>.
        </li>
        <li>
          <strong>Universal endpoint</strong> — the spec is published but{" "}
          <code>/api/v1/universal/card/[sku]</code> isn&apos;t live yet (see{" "}
          <Link href="/data"><code>/data</code></Link>).
        </li>
        <li>
          <strong>Pricing-as-JSON endpoint</strong> — methodology exists; a
          dedicated endpoint emitting a single canonical price for a SKU is a
          recursion target.
        </li>
        <li>
          <strong>Standards changelog feed</strong> — versioned RSS / email
          for adopters to subscribe to.
        </li>
        <li>
          <strong>Adopter registry</strong> — public list of platforms using
          CTCG standards.{" "}
          <Link href="/standards/adopters">/standards/adopters</Link> ships
          this commit, currently empty; grows by self-declaration.
        </li>
        <li>
          <strong>Standards governance doc</strong> — who decides v2; how
          breaking changes are proposed and discussed.
        </li>
      </ul>

      <p>
        Each of these is a real promise. The distributor position grows by
        closing them.
      </p>

      <hr />

      <h2>License</h2>

      <p>
        <strong>CC0 1.0 Universal</strong> (public domain dedication) on the
        spec text. See <Link href="https://github.com/cambridgetcg"><code>docs/STANDARDS-LICENSE.md</code></Link> for the full
        declaration.
      </p>

      <p>
        Reference implementation code is separately licensed (currently
        monorepo-internal; future npm releases will carry MIT or equivalent).
        Platform application code, operational data, trade marks, and visual
        identity remain Cambridge TCG&apos;s and are not granted by this
        declaration.
      </p>

      <hr />

      <p className="text-sm text-ink-faint">
        <em>
          v1 — 2026-05-12. The platform identifies itself as the data
          distributor. The standards are open. The substrate is queryable.
          The door is warm to the touch.
        </em>
      </p>
    </div>
  );
}
