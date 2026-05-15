/**
 * Provenance — substrate-honesty primitive.
 *
 * Every value displayed on this platform should carry, explicitly or
 * implicitly, a claim about how it came to be true. This component is the
 * default surface for that claim. It renders compact, low-visual-weight
 * provenance metadata next to any value: how fresh it is, where it came
 * from, what cadence produced it.
 *
 * See docs/principles/substrate-honesty.md for the full doctrine.
 *
 * ── Usage ─────────────────────────────────────────────────────────────
 *
 * Live (queried this request — quietly explicit):
 *   <Provenance kind="live" />
 *
 * Synced from a cross-system source:
 *   <Provenance kind="synced" at={lastSyncedAt} source="CardRush" />
 *
 * Snapshot from a cron:
 *   <Provenance kind="snapshot" at={snapshotAt} cadence="daily" />
 *
 * Cached (stale-while-revalidate or memoised):
 *   <Provenance kind="cached" at={cachedAt} ttl="5m" />
 *
 * Computed (derived field with its own compute time):
 *   <Provenance kind="computed" at={recomputedAt} by="trust-recompute sweep" />
 *
 * Schedule-only (no observed-fired data — used by cron pages):
 *   <Provenance kind="scheduled" />
 *
 * Unavailable (the source is currently unreachable):
 *   <Provenance kind="unavailable" />
 *
 * ── Tone rules ────────────────────────────────────────────────────────
 *
 * "live" / "synced" (recent) — neutral, low-key.
 * "cached" / "computed" / "snapshot" — neutral with timestamp emphasis.
 * "synced" (>threshold) / "scheduled" — amber, draws the eye.
 * "unavailable" — red.
 *
 * The component picks the tone; callers don't override.
 */

import * as React from "react";
import { fmtRelative } from "../format";

export type ProvenanceKind =
  | "live"
  | "synced"
  | "snapshot"
  | "cached"
  | "computed"
  | "scheduled"
  | "unavailable";

interface ProvenanceProps {
  kind: ProvenanceKind;
  /** When the value was last true. Required for kinds with a meaningful timestamp. */
  at?: string | Date | null;
  /** Cross-system source name (Stripe / SES / CardRush / Shopify / wholesale API). */
  source?: string;
  /** Human cadence label (daily / hourly / every 5m). */
  cadence?: string;
  /** Cache TTL label (5m / 1h). */
  ttl?: string;
  /** Cron / process / pipeline that produced this value. */
  by?: string;
  /** Above this age (ms), "synced" / "snapshot" promote to amber. Default 24h. */
  staleAfterMs?: number;
}

const DEFAULT_STALE_MS = 24 * 60 * 60 * 1000;

function ageMs(at: string | Date | null | undefined): number | null {
  if (!at) return null;
  const d = typeof at === "string" ? new Date(at) : at;
  if (Number.isNaN(d.getTime())) return null;
  return Date.now() - d.getTime();
}

export function Provenance({
  kind,
  at,
  source,
  cadence,
  ttl,
  by,
  staleAfterMs = DEFAULT_STALE_MS,
}: ProvenanceProps) {
  const age = ageMs(at);
  const stale = age != null && age > staleAfterMs;
  const ageLabel = at ? fmtRelative(at) : null;

  // Compose the descriptor text per kind.
  let label: React.ReactNode;
  let tone: "neutral" | "amber" | "red" = "neutral";
  let title: string;

  switch (kind) {
    case "live":
      label = "live";
      title = "Queried this request (no caching layer)";
      break;
    case "synced":
      label = (
        <>
          synced{source ? ` from ${source}` : ""}
          {ageLabel ? ` · ${ageLabel}` : ""}
        </>
      );
      tone = stale ? "amber" : "neutral";
      title = stale
        ? `Last sync was ${ageLabel}; older than the freshness threshold`
        : `Last sync ${ageLabel ?? "(unknown)"}`;
      break;
    case "snapshot":
      label = (
        <>
          snapshot{ageLabel ? ` · ${ageLabel}` : ""}
          {cadence ? ` · ${cadence}` : ""}
        </>
      );
      tone = stale ? "amber" : "neutral";
      title = `Snapshot computed ${ageLabel ?? "(unknown)"}${cadence ? ` (cadence: ${cadence})` : ""}`;
      break;
    case "cached":
      label = (
        <>
          cached{ageLabel ? ` · ${ageLabel}` : ""}
          {ttl ? ` · ttl ${ttl}` : ""}
        </>
      );
      title = `Cached value, last refreshed ${ageLabel ?? "(unknown)"}${ttl ? `, ttl ${ttl}` : ""}`;
      break;
    case "computed":
      label = (
        <>
          computed{ageLabel ? ` · ${ageLabel}` : ""}
          {by ? ` · ${by}` : ""}
        </>
      );
      tone = stale ? "amber" : "neutral";
      title = `Computed ${ageLabel ?? "(unknown)"}${by ? ` by ${by}` : ""}`;
      break;
    case "scheduled":
      label = "scheduled (no run history)";
      tone = "amber";
      title = "Schedule declared, but no observed run-history data is available";
      break;
    case "unavailable":
      label = "source unavailable";
      tone = "red";
      title = "The source for this value is currently unreachable";
      break;
  }

  const TONE_CLS: Record<typeof tone, string> = {
    neutral: "text-neutral-500",
    amber: "text-amber-400",
    red: "text-red-400",
  };

  return (
    <span
      className={`inline-block text-[10px] uppercase tracking-wider ${TONE_CLS[tone]}`}
      title={title}
    >
      {label}
    </span>
  );
}
