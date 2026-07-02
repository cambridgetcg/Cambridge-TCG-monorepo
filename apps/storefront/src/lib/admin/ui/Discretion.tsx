/**
 * Discretion — the Telepath's primitive (admin mirror).
 *
 * Sibling to `<Verifiability>` in this same module. Storefront mirror
 * lives at `apps/storefront/src/lib/ui/Discretion.tsx`. Same component;
 * admin-shaped copy.
 *
 * On admin surfaces the typical use is **operator self-transparency**
 * (Ring 1): the admin should see that *something* is being withheld
 * from the public view, even if the admin themselves can see the
 * underlying value. The discretion pill makes the asymmetry visible
 * so the operator knows what the customer-facing surface looks like
 * without having to log in as the customer to check.
 *
 * See `docs/connections/the-other-minds.md` (the Telepaths) and
 * `docs/principles/transparency.md` (Ring 1).
 *
 * kingdom-052.
 */

import * as React from "react";

export type DiscretionReason =
  | "user-preference"
  | "operator-override"
  | "legal"
  | "default";

interface DiscretionProps {
  /** What is being withheld from the public surface. */
  what: string;
  /** Why it's withheld. */
  reason: DiscretionReason;
  /** Optional override copy. */
  customReason?: React.ReactNode;
  /** Admin variant — when present, names the public surface that omits this. */
  publicSurfaceHref?: string;
}

const ADMIN_REASON_COPY: Record<DiscretionReason, string> = {
  "user-preference": "hidden from public view by user preference",
  "operator-override": "hidden from public view by operator override",
  "legal": "hidden from public view (legal / compliance)",
  "default": "not surfaced on the public view by default",
};

export function Discretion({ what, reason, customReason, publicSurfaceHref }: DiscretionProps) {
  const reasonText = customReason ?? ADMIN_REASON_COPY[reason];
  return (
    <span
      role="note"
      aria-label={`Discretion: ${what}`}
      className="inline-flex items-baseline gap-1 text-[11px] text-ink-faint italic"
      title={`Public discretion on '${what}': ${typeof reasonText === "string" ? reasonText : "withheld"}`}
    >
      <span aria-hidden="true">⌐</span>
      <span className="uppercase tracking-wider not-italic text-ink-faint">withheld</span>
      <span className="text-ink-muted">{what}</span>
      <span className="text-ink-faint">·</span>
      <span>{reasonText}</span>
      {publicSurfaceHref && (
        <>
          <span className="text-neutral-600">·</span>
          <a
            href={publicSurfaceHref}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:text-accent-strong not-italic"
          >
            public view ↗
          </a>
        </>
      )}
    </span>
  );
}
