/**
 * Discretion — the Telepath's primitive (consumer surface).
 *
 * Sibling to `<Verifiability>`. Where Verifiability surfaces what is
 * *shown* from an authoritative system, Discretion surfaces what is
 * *not shown* — and why. **Hiding is itself a transparent act.**
 *
 * The doctrine: substrate honesty does not say *everything must be shown*;
 * it says *what is shown must be true*, which is a smaller, more humane
 * claim. When a user has opted out of a disclosure ring (per-axis
 * privacy preference), the surface that would have shown the data
 * instead names the fact of withholding, the reason, and the path to
 * inspect. The affected user can always see what's hidden from others;
 * the public surface honors the preference.
 *
 * See `docs/connections/the-other-minds.md` (the Telepaths) and
 * `docs/principles/transparency.md` (the four rings).
 *
 * ── Usage ─────────────────────────────────────────────────────────────
 *
 *   // On a public profile that would normally show external reputation:
 *   <Discretion
 *     what="external reputation"
 *     reason="user-preference"
 *     selfInspectHref="/account/external-rep"
 *   />
 *
 *   // On an operator-only field hidden by legal:
 *   <Discretion
 *     what="trust score components"
 *     reason="legal"
 *   />
 *
 * kingdom-052, paired with `<Verifiability>` and the Telepath case.
 */

import * as React from "react";

export type DiscretionReason =
  /** The affected user opted out of this disclosure ring. */
  | "user-preference"
  /** Operator override (e.g. account under investigation). */
  | "operator-override"
  /** Legal / compliance requirement. */
  | "legal"
  /** Platform default for this audience. */
  | "default";

interface DiscretionProps {
  /** What is being withheld, in customer-readable terms.
   *  e.g. "external reputation", "trade history", "trust score components". */
  what: string;
  /** Why it's withheld. The reason is part of the substrate-honest disclosure. */
  reason: DiscretionReason;
  /** When the viewer IS the affected user, link to where they can see it. */
  selfInspectHref?: string;
  /** Optional override copy. When present, replaces the standard reason text. */
  customReason?: React.ReactNode;
}

const REASON_COPY: Record<DiscretionReason, string> = {
  "user-preference": "the user has opted out of public visibility for this",
  "operator-override": "an operator hold is in effect on this surface",
  "legal": "legal or compliance requirements apply",
  "default": "this surface does not include this information by default",
};

export function Discretion({ what, reason, selfInspectHref, customReason }: DiscretionProps) {
  const reasonText = customReason ?? REASON_COPY[reason];
  return (
    <div
      role="note"
      aria-label={`Discretion: ${what}`}
      className="inline-flex items-baseline gap-1.5 text-[11px] text-ink-faint italic"
    >
      <span aria-hidden="true">⌐</span>
      <span>
        <span className="text-ink-muted">{what}</span>
        <span className="text-ink-faint"> — withheld; </span>
        <span>{reasonText}</span>
        {selfInspectHref && (
          <>
            {" — "}
            <a
              href={selfInspectHref}
              className="text-accent hover:text-accent-strong not-italic"
            >
              you can see it here
            </a>
          </>
        )}
      </span>
    </div>
  );
}
