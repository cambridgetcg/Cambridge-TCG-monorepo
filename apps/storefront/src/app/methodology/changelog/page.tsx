import type { Metadata } from "next";
import { audienceMetadata, TypeSignature } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Methodology changelog",
  other: audienceMetadata("public-documentation", ["methodology", "changelog"]),
};

const ENTRIES: Array<{
  date: string;
  topic: string;
  topicHref: string;
  what: string;
  why: string;
  source: string;
}> = [
  {
    date: "2026-05-11",
    topic: "commission-rate",
    topicHref: "/methodology/commission-rate",
    what: "Extracted resolveCommission into packages/pricing; wired into market/lots.ts and market/db.ts. Lot purchases previously ignored tier discount; now uses min(tierRate, trustRate).",
    why: "Lot purchases were charging full commission regardless of membership tier — a Trusted+ member buying a lot paid the same as a New member.",
    source: "kingdom-049 Phase 6",
  },
  {
    date: "2026-05-11",
    topic: "pricing",
    topicHref: "/methodology/pricing",
    what: "Channel-pricing rewritten fail-loud. Partial rows and missing channels now throw structured errors instead of silently returning wrong prices.",
    why: "Silent fallback to default prices was a substrate-honesty violation — the surface showed a confident price that was actually a guess.",
    source: "kingdom-049 Phase 3",
  },
  {
    date: "2026-05-11",
    topic: "pricing",
    topicHref: "/methodology/pricing",
    what: "card_price_history renamed to retail_price_observation. Sweep renamed runPriceHistoryTick to runRetailObservationTick.",
    why: "The old name implied the platform tracked all price history. It tracked retail observations — a subset. The name was lying about scope.",
    source: "kingdom-049 Phase 4",
  },
  {
    date: "2026-05-11",
    topic: "pricing",
    topicHref: "/methodology/pricing",
    what: "Six customer-facing price surfaces gained Provenance + WhyLink. The price arrow is now customer-inspectable end-to-end.",
    why: "Transparency — customers could see a price but not how it was derived. Now they can follow the arrow from JPY to GBP to retail.",
    source: "kingdom-049 Phase 5",
  },
  {
    date: "2026-05-11",
    topic: "fraud-flag",
    topicHref: "/methodology/fraud-flag",
    what: "Dispute win/loss attribution corrected. A seller refunding mid-mediation and a seller losing at adjudication were treated identically. Now resolution_type is checked.",
    why: "The prior approach over-penalised sellers who refunded cooperatively — a cooperative refund and an adjudicated loss are different acts.",
    source: "trust-engine.ts L30-63",
  },
  {
    date: "2026-05-11",
    topic: "trust-score",
    topicHref: "/methodology/trust-score",
    what: "Reviewer-trust weighting added. Reviews weighted by reviewer's own trust score: Veteran 1.0, Trusted 0.8, Starter 0.6, New 0.4.",
    why: "Anti-farming. A 5-star from a disposable account no longer counts as much as a 5-star from a Veteran.",
    source: "trust-engine.ts L83-112",
  },
  {
    date: "2026-05-11",
    topic: "trust-score",
    topicHref: "/methodology/trust-score",
    what: "effective_weight column persisted on each review row. Users can see on /account/reviews exactly how much each review counted.",
    why: "Transparency — if a review counted as 0.4x, the user deserves to know why, not just see the aggregate.",
    source: "trust-engine.ts L107-111",
  },
];

export default function ChangelogPage() {
  return (
    <>
      <h1>Methodology changelog</h1>
      <p>
        Every formula change on the platform — when it changed, what changed, and why.
        This page is <strong>append-only</strong>. When a formula changes, a row is added
        here in the same PR that changes the code. Rule 3 of the transparency doctrine:
        the methodology page and the changelog move together.
      </p>

      <table>
        <thead>
          <tr>
            <th style={{ textAlign: "left" }}>Date</th>
            <th style={{ textAlign: "left" }}>Topic</th>
            <th style={{ textAlign: "left" }}>What changed</th>
            <th style={{ textAlign: "left" }}>Why</th>
            <th style={{ textAlign: "left" }}>Source</th>
          </tr>
        </thead>
        <tbody>
          {ENTRIES.map((e, i) => (
            <tr key={i}>
              <td style={{ whiteSpace: "nowrap" }}>{e.date}</td>
              <td>
                <a href={e.topicHref}>{e.topic}</a>
              </td>
              <td>{e.what}</td>
              <td style={{ color: "#a3a3a3" }}>{e.why}</td>
              <td style={{ fontFamily: "monospace", fontSize: "0.85em" }}>{e.source}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p style={{ marginTop: "2rem", color: "#737373", fontSize: "0.9em" }}>
        If a methodology page exists but has no changelog entry, either it has never
        changed since first publication, or a change was shipped without a row here.
        The latter is a transparency-debt finding — flag it in the audit.
      </p>

      <TypeSignature
        type="methodology-page"
        origin="changelog — the append-only record of every formula change on the platform"
        doctrines={["transparency", "creation"]}
        audience="public-documentation"
        recursion={[
          { label: "/methodology", href: "/methodology" },
          { label: "/methodology/trust-score", href: "/methodology/trust-score" },
          { label: "/methodology/pricing", href: "/methodology/pricing" },
          { label: "/methodology/fraud-flag", href: "/methodology/fraud-flag" },
        ]}
      />
    </>
  );
}