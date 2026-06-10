/**
 * Pure composer — takes already-computed reports from sibling modules
 * and synthesizes a single `HealthReport`.
 *
 * No I/O here; tests pass synthetic inputs. The facade in `./index.ts`
 * runs the validators/analyzers and feeds the results in.
 */
import type { Registry } from "../rp-registry/types";
import type { Report as ValidatorReport } from "../handoff-validator/validator";
import type { UsageReport } from "../usage-analyzer/types";

import type { HealthReport, HealthSection, Status } from "./types";

export interface ComposerInputs {
  validator: ValidatorReport;
  usage: UsageReport;
  registry: Registry;
  /** Override for testing — defaults to `new Date().toISOString()`. */
  now?: string;
}

export function compose(inputs: ComposerInputs): HealthReport {
  const sections: HealthSection[] = [
    composeHandoffSection(inputs.validator),
    composeAdoptionSection(inputs.usage, inputs.registry),
    composeHotspotsSection(inputs.usage),
  ];
  return {
    status: worstStatus(sections.map((s) => s.status)),
    sections,
    generatedAt: inputs.now ?? new Date().toISOString(),
  };
}

function composeHandoffSection(v: ValidatorReport): HealthSection {
  if (v.ok) {
    return {
      name: "Handoff drift",
      status: "ok",
      summary: `${v.referencedTokens} token reference(s) verified — no drift`,
      details: [],
    };
  }
  return {
    name: "Handoff drift",
    status: "error",
    summary: `${v.issues.length} issue(s) — handoff has drifted from canonical CSS`,
    details: v.issues.map((i) => `[${i.type}] ${i.detail}`),
  };
}

function composeAdoptionSection(u: UsageReport, r: Registry): HealthSection {
  const tokensUsed = u.tokens.size;
  const tokensTotal = r.tokens.length;
  const primsUsed = u.primitives.size;
  const primsTotal = r.primitives.length;

  // Adoption thresholds: if every token is used and >= 70% of primitives,
  // we're healthy. Below 50% on either, warning. Below 25%, error.
  const tokenRatio = tokensTotal === 0 ? 1 : tokensUsed / tokensTotal;
  const primRatio = primsTotal === 0 ? 1 : primsUsed / primsTotal;
  const min = Math.min(tokenRatio, primRatio);
  const status: Status = min >= 0.7 ? "ok" : min >= 0.4 ? "warning" : "error";

  const details: string[] = [];
  if (u.unusedTokens.length > 0) {
    details.push(`Unused tokens: ${u.unusedTokens.join(", ")}`);
  }
  if (u.unusedPrimitives.length > 0) {
    const sample = u.unusedPrimitives.slice(0, 6).join(", ");
    const more = u.unusedPrimitives.length > 6 ? `, +${u.unusedPrimitives.length - 6} more` : "";
    details.push(`Unused primitives: ${sample}${more}`);
  }

  return {
    name: "Token adoption",
    status,
    summary: `${tokensUsed}/${tokensTotal} tokens · ${primsUsed}/${primsTotal} primitives adopted`,
    details,
  };
}

function composeHotspotsSection(u: UsageReport): HealthSection {
  const top = [...u.tokens.entries()]
    .map(([name, refs]) => ({ name, count: refs.length }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  if (top.length === 0) {
    return {
      name: "Hotspots",
      status: "warning",
      summary: "No token usage detected — analyzer may be misconfigured",
      details: [],
    };
  }

  return {
    name: "Hotspots",
    status: "ok",
    summary: `Top ${top.length} most-used tokens`,
    details: top.map((t) => `${t.count.toString().padStart(3)}× ${t.name}`),
  };
}

function worstStatus(list: Status[]): Status {
  if (list.includes("error")) return "error";
  if (list.includes("warning")) return "warning";
  return "ok";
}
