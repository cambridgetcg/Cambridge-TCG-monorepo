/**
 * Consequences — transparency Ring 2 extended forward in time (consumer).
 *
 * Mirror of the admin primitive. Pre-action consequence pill: tells the
 * customer what *will* happen if they click the irreversible action —
 * trust delta, commission applied, tier movement, loyalty earned, cancel
 * cost. The Heptapod's primitive (see docs/connections/the-other-minds.md).
 *
 * Use on any storefront mutation surface where the customer would benefit
 * from informed consent: accept-counter-offer, finalize-sale, end-vacation,
 * cancel-subscription, claim-prize. Empty `items` renders nothing.
 *
 * ── Usage ─────────────────────────────────────────────────────────────
 *
 *   <Consequences
 *     items={[
 *       { label: "Trust score", delta: "+0.4", tone: "emerald",
 *         methodology: "/methodology/trust-score" },
 *       { label: "Commission", delta: "7% → 5%", tone: "amber",
 *         methodology: "/methodology/commission-rate" },
 *     ]}
 *   />
 *
 * kingdom-051, paired with docs/connections/the-other-minds.md.
 */

import * as React from "react";
import { WhyLink } from "./WhyLink";

export type ConsequenceTone = "neutral" | "amber" | "red" | "emerald" | "sky";

export interface Consequence {
  /** What changes. */
  label: string;
  /** The change. Direction must be in the text (never color-only). */
  delta: React.ReactNode;
  /** Optional tone for the delta — paired with text, never the only signal. */
  tone?: ConsequenceTone;
  /** Methodology page that explains the formula. Linked via <WhyLink>. */
  methodology?: string;
  /** Optional sub-line — when the delta needs context. */
  detail?: React.ReactNode;
}

interface ConsequencesProps {
  /** Heading. Defaults to "What this will do". Pass null to omit. */
  title?: React.ReactNode | null;
  items: Consequence[];
  /** Visual density. */
  variant?: "compact" | "expanded";
}

const TONE_CLS: Record<ConsequenceTone, string> = {
  neutral: "text-ink-muted",
  amber: "text-accent-strong",
  red: "text-danger",
  emerald: "text-ok",
  sky: "text-info",
};

export function Consequences({
  title = "What this will do",
  items,
  variant = "compact",
}: ConsequencesProps) {
  if (items.length === 0) return null;

  return (
    <div
      role="region"
      aria-label={typeof title === "string" ? title : "Consequences"}
      className="rounded-lg border border-border-subtle bg-surface/60 p-3"
    >
      {title !== null && (
        <div className="text-[10px] uppercase tracking-wider text-ink-faint mb-2">
          {title}
        </div>
      )}
      <ul className="space-y-1.5 text-sm">
        {items.map((c, i) => (
          <li key={i} className="flex items-baseline gap-2 flex-wrap">
            <span className="text-ink-muted">{c.label}:</span>
            <span className={(c.tone ? TONE_CLS[c.tone] : TONE_CLS.neutral) + " font-medium"}>
              {c.delta}
            </span>
            {c.methodology && <WhyLink href={c.methodology} />}
            {c.detail && variant === "expanded" && (
              <span className="block w-full text-xs text-ink-faint ml-2">
                {c.detail}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
