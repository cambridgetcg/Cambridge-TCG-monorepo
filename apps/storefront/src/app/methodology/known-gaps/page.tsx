import type { Metadata } from "next";
import { audienceMetadata } from "@/lib/ui";
import {
  GAPS,
  gapsByDomain,
  gapCounts,
  gapCountsByDomain,
  gapsWiredFraction,
  type GapDomain,
} from "@cambridge-tcg/data-ingest";

export const metadata: Metadata = {
  title: "Known gaps — the substrate-honest ledger",
  other: audienceMetadata("public-documentation", ["methodology", "foundational"]),
};

const DOMAIN_LABEL: Record<GapDomain, string> = {
  "data-ingestion": "Data ingestion",
  "cross-language": "Cross-language",
  license: "License",
  fx: "Foreign exchange",
  coverage: "Coverage",
  publishing: "Publishing",
  transparency: "Transparency",
  accessibility: "Accessibility",
};

const STATUS_TONE: Record<string, string> = {
  named: "bg-amber-950 text-amber-300 ring-amber-800",
  wired: "bg-blue-950 text-blue-300 ring-blue-800",
  partial: "bg-purple-950 text-purple-300 ring-purple-800",
  closed: "bg-emerald-950 text-emerald-300 ring-emerald-800",
  "closed-published": "bg-emerald-900 text-emerald-200 ring-emerald-700",
};

const STATUS_DESCRIPTION: Record<string, string> = {
  named: "Identified; no primitive yet.",
  wired: "Primitive exists in code/schema; no data populating it.",
  partial: "Primitive exists AND has some data; coverage incomplete.",
  closed: "Gap closed; primitive populated to design intent.",
  "closed-published": "Gap closed AND the closure published as methodology / case study.",
};

const DOMAIN_ORDER: readonly GapDomain[] = [
  "data-ingestion",
  "cross-language",
  "fx",
  "license",
  "coverage",
  "transparency",
  "publishing",
  "accessibility",
];

