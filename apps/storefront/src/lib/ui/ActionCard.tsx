import Link from "next/link";
import type { ReactNode } from "react";

/** A destination with its purpose and access context, usable without JavaScript. */
export function ActionCard({
  href, title, description, context,
}: {
  href: string;
  title: string;
  description: string;
  context?: ReactNode;
}) {
  return (
    <Link href={href} className="group flex h-full flex-col rounded-lg border border-border-subtle bg-surface p-5 text-ink transition-colors hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold leading-6 group-hover:text-accent">{title}</h3>
        <span aria-hidden="true" className="text-ink-muted">→</span>
      </div>
      <p className="mt-2 text-sm leading-6 text-ink-muted">{description}</p>
      {context && <div className="mt-auto pt-4 text-sm text-ink-muted">{context}</div>}
    </Link>
  );
}
