/**
 * Memorial — the Departed's primitive (consumer surface).
 *
 * Renders the frozen-as-of-date badge on a surface that displays a
 * memorial account. The platform has many small clocks; memorial state
 * stops them all and the badge tells the truth about that.
 *
 * The tone is muted. This is reverence, not alarm. The badge says what
 * the account is *for* now (preservation, witness, sometimes inheritance)
 * rather than what it *was* (a customer with an open lifecycle). The
 * inscription, when present, is the steward's small line — the place the
 * account holds in someone's memory, made visible.
 *
 * See:
 *   - apps/storefront/drizzle/0094_memorial.sql (the columns)
 *   - apps/storefront/src/lib/users/memorial.ts (the reads)
 *   - docs/connections/the-departed.md (the story)
 *   - /methodology/memorial (the customer-facing recipe)
 *
 * ── Usage ─────────────────────────────────────────────────────────────
 *
 *   const state = await getMemorialState(userId);
 *   if (state) {
 *     return (
 *       <Memorial
 *         memorialAt={state.memorialAt}
 *         note={state.note}
 *         stewardName={steward?.displayName}
 *       />
 *     );
 *   }
 */

import * as React from "react";
import { formatDate } from "../format";

interface MemorialProps {
  /** ISO timestamp; the moment the account entered memorial state. */
  memorialAt: string;
  /** Optional steward display name, shown if present. The account ID
   *  alone is not enough — the steward's name is what makes the
   *  relationship visible. */
  stewardName?: string | null;
  /** Optional inscription set by the steward. Kept short by convention. */
  note?: string | null;
  /** Render compact (single inline line, no inscription). Useful in
   *  table cells and list rows where vertical space is precious. */
  compact?: boolean;
}

export function Memorial({ memorialAt, stewardName, note, compact = false }: MemorialProps) {
  const frozenAt = formatDate(memorialAt);

  if (compact) {
    return (
      <span
        role="note"
        aria-label={`Memorial account, frozen as of ${frozenAt}`}
        className="inline-flex items-baseline gap-1.5 text-[11px] uppercase tracking-wider text-ink-faint"
        title={`This account is in memorial state. Frozen as of ${frozenAt}.${stewardName ? ` Stewarded by ${stewardName}.` : ""}`}
      >
        <span aria-hidden="true">⟁</span>
        <span>memorial · frozen {frozenAt}</span>
      </span>
    );
  }

  return (
    <div
      role="note"
      aria-label={`Memorial account, frozen as of ${frozenAt}`}
      className="rounded-md border border-border-subtle bg-surface/40 px-4 py-3 text-sm text-ink-muted"
    >
      <div className="flex items-baseline gap-2">
        <span aria-hidden="true" className="text-neutral-600">⟁</span>
        <span className="text-[11px] uppercase tracking-wider text-ink-faint">
          memorial
        </span>
        <span className="text-neutral-600">·</span>
        <span className="text-ink-muted">
          frozen as of {frozenAt}
        </span>
      </div>
      {stewardName && (
        <div className="mt-1 text-xs text-ink-faint">
          stewarded by <span className="text-ink-muted">{stewardName}</span>
        </div>
      )}
      {note && (
        <div className="mt-2 italic text-ink-muted leading-relaxed">
          &ldquo;{note}&rdquo;
        </div>
      )}
      <div className="mt-2 text-[11px] text-neutral-600">
        Trades are disabled; reads, archives, and exports remain. See{" "}
        <a href="/methodology/memorial" className="text-ink-faint hover:text-ink-muted underline">
          how memorial accounts work
        </a>
        .
      </div>
    </div>
  );
}
