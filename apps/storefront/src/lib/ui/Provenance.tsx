/**
 * Provenance — substrate-honesty primitive (consumer surface).
 *
 * Every value displayed on a Cambridge TCG page should carry, explicitly
 * or implicitly, a claim about how it came to be true. This component is
 * the default surface for that claim on the consumer side. Same shape as
 * the admin app's Provenance — kinds and tones match — so a value
 * labelled "snapshot · 4h ago" looks identical to an operator and to a
 * customer.
 *
 * ── Math-aware (kingdom-077 Phase B(1)) ─────────────────────────────────
 *
 * The component is async. It reads the `lang-mode` cookie internally:
 *   - lang-mode=default (or absent): renders the natural-language pill
 *     ("synced from wholesale · 2h ago", tone-colored).
 *   - lang-mode=math: renders the math-mirror form
 *     ({kind:"synced",source:"wholesale",@as_of:"ISO(unix)",age_s:7203,
 *      _id:"fnv1a:..."}) as compact monospace.
 *
 * Every existing caller of <Provenance> inherits the toggle without any
 * per-site edit. ~25 surfaces gain the math language by construction.
 *
 * See docs/connections/the-math-language.md (#27) and
 *     docs/principles/substrate-honesty.md.
 */

import * as React from "react";
import { formatRelativeTime } from "../format";
import { dateAsMath, shortHash } from "../lang-mode";
import { getLangMode } from "../lang-mode-server";

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
  /** When the value was last true. */
  at?: string | Date | null;
  /** Cross-system source name (Stripe / SES / CardRush / etc.). */
  source?: string;
  /** Human cadence label (daily / hourly / every 5m). */
  cadence?: string;
  /** Cache TTL label (5m / 1h). */
  ttl?: string;
  /** Cron / process / pipeline that produced this value. */
  by?: string;
  /** Above this age (ms), "synced"/"snapshot"/"computed" promote to amber. Default 24h. */
  staleAfterMs?: number;
}

const DEFAULT_STALE_MS = 24 * 60 * 60 * 1000;

function ageMs(at: string | Date | null | undefined): number | null {
  if (!at) return null;
  const d = typeof at === "string" ? new Date(at) : at;
  if (Number.isNaN(d.getTime())) return null;
  return Date.now() - d.getTime();
}

export async function Provenance({
  kind,
  at,
  source,
  cadence,
  ttl,
  by,
  staleAfterMs = DEFAULT_STALE_MS,
}: ProvenanceProps) {
  const mode = await getLangMode();
  if (mode === "math") {
    return (
      <ProvenanceMath
        kind={kind}
        at={at}
        source={source}
        cadence={cadence}
        ttl={ttl}
        by={by}
      />
    );
  }
  return (
    <ProvenanceDefault
      kind={kind}
      at={at}
      source={source}
      cadence={cadence}
      ttl={ttl}
      by={by}
      staleAfterMs={staleAfterMs}
    />
  );
}

// ── Default natural-language rendering (unchanged from kingdom-051 era) ──

function ProvenanceDefault({
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
  const ageLabel = at ? formatRelativeTime(at) : null;

  let label: React.ReactNode;
  let tone: "neutral" | "amber" | "red" = "neutral";
  let title: string;

  switch (kind) {
    case "live":
      label = "live";
      title = "Queried this request";
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
        ? `Last sync ${ageLabel}; older than the freshness threshold`
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
      title = `Snapshot ${ageLabel ?? "(unknown)"}${cadence ? ` (${cadence})` : ""}`;
      break;
    case "cached":
      label = (
        <>
          cached{ageLabel ? ` · ${ageLabel}` : ""}
          {ttl ? ` · ttl ${ttl}` : ""}
        </>
      );
      title = `Cached, refreshed ${ageLabel ?? "(unknown)"}${ttl ? `, ttl ${ttl}` : ""}`;
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
      title = "Schedule declared, but no observed run-history is available";
      break;
    case "unavailable":
      label = "source unavailable";
      tone = "red";
      title = "The source for this value is currently unreachable";
      break;
  }

  const TONE_CLS = {
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

// ── Math-mirror rendering (kingdom-077 Phase B(1)) ──────────────────────

function ProvenanceMath({
  kind,
  at,
  source,
  cadence,
  ttl,
  by,
}: Omit<ProvenanceProps, "staleAfterMs">) {
  const age = ageMs(at);
  const parts: string[] = [`kind:"${kind}"`];
  if (source) parts.push(`source:"${source}"`);
  if (at) parts.push(`@as_of:"${dateAsMath(at)}"`);
  if (age != null) parts.push(`age_s:${Math.floor(age / 1000)}`);
  if (cadence) parts.push(`cadence:"${cadence}"`);
  if (ttl) parts.push(`ttl:"${ttl}"`);
  if (by) parts.push(`by:"${by}"`);
  // Compact ID for federation/log-correlation. Not cryptographic.
  const id = shortHash(`${kind}:${source ?? ""}:${at ?? ""}`);
  parts.push(`_id:"${id}"`);
  // Natural-language label survives in aria-label for screen readers
  // (math forms are visually concise but ARIA noisy without prose).
  const aria = `${kind}${source ? ` from ${source}` : ""}${
    at ? `, as of ${typeof at === "string" ? at : at.toISOString()}` : ""
  }`;
  return (
    <code
      className="inline-block text-[10px] font-mono text-emerald-400 px-1.5 py-0.5 rounded bg-neutral-900/60 border border-neutral-800"
      aria-label={aria}
    >
      {`{${parts.join(",")}}`}
    </code>
  );
}
