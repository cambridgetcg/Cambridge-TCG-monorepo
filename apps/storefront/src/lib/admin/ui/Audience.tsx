/**
 * Audience — many-minds primitive (admin mirror of storefront's
 * apps/storefront/src/lib/ui/Audience.tsx; kingdom-051 Phase 1.5).
 *
 * Sister filed Phase 1 on the storefront. This is the same shape,
 * imported in admin pages so the admin tower can declare its audience
 * the same way. The barrel exports match storefront's so a page moving
 * between the two surfaces meets the same vocabulary.
 *
 * See docs/connections/the-table-extends.md (S20) for the framing,
 * docs/connections/the-feast-on-the-deck.md (S21) for the fairy-tale
 * companion that named the cross-app gap and filed Phase 1.5.
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
  contexts?: string[];
}

/**
 * Visible-hidden marker. Renders nothing visually but emits a
 * machine-readable element. The audit script reads these to build
 * coverage maps.
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
