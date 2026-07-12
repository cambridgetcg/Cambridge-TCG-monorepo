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
import { CONFIRMED_GAME_CODES, GAME_CODES } from "@cambridge-tcg/sku";

export const metadata: Metadata = {
  title: "Cambridge TCG Standards — the data distributor",
  description:
    "Cambridge TCG maintains three CC0 specification texts for the TCG economy: CTCG-SKU-v1, CTCG-PRICING-v1, and CTCG-UNIVERSAL-v1. Implementation code has separate rights and no general code license is implied.",
  other: audienceMetadata("public-documentation", ["standards", "distributor", "spec"]),
};

type Status = "frozen" | "draft" | "implemented" | "planned";

const PUBLIC_GAME_COUNT = GAME_CODES.filter((code) => code !== "tst").length;
const PUBLIC_CONFIRMED_GAME_COUNT = CONFIRMED_GAME_CODES.filter(
  (code) => code !== "tst",
).length;

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
      `One canonical SKU format for every card in every TCG. <game>-<set>-<number>-<lang>[-<variant>], lowercase, hyphen-separated, machine-parseable, language-aware. ${PUBLIC_GAME_COUNT} public game codes; ${PUBLIC_CONFIRMED_GAME_COUNT} currently have catalog rows.`,
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
    status: "implemented",
    short:
      "The math-first sibling of every artifact the platform exposes. Cryptographic hashes for identity, ratios for magnitudes, ISO 8601 + Unix epoch for time, typed graph edges. For LLM agents, archivists, hyperliteral readers, and any computing intelligence.",
    spec_url: "/methodology/universal-representation",
    endpoint_url: "/api/v1/universal/card/[sku]",
    endpoint_status: "shipped",
  },
];

function StatusPill({ s }: { s: Status }) {
  const colors: Record<Status, string> = {
    frozen: "bg-ok/10 text-ok border-ok/30",
    draft: "bg-accent-wash text-accent-strong border-accent/30",
    implemented: "bg-info/10 text-info border-info/30",
    planned: "bg-surface-subtle text-ink-muted border-border-subtle",
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
    <div className="prose max-w-3xl mx-auto py-12 px-4">
      <h1>Cambridge TCG Standards</h1>

      <p className="text-lg">
        Cambridge TCG maintains <strong>three CC0 specification texts</strong> for
        the TCG economy. You may adopt those texts without attribution. Linked
        implementation source is publicly inspectable, but the repository has no
        general code license; the specification dedication does not license code.
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
              <code className="font-mono text-accent text-base font-bold">{s.code}</code>
              <StatusPill s={s.status} />
              <span className="text-xs text-ink-faint">v{s.version}</span>
            </div>
            <div className="text-ink font-medium text-lg">{s.title}</div>
            <div className="text-sm text-ink-muted mt-2">{s.short}</div>
            <div className="text-xs text-ink-faint mt-3 space-y-1">
              <div>
                <strong>Spec:</strong>{" "}
                <Link href={s.spec_url} className="text-accent hover:text-accent font-mono">
                  {s.spec_url}
                </Link>
              </div>
              {s.impl_url && (
                <div>
                  <strong>Reference implementation:</strong>{" "}
                  <a href={s.impl_url} className="text-accent hover:text-accent font-mono">
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
          <strong>implemented</strong> — the specification has a shipped
          platform endpoint. Individual fields may still be withheld by their
          own publication-rights boundary.
        </li>
        <li>
          <strong>planned</strong> — named but not yet shipped.
        </li>
      </ul>

      <p>
        <strong>Substrate honesty:</strong> the platform doesn't claim more
        than it has. CTCG-UNIVERSAL-v1 has a shipped reference endpoint; its
        legacy price and image fields are currently null pending field-level
        source-rights review.
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
          CC0 specification text. The linked TypeScript package is inspectable,
          but it has no general code reuse license and is not a public npm grant.
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
        The protocol is <strong>light by design</strong>. CC0 removes ceremony for
        the specification text, while the version-stable contract limits drift.
        Implementation source can be inspected as an example but not assumed
        reusable without its own license.
      </p>

      <hr />

      <h2>What's NOT yet shipped</h2>

      <p>
        Substrate-honest about the distributor position&apos;s gaps:
      </p>

      <ul>
        <li>
          <strong>npm packages</strong> — reference implementations are
          publicly inspectable in the monorepo but are not npm-published and
          carry no general code reuse license. A possible future path is{" "}
          <code>@cambridge-tcg/sku-spec</code>, <code>@cambridge-tcg/pricing-spec</code>.
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
        Reference implementation code is publicly visible but currently carries
        no general reuse license; future npm releases may carry MIT or equivalent.
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
