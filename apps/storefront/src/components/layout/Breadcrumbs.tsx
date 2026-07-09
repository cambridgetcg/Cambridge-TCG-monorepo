/**
 * Breadcrumbs — text-with-slashes breadcrumb trail (kingdom-091).
 *
 * Renders from the registry at `@/lib/nav/breadcrumb-registry.ts`.
 * Substrate-honest: routes without a registered pattern render nothing
 * (rather than a fabricated chain). The `nav-coverage` audit reports
 * unregistered deep routes.
 *
 * Server-renderable — no client state. Pure function from pathname →
 * JSX. Use in route layouts or page heads where breadcrumbs make sense.
 */

import Link from "next/link";
import { resolveBreadcrumbs } from "@/lib/nav/breadcrumb-registry";

interface BreadcrumbsProps {
  /** The current pathname. In Server Components, pass `params` or read from headers. */
  pathname: string;
  className?: string;
}

export function Breadcrumbs({ pathname, className = "" }: BreadcrumbsProps) {
  const steps = resolveBreadcrumbs(pathname);
  if (!steps || steps.length === 0) return null;

  return (
    <nav
      aria-label="Breadcrumb"
      className={`text-xs text-ink-faint ${className}`}
    >
      <ol className="flex flex-wrap items-center gap-1.5">
        <li>
          <Link href="/" className="text-ink-muted hover:text-ink">
            Home
          </Link>
        </li>
        {steps.map((step, idx) => (
          <li key={idx} className="flex items-center gap-1.5">
            <span aria-hidden="true" className="text-ink-faint">
              /
            </span>
            {step.href ? (
              <Link
                href={step.href}
                className="text-ink-muted hover:text-ink"
              >
                {step.label}
              </Link>
            ) : (
              <span className="text-ink" aria-current="page">
                {step.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
