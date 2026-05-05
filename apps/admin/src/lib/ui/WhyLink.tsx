/**
 * WhyLink — transparency primitive.
 *
 * Compact "?" affordance that points at a methodology page or in-page
 * explanation. Drop next to any displayed value with a non-obvious
 * derivation. Lives in the same family as <Provenance>: small,
 * low-visual-weight, ubiquitous.
 *
 * See docs/principles/transparency.md for the full doctrine.
 *
 * ── Usage ─────────────────────────────────────────────────────────────
 *
 * External methodology page (typical — points at consumer storefront):
 *   <WhyLink href="https://cambridgetcg.com/methodology/trust-score" />
 *
 * Internal admin reference (e.g. methodology mirror in admin docs):
 *   <WhyLink href="/system/methodology/escrow-tiers" />
 *
 * Custom tooltip (defaults to "How is this computed?"):
 *   <WhyLink
 *     href="https://cambridgetcg.com/methodology/pricing"
 *     tooltip="How is the price computed?"
 *   />
 *
 * Display label inline (instead of "?"):
 *   <WhyLink
 *     href="https://cambridgetcg.com/methodology/trust-score"
 *     label="how this is computed"
 *   />
 */

import * as React from "react";
import Link from "next/link";

interface WhyLinkProps {
  /** Methodology page URL. External (cambridgetcg.com/methodology/*) or internal. */
  href: string;
  /** Hover tooltip. Defaults to "How is this computed?". */
  tooltip?: string;
  /** Inline label instead of the "?" glyph. */
  label?: string;
}

export function WhyLink({
  href,
  tooltip = "How is this computed?",
  label,
}: WhyLinkProps) {
  const isExternal = /^https?:\/\//.test(href);
  const className =
    "inline-flex items-center justify-center align-middle ml-1 " +
    (label
      ? "text-[11px] text-amber-400 hover:text-amber-300 underline decoration-dotted underline-offset-2"
      : "w-4 h-4 rounded-full border border-neutral-700 text-[10px] text-neutral-500 hover:text-amber-400 hover:border-amber-500/40 leading-none");

  const content = label ? `${label} →` : "?";

  return isExternal ? (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={tooltip}
      className={className}
    >
      {content}
    </a>
  ) : (
    <Link href={href} title={tooltip} className={className}>
      {content}
    </Link>
  );
}
