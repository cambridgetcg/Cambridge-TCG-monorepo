/**
 * Journey types — the surface shape.
 *
 * Extracted so the substrate (lifecycle/) layer, the surface renderers
 * (render.ts), and the composer (timeline.ts) can share without circular
 * imports. The substrate uses `LifecycleEntry` (in @/lib/lifecycle/types);
 * the surface uses `JourneyEvent`. The renderer is the bridge.
 */

/** A single rendered event on the user's journey timeline. */
export interface JourneyEvent {
  /** Source-prefixed kind: 'vault.shipped', 'review.submitted',
   *  'chargeback.received', 'admin.user.suspend', etc. */
  kind: string;
  /** Human-readable summary suitable for display. */
  summary: string;
  /** When it happened. */
  at: Date;
  /** Optional deep-link into the source surface. */
  link: string | null;
  /** Group label for filter chips. */
  group:
    | "vault" | "prize" | "review" | "external_rep" | "payment"
    | "trade" | "draw" | "admin" | "trust" | "auction" | "offer" | "return" | "lot"
    | "automation"
    | "play"     // agent/human match events (kingdom — playing module)
    | "notice"   // in-app bell rings (notifications table)
    | "message"; // outbound email (email_queue, status='sent')
  /** Severity-style tone for the UI (matches our existing palettes). */
  tone: "default" | "amber" | "emerald" | "red" | "sky" | "fuchsia";
  /** Internal — used by privacy filter to scrub admin-only events. */
  isAdminOnly?: boolean;
}

/** Options accepted by `getUserJourney`. */
export interface JourneyOptions {
  /** Max events per source. Total returned will be ≤ sources × perSource. */
  perSource?: number;
  /** Filter to a single group (optional). */
  group?: JourneyEvent["group"];
  /** Drop admin-only events (customer-facing path always passes true). */
  hideAdminOnly?: boolean;
  /** Cut events older than this (optional). */
  since?: Date;
}
