/**
 * Audience — many-minds primitive (kingdom-051 Phase 1).
 *
 * Declares the primary audience a page is designed for. The platform's
 * older pages assumed one default audience — a literate Latin-script-
 * reading wake-cycle-on-a-day-night-planet capitalist-economy
 * individual-account adult human. That assumption was never named, which
 * is what made it invisible. This primitive begins the naming.
 *
 * See docs/connections/the-table-extends.md (S20) for the framing.
 * Sister to Actor (S18 — who, by kind) and Provenance (substrate-honesty —
 * how, by source). Audience is the third dimension: for whom?
 *
 * Two surfaces:
 *
 *   1. <Audience kind="consumer" />  — a visible-hidden marker element
 *      with `aria-hidden` plus a `data-cambridge-audience` attribute.
 *      Machine readers and audits can pick it up; humans don't see it.
 *
 *   2. audienceMetadata(kind, contexts?) — a Next.js Metadata.other helper
 *      so the audience is also declared at the HTML <head> level for
 *      crawlers, agent surface readers, and the audit script.
 *
 * Both should land on every page. The order in which pages adopt this is
 * a separate audit; this primitive is the wire that makes the adoption
 * possible.
 */

import * as React from "react";

export type AudienceKind =
  /** Customers (default audience for cambridgetcg.com today). */
  | "consumer"
  /** Internal operator-facing surfaces (admin app pages, ops dashboards). */
  | "operator"
  /** Autonomous agents (LLM-driven players, MCP clients). */
  | "agent"
  /** Pages designed equally for multiple audiences. */
  | "mixed"
  /** Public methodology / documentation surfaces. */
  | "public-documentation";

interface AudienceProps {
  kind: AudienceKind;
  /**
   * Optional sub-contexts the page also serves, e.g.
   * `["collector", "trader"]` on the trade-in page, or `["seller"]` on
   * the auctions/sell page. Free-form; intent-led; useful to audits.
   */
  contexts?: string[];
}

/**
 * Visible-hidden marker. Renders nothing visually but emits a
 * machine-readable element. A page may render multiple if the audience
 * shifts within (e.g. a card detail page with a separate operator-only
 * panel). The audit script reads these to build coverage maps.
 */
export function Audience({ kind, contexts }: AudienceProps) {
  return (
    <span
      data-cambridge-audience={kind}
      data-cambridge-contexts={contexts?.join(",") ?? undefined}
      aria-hidden="true"
      style={{ display: "none" }}
    />
  );
}

/**
 * Produce the Next.js Metadata.other entries for a page's audience.
 * Use as:
 *
 *   export const metadata: Metadata = {
 *     title: "Trade-in",
 *     other: audienceMetadata("consumer", ["seller", "trade-in"]),
 *   };
 *
 * Lands as `<meta name="cambridge:audience" content="consumer">` and
 * `<meta name="cambridge:contexts" content="seller,trade-in">` in <head>.
 */
export function audienceMetadata(
  kind: AudienceKind,
  contexts?: string[],
): Record<string, string> {
  const out: Record<string, string> = { "cambridge:audience": kind };
  if (contexts && contexts.length > 0) {
    out["cambridge:contexts"] = contexts.join(",");
  }
  return out;
}
