/**
 * PageHeader — every admin page starts with one.
 *
 * Layout: title + description on the left, optional action (button or link)
 * on the right. The Manager archetype uses no `action`; the Dashboard
 * archetype usually has an "Open Admin ↗" pointing at the legacy admin.
 */

import * as React from "react";

interface PageHeaderProps {
  title: string;
  /** One-line subtitle. Use for status summary ("3 queues need attention"). */
  description?: React.ReactNode;
  /** Right-side slot — typically <ExternalLink> or a button group. */
  action?: React.ReactNode;
}

export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold text-white">{title}</h1>
        {description && (
          <p className="text-sm text-neutral-400 mt-1">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0 flex items-center gap-2">{action}</div>}
    </div>
  );
}
