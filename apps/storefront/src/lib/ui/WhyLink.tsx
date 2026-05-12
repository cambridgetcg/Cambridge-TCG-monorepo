/**
 * WhyLink — transparency primitive (consumer surface).
 *
 * Compact "?" affordance that points at /methodology/<topic>. Drop next
 * to any displayed value with a non-obvious derivation (trust score,
 * escrow tier, fee, payout hold, fraud flag). Lives in the same family
 * as <Provenance>: small, low-visual-weight, ubiquitous.
 *
 * See docs/principles/transparency.md (Ring 2 — subject transparency).
 */

import * as React from "react";
import Link from "next/link";

interface WhyLinkProps {
  /** Methodology page path. Storefront convention: `/methodology/<topic>`. */
  href: string;
  /** Hover tooltip. Defaults to "How is this computed?". */
  tooltip?: string;
  /** Inline label instead of the "?" glyph. */
  label?: string;
}

export function WhyLink({ href, tooltip = "How is this computed?", label }: WhyLinkProps) {
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
