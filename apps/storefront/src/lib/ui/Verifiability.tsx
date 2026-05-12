/**
 * Verifiability — Ring 4 transparency primitive (consumer surface).
 *
 * When a value mirrors data from a foreign authoritative system (Stripe,
 * SES, CardRush, Shopify, eBay, the wholesale API), this component
 * carries that system's identifier onto the page so the viewer can
 * verify against the authoritative source. Our row is reconciled;
 * theirs is authoritative; the asymmetry is UI-visible.
 *
 * On the consumer side, the typical use is `cite` mode — render a
 * copy-friendly id the customer can quote when contacting support.
 *
 * See docs/principles/transparency.md "Ring 4 — Cross-system transparency".
 */

import * as React from "react";

interface VerifiabilityProps {
  /** The authoritative system's name. e.g. "Stripe" / "SES" / "CardRush". */
  source: string;
  /** The foreign identifier. */
  id: string;
  /** Deep link to the foreign system's record, when available. */
  href?: string;
  /** Customer-facing variant: full id, no link, copy-friendly. */
  cite?: boolean;
}

export function Verifiability({ source, id, href, cite }: VerifiabilityProps) {
  if (cite) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-neutral-400">
        <span className="uppercase tracking-wider">{source}</span>
        <code className="font-mono select-all text-neutral-300">{id}</code>
      </span>
    );
  }

  const truncated = id.length > 14 ? `${id.slice(0, 12)}…` : id;
  const inner = (
    <>
      <span className="text-neutral-500 uppercase tracking-wider">{source}</span>
      <code className="ml-1 font-mono text-neutral-400" title={id}>
        {truncated}
      </code>
      {href && <span className="ml-0.5 text-neutral-500">↗</span>}
    </>
  );

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center text-[10px] hover:text-amber-400"
        title={`Authoritative source: ${source} · ${id}`}
      >
        {inner}
      </a>
    );
  }

  return (
    <span
      className="inline-flex items-center text-[10px]"
      title={`Authoritative source: ${source} · ${id}`}
    >
      {inner}
    </span>
  );
}
