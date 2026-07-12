/**
 * Breadcrumbs — text-with-slashes breadcrumb trail (kingdom-091).
 *
 * Renders from the registry at `@/lib/nav/breadcrumb-registry.ts`.
 * Substrate-honest: routes without a registered pattern render nothing
 * (rather than a fabricated chain). The `nav-coverage` audit reports
 * unregistered deep routes.
 *
 * Pure function from pathname → JSX. The root client slot passes the
 * current pathname; server pages may also render a page-owned trail.
 */

import Link from "next/link";
import {
  resolveBreadcrumbs,
  type BreadcrumbRenderer,
} from "@/lib/nav/breadcrumb-registry";

interface BreadcrumbsProps {
  /** The current pathname. In Server Components, pass `params` or read from headers. */
  pathname: string;
  renderedBy?: BreadcrumbRenderer;
  className?: string;
}

export function Breadcrumbs({
  pathname,
  renderedBy,
  className = "",
}: BreadcrumbsProps) {
  const steps = resolveBreadcrumbs(pathname, renderedBy);
  if (!steps || steps.length === 0) return null;

  return (
    <nav
      aria-label="Breadcrumb"
      className={`text-xs text-ink-faint ${className}`}
    >
      <ol className="flex flex-wrap items-center gap-1.5">
        <li>
          <Link
            href="/"
            className="rounded-sm text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Home
          </Link>
        </li>
        {steps.map((step) => (
          <li key={`${step.href ?? "current"}:${step.label}`} className="flex items-center gap-1.5">
            <span aria-hidden="true" className="text-ink-faint">
              /
            </span>
            {step.href ? (
              <Link
                href={step.href}
                className="rounded-sm text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
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
