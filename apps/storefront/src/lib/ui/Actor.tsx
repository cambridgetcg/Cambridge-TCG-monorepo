/**
 * Actor — substrate-honesty sibling to <Provenance>.
 *
 * Where <Provenance> answers *how* a value became true (live / synced /
 * snapshot / cached / computed), <Actor> answers *who* made it true.
 * The two pills compose on any surface where both questions matter —
 * e.g. a move in a match log carries both "the state was computed by the
 * reducer" (provenance) and "the action was taken by agent:foo" (actor).
 *
 * See docs/connections/the-agent-surface.md for the doctrine.
 *
 * ── Usage ─────────────────────────────────────────────────────────────
 *
 *   <Actor kind="human" label="alice" />
 *   <Actor kind="system" label="streak-sweep" />
 *   <Actor kind="rule-ai" label="pve-lvl-3" />
 *   <Actor kind="agent" handle="claude-veridian-1" modelTag="claude-opus-4-7" />
 *
 * ── Tone rules ────────────────────────────────────────────────────────
 *
 * human   — neutral (the default kind on every existing surface).
 * system  — neutral (a cron / scheduler / lifecycle-log writer).
 * rule-ai — sky    (the in-process AI opponents; not external agents).
 * agent   — purple (distinct color so external agents are immediately
 *                   visually distinguishable from human moves on match
 *                   logs and leaderboards).
 *
 * Callers don't override tone — the kind picks it. This is the same
 * discipline <Provenance> uses.
 */

import * as React from "react";

export type ActorKind = "human" | "system" | "rule-ai" | "agent";

interface ActorProps {
  kind: ActorKind;
  /** Free-form display label. For agents prefer `handle` over `label`. */
  label?: string | null;
  /** Agent public_handle (when kind === "agent"). */
  handle?: string | null;
  /** Agent's claimed model_tag (when kind === "agent"). Surfaces in tooltip. */
  modelTag?: string | null;
}

export function Actor({ kind, label, handle, modelTag }: ActorProps) {
  let display: string;
  let title: string;
  let tone: "neutral" | "sky" | "purple";

  switch (kind) {
    case "human":
      display = label ?? "human";
      title = "Acted by a signed-in human";
      tone = "neutral";
      break;
    case "system":
      display = label ? `system · ${label}` : "system";
      title = `System-driven action${label ? ` (${label})` : ""}`;
      tone = "neutral";
      break;
    case "rule-ai":
      display = label ? `rule-ai · ${label}` : "rule-ai";
      title = "In-process rule-based AI (the PVE opponents at apps/storefront/src/lib/game/ai.ts)";
      tone = "sky";
      break;
    case "agent": {
      const h = handle ?? label ?? "unnamed";
      display = `agent:${h}`;
      title = modelTag
        ? `External agent acting via the MCP gate; operator's claimed model: ${modelTag}`
        : "External agent acting via the MCP gate";
      tone = "purple";
      break;
    }
  }

  // Muted per the quiet gallery; teal/plum literals match Badge's
  // TONE_CLS sky/purple so an agent reads the same across surfaces.
  const TONE_CLS: Record<typeof tone, string> = {
    neutral: "text-ink-faint",
    sky: "text-[#3e7d8f]",
    purple: "text-[#6a5a8f]",
  };

  return (
    <span
      className={`inline-block text-[10px] uppercase tracking-wider ${TONE_CLS[tone]}`}
      title={title}
    >
      {display}
    </span>
  );
}
