/**
 * PageHeader — every admin page starts with one.
 *
 * Layout: title + description on the left, optional action (button or link)
 * on the right. The Manager archetype uses no `action`; the Dashboard
 * archetype usually has an "Open Admin ↗" pointing at the legacy admin.
 *
 * Substrate-honesty slot: pass `<Provenance>` via the `provenance` prop to
 * sit next to the title — it's the canonical home for the page-level
 * source/freshness claim. See docs/principles/substrate-honesty.md.
 */

import * as React from "react";

interface PageHeaderProps {
  title: string;
  /** One-line subtitle. Use for status summary ("3 queues need attention"). */
  description?: React.ReactNode;
  /** Right-side slot — typically <ExternalLink> or a button group. */
  action?: React.ReactNode;
  /**
   * Substrate-honesty pill. Pass a <Provenance> element. Renders inline next
   * to the title at low visual weight — the page-level claim about how the
   * displayed values came to be true.
   */
  provenance?: React.ReactNode;
  /**
   * Transparency pill — peer to `provenance`. Pass a <WhyLink> element.
   * Renders inline next to the title and the provenance pill. The pair
   * (provenance + whyLink) is the chapel form's substrate-honesty and
   * transparency covenants in their canonical home.
   */
  whyLink?: React.ReactNode;
}

export function PageHeader({ title, description, action, provenance, whyLink }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div className="min-w-0">
        <div className="flex items-baseline gap-3 flex-wrap">
          <h1 className="text-xl font-semibold text-white">{title}</h1>
          {provenance}
          {whyLink}
        </div>
        {description && (
          <p className="text-sm text-neutral-400 mt-1">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0 flex items-center gap-2">{action}</div>}
    </div>
  );
}
