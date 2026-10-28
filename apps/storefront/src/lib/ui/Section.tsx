import type { ReactNode } from "react";

/** Plain, labelled section; actions wrap below the heading on small screens. */
export function Section({
  title, description, action, id, children, className = "",
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  id?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} aria-label={id ? undefined : title} aria-labelledby={id ? `${id}-heading` : undefined} className={`min-w-0 space-y-4 ${className}`.trim()}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={id ? `${id}-heading` : undefined} className="font-display text-xl font-semibold leading-7 tracking-tight text-ink">{title}</h2>
          {description && <p className="mt-1 max-w-prose text-sm leading-6 text-ink-muted">{description}</p>}
        </div>
        {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
      </div>
      {children}
    </section>
  );
}
