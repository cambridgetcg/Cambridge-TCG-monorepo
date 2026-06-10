/**
 * Pure planner — `plan(inputs)` → `MigrationPlan`.
 *
 * For each shared primitive in `usage.unusedPrimitives`, scan the
 * widget files for `.rp-<X>-<suffix>` patterns whose suffix matches
 * the shared primitive's name. Those are the candidates.
 *
 * Heuristic only — naming similarity, not CSS-property similarity.
 * The output is advice, not auto-migration; rationale is included so
 * a reviewer can decide whether each suggestion actually applies.
 */
import type { Registry } from "../rp-registry/types";
import type { UsageReport, ScannedFile } from "../usage-analyzer/types";
import type { Candidate, MigrationPlan, Suggestion } from "./types";

export interface PlannerInputs {
  registry: Registry;
  usage: UsageReport;
  files: ScannedFile[];
  /** Override for testing — defaults to `new Date().toISOString()`. */
  now?: string;
}

export function plan(inputs: PlannerInputs): MigrationPlan {
  const widgetLocal = extractWidgetLocal(inputs.files, inputs.registry);

  const suggestions: Suggestion[] = [];
  for (const target of inputs.usage.unusedPrimitives) {
    const candidates = matchCandidates(target, widgetLocal);
    if (candidates.length === 0) continue;
    suggestions.push({
      target,
      candidates,
      confidence: classify(target, candidates),
      rationale: buildRationale(target, candidates),
    });
  }

  // Sort by total impact (descending) — most-referenced suggestions first.
  suggestions.sort((a, b) => sumRefs(b.candidates) - sumRefs(a.candidates));

  return {
    generatedAt: inputs.now ?? new Date().toISOString(),
    suggestions,
    totalEstimatedChanges: suggestions.reduce(
      (sum, s) => sum + sumRefs(s.candidates),
      0
    ),
  };
}

interface LocalRef {
  name: string;
  files: Set<string>;
  count: number;
}

function extractWidgetLocal(
  files: ScannedFile[],
  registry: Registry
): Map<string, LocalRef> {
  // Walk every line of every file. For each `.rp-X` selector, increment
  // its count under that file. Skip names already in the registry —
  // those are shared primitives, not widget-local.
  const seen = new Map<string, LocalRef>();
  const record = (name: string, file: ScannedFile): void => {
    if (name.endsWith("-")) return; // wildcard (e.g. `.rp-foo--*` in comments)
    if (registry.primitiveNames.has(name)) return;
    let entry = seen.get(name);
    if (!entry) {
      entry = { name, files: new Set(), count: 0 };
      seen.set(name, entry);
    }
    entry.files.add(file.path);
    entry.count++;
  };

  for (const file of files) {
    const lines = file.content.split("\n");
    for (const line of lines) {
      // CSS selectors / dotted references: `.rp-X`
      for (const m of line.matchAll(/\.(rp-[a-z0-9_-]+)/gi)) record(m[1], file);

      // `class="..."` / `className="..."` attrs (HTML, JSX, template strings)
      for (const m of line.matchAll(/class(?:Name)?\s*=\s*["']([^"']+)["']/gi)) {
        for (const cls of m[1].split(/\s+/)) {
          if (cls.startsWith("rp-")) record(cls, file);
        }
      }

      // DOM API: classList.add/remove/toggle/contains/replace("rp-X")
      for (const m of line.matchAll(/classList\.\w+\s*\(\s*["'](rp-[a-z0-9_-]+)["']/gi)) {
        record(m[1], file);
      }
    }
  }
  return seen;
}

function matchCandidates(
  target: string,
  widgetLocal: Map<string, LocalRef>
): Candidate[] {
  // Match patterns:
  //   target = "rp-btn"          → candidates: rp-X-btn, rp-X-btn--*
  //   target = "rp-btn--primary" → candidates: rp-X-btn--primary
  //   target = "rp-card"         → candidates: rp-X-card, rp-X-card-*
  // The shared "core" suffix of the target ("btn", "card", "pill", etc.)
  // is what we match against — anything in the widget-local set whose
  // name contains "-<core>" (or "-<core>--", "-<core>-") is a candidate.
  const core = extractCore(target);
  if (!core) return [];

  const out: Candidate[] = [];
  for (const ref of widgetLocal.values()) {
    if (ref.name === target) continue;
    // The candidate's name has the form `rp-<widget>-<core>...`.
    const re = new RegExp(`^rp-[a-z0-9]+-${core}(?:[-_].*)?$`, "i");
    if (re.test(ref.name)) {
      out.push({
        name: ref.name,
        referenceCount: ref.count,
        files: [...ref.files].sort(),
      });
    }
  }
  out.sort((a, b) => b.referenceCount - a.referenceCount);
  return out;
}

function extractCore(target: string): string | null {
  // `rp-btn` → "btn"
  // `rp-btn--primary` → "btn--primary"
  // `rp-card` → "card"
  // `rp-empty-state` → null (multi-segment cores aren't currently matched —
  // the heuristic stays conservative)
  const m = /^rp-([a-z][a-z0-9]*)(.*)$/i.exec(target);
  if (!m) return null;
  // Reject multi-segment names like `rp-section-title` to avoid false positives.
  // The core must NOT contain a hyphen (single-word like `btn`, `card`, `pill`).
  // Modifiers (`--primary`) are kept.
  const base = m[1];
  const rest = m[2];
  if (rest.startsWith("-") && !rest.startsWith("--")) return null;
  return base + rest;
}

function classify(
  target: string,
  candidates: Candidate[]
): Suggestion["confidence"] {
  // High: ≥ 2 candidates referenced ≥ 5 times each (broad pattern).
  // Medium: 1 candidate or candidates with low total refs.
  // Low: noisy match (single low-count candidate).
  const hot = candidates.filter((c) => c.referenceCount >= 5);
  if (hot.length >= 2) return "high";
  if (hot.length === 1 || candidates.length >= 2) return "medium";
  return "low";
}

function buildRationale(target: string, candidates: Candidate[]): string {
  const core = extractCore(target);
  return (
    `${candidates.length} widget-local primitive(s) share the "${core}" naming pattern with the shared \`.${target}\` ` +
    `(${sumRefs(candidates)} total reference${sumRefs(candidates) === 1 ? "" : "s"} across widgets). ` +
    `Verify CSS-property compatibility before migrating.`
  );
}

function sumRefs(cs: Candidate[]): number {
  return cs.reduce((s, c) => s + c.referenceCount, 0);
}