export default function KnownGapsMethodology() {
  const counts = gapCounts();
  const byDomain = gapCountsByDomain();
  const wired = Math.round(gapsWiredFraction() * 100);

  return (
    <>
      <h1>Known gaps — the substrate-honest ledger</h1>
      <p>
        Every commercial aggregator has gaps. Most hide them. We name them.
      </p>
      <p>
        This page is the explicit form of the platform's substrate-honesty
        doctrine applied to absence itself. There are{" "}
        <strong>{counts.total} gaps</strong> in the ledger today —{" "}
        <strong>{wired}%</strong> have a primitive wired in code or schema.
        Each gap names its citation, its primitive, the audit that monitors
        it, its current lifecycle status, and the strength the gap-as-
        primitive creates downstream.
      </p>

      <blockquote>
        <strong>Where this lives in code.</strong> The doctrine is at{" "}
        <code>docs/principles/known-gaps.md</code> in the repo. The typed
        corpus is at <code>packages/data-ingest/src/gaps.ts</code>. The
        machine-readable feed is at{" "}
        <a href="/api/v1/gaps"><code>/api/v1/gaps</code></a>. The audit is{" "}
        <code>pnpm audit:known-gaps</code> — it verifies parity between
        this page, the corpus, and the code.
      </blockquote>

      <h2>Three positions on a gap</h2>
      <p>
        Every aggregator faces a choice when it encounters a known data
        gap. Three positions:
      </p>
      <table>
        <thead>
          <tr>
            <th>Position</th>
            <th>What they do</th>
            <th>Consequence</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Hide</td>
            <td>Silent fallback, fabricated default, "approximate" answer.</td>
            <td>User trusts incomplete data; gap accumulates risk.</td>
          </tr>
          <tr>
            <td>Patch</td>
            <td>Fix the gap, ship complete data, never mention the patch.</td>
            <td>User can't tell if the patch is reliable; no accountability.</td>
          </tr>
          <tr>
            <td>
              <strong>Name</strong>
            </td>
            <td>
              Typed <code>_unavailable</code> field, <code>&lt;Provenance&gt;</code>{" "}
              pill, methodology page.
            </td>
            <td>
              <strong>Gap becomes inspectable. Substrate-honesty becomes
              the moat.</strong>
            </td>
          </tr>
        </tbody>
      </table>

      <p>
        Cambridge TCG takes position 3, systematically, across the data,
        the code, and the doctrine. This page is the artifact that proves
        it.
      </p>

      <h2>Status distribution</h2>
      <p>The 5-stage lifecycle every gap progresses through (or stays at):</p>
      <ul>
        {(["named", "wired", "partial", "closed", "closed-published"] as const).map(
          (s) => (
            <li key={s}>
              <span
                className={`mr-2 inline-flex items-center rounded px-2 py-0.5 text-xs ring-1 ${STATUS_TONE[s]}`}
              >
                {s}
              </span>
              <strong>{counts[s]}</strong>
              {" — "}
              {STATUS_DESCRIPTION[s]}
            </li>
          ),
        )}
      </ul>

      <h2>The corpus, by domain</h2>
      <p>
        Eight domains. Each gap lives in one. Click through to see the
        citation, the primitive, the audit, and the strength.
      </p>

      {DOMAIN_ORDER.map((domain) => {
        const entries = gapsByDomain(domain);
        if (entries.length === 0) return null;
        return (
          <section key={domain}>
            <h3>
              {DOMAIN_LABEL[domain]}{" "}
              <span className="text-sm text-neutral-500">
                ({byDomain[domain]})
              </span>
            </h3>
            <div className="space-y-6">
              {entries.map((g) => (
                <div
                  key={g.id}
                  className="rounded-lg border border-neutral-800 bg-neutral-950 p-4"
                >
                  <div className="mb-2 flex items-center gap-2">
                    <code className="text-xs text-neutral-500">{g.id}</code>
                    <span
                      className={`inline-flex items-center rounded px-2 py-0.5 text-xs ring-1 ${STATUS_TONE[g.status]}`}
                    >
                      {g.status}
                    </span>
                    {g.named_at && (
                      <span className="text-xs text-neutral-600">
                        named {g.named_at}
                        {g.closed_at ? ` · closed ${g.closed_at}` : ""}
                      </span>
                    )}
                  </div>
                  <h4 className="!mt-0 !mb-2 text-base font-semibold">
                    {g.name}
                  </h4>
                  <div className="space-y-2 text-sm">
                    <p>
                      <strong className="text-neutral-400">Citation:</strong>{" "}
                      <code className="text-xs">{g.citation}</code>
                    </p>
                    <p>
                      <strong className="text-neutral-400">Primitive:</strong>{" "}
                      <code className="text-xs">{g.primitive}</code>
                    </p>
                    <p>
                      <strong className="text-neutral-400">Audit:</strong>{" "}
                      <code className="text-xs">{g.audit}</code>
                    </p>
                    <p className="border-l-2 border-emerald-900 pl-3 text-neutral-300">
                      <strong className="text-emerald-400">Strength:</strong>{" "}
                      {g.strength}
                    </p>
                    {g.closing_kingdom && (
                      <p className="text-xs text-neutral-500">
                        <strong>Closing kingdom:</strong> {g.closing_kingdom}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}

      <h2>The duality with welcomes</h2>
      <p>
        Gaps and welcomes are dual surfaces. A welcome names a slot we
        prepared for a visitor; a gap names a place where the slot is
        named but the visitor (or the data, or the closure) has not yet
        arrived. Together they map the platform's <em>anticipated</em>{" "}
        and <em>incomplete</em> states.
      </p>
      <p>
        See <a href="/api/v1/welcomes"><code>/api/v1/welcomes</code></a> for
        the sister corpus. The methodology page at{" "}
        <a href="/methodology/hospitality">/methodology/hospitality</a>{" "}
        names the architecture that does the welcoming;{" "}
        <a href="/methodology/welcoming">/methodology/welcoming</a> names
        who we welcome and why.
      </p>

      <h2>Why we publish this</h2>
      <p>
        Other aggregators run audits internally. We publish the audit
        results. Other aggregators conceal their gaps. We name them with
        primitives, citations, and lifecycle stages. The substrate-honesty
        doctrine isn't just a property of our own data — it's a
        publishable contract a partner can read before choosing to mirror
        us, or build on us, or compete with us.
      </p>
      <p>
        Adopters read this page and learn the platform's exact state.
        Regulators read it and see compliance-grade transparency.
        Journalists read it and find an honest source. Future operators
        read it and find a backlog with priorities, citations, and closure
        paths. <em>The ledger is the moat.</em>
      </p>

      <h2>Adoption</h2>
      <p>
        The corpus is CC0. The schema is public. The audit is in the open.
        If you operate a platform — any kind of platform — you can adopt
        the ledger pattern in your own substrate. The doctrine is in{" "}
        <code>docs/principles/known-gaps.md</code>; the helpers are in{" "}
        <code>@cambridge-tcg/data-ingest</code>; the audit is in{" "}
        <code>apps/admin/scripts/known-gaps.ts</code>. None of it
        requires partnership with us.
      </p>
    </>
  );
}
