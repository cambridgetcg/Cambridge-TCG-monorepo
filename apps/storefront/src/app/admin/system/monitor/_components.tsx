/**
 * Monitor page pieces: a panel that states its source and what it covers,
 * and the "unknown" block a panel shows instead of a zero. Server
 * components only; nothing here runs in the browser.
 */

import * as React from "react";
import { EmptyState, Provenance, SectionHeading, StatusBadge, type Tone } from "@/lib/admin/ui";
import { fmtDateTime, fmtRelative } from "@/lib/format";

export function Panel({
  id,
  title,
  source,
  covers,
  children,
}: {
  id: string;
  title: string;
  /** The tables or settings the panel reads. */
  source: React.ReactNode;
  /** What the panel can and cannot see. */
  covers: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="space-y-4 scroll-mt-24">
      <SectionHeading trailing={<Provenance kind="live" />}>
        <span id={`${id}-title`}>{title}</span>
      </SectionHeading>
      <dl className="grid gap-1 text-xs text-neutral-400 sm:grid-cols-[6rem_1fr]">
        <dt className="text-neutral-500 uppercase tracking-wide">Source</dt>
        <dd>{source}</dd>
        <dt className="text-neutral-500 uppercase tracking-wide">Covers</dt>
        <dd>{covers}</dd>
      </dl>
      {children}
    </section>
  );
}

/** A read that could not be made: unknown, with the reason, never zero. */
export function Unknown({ reason }: { reason: string }) {
  return <EmptyState tone="warning" title="Unknown" description={reason} />;
}

export function Flag({ name, on }: { name: string; on: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs">
      <code className="text-neutral-300">{name}</code>
      <StatusBadge status={on ? "on" : "off"} palette={{ on: "emerald", off: "neutral" }} />
    </span>
  );
}

/** A setting that is not an on/off flag: its name and a word for its state. */
export function SettingState({ name, state, tone }: { name: string; state: string; tone: Tone }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs">
      <code className="text-neutral-300">{name}</code>
      <StatusBadge status={state} palette={{ [state]: tone }} label={state} />
    </span>
  );
}

const OUTCOME_TONE: Record<string, Tone> = { ran: "emerald", "already-derived": "blue", disabled: "neutral", unknown: "amber" };
export function Outcome({ outcome }: { outcome: string }) {
  const tone = OUTCOME_TONE[outcome] ?? (outcome.startsWith("refused:") ? "amber" : outcome.startsWith("unavailable:") ? "red" : "neutral");
  return <StatusBadge status={outcome} palette={{ [outcome]: tone }} label={outcome} />;
}

export function When({ at }: { at: string | null }) {
  if (!at) return <span className="text-neutral-600">never</span>;
  return <span title={fmtDateTime(at)}>{fmtRelative(at)}</span>;
}

export const n = (value: number) => value.toLocaleString("en-GB");
export const pct = (part: number, whole: number) => (whole > 0 ? `${((100 * part) / whole).toFixed(1)}%` : "—");

/** A flat object of counts as "key value" pairs, for small cells. */
export function Pairs({ value }: { value: Record<string, unknown> | undefined }) {
  const entries = Object.entries(value ?? {});
  if (!entries.length) return <span className="text-neutral-600">—</span>;
  return (
    <span className="font-mono text-xs text-neutral-300">
      {entries.map(([key, inner]) => `${key} ${typeof inner === "object" && inner !== null ? JSON.stringify(inner) : String(inner)}`).join(" · ")}
    </span>
  );
}
