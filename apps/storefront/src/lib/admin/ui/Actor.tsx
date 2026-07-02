/**
 * Actor — substrate-honesty sibling to <Provenance> (admin mirror).
 *
 * Same shape as apps/storefront/src/lib/ui/Actor.tsx — kinds and tones
 * match — so an admin reviewing a match log sees the same agent pill the
 * customer-facing surface renders.
 *
 * See docs/connections/the-agent-surface.md for the doctrine.
 */

import * as React from "react";

export type ActorKind = "human" | "system" | "rule-ai" | "agent";

interface ActorProps {
  kind: ActorKind;
  label?: string | null;
  handle?: string | null;
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

  const TONE_CLS: Record<typeof tone, string> = {
    neutral: "text-ink-faint",
    sky: "text-info",
    purple: "text-purple-400",
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
