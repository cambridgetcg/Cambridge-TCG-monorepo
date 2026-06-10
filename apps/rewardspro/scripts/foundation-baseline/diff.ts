/**
 * Pure diff — `diff(prev, curr)` → `BaselineDiff`.
 *
 * Compares two baselines section-by-section and synthesizes a `trend`
 * for each, plus an overall trend. Status changes are ranked:
 * `error` (worst) > `warning` > `ok` (best). A change toward a better
 * rank is `improved`; toward worse is `regressed`.
 *
 * For sections whose status didn't change, this also looks at the
 * `summary` line — a smaller "Unused tokens" count counts as improved
 * even if the status is still `warning`.
 */
import type { Baseline, BaselineDiff, SectionDiff, Trend } from "./types";
import type { Status } from "../foundation-health/types";

const RANK: Record<Status, number> = { ok: 0, warning: 1, error: 2 };

export function diff(prev: Baseline, curr: Baseline): BaselineDiff {
  const sections: SectionDiff[] = [];
  const prevByName = new Map(prev.report.sections.map((s) => [s.name, s]));

  for (const c of curr.report.sections) {
    const p = prevByName.get(c.name);
    if (!p) {
      sections.push({
        name: c.name,
        prevStatus: c.status,
        currStatus: c.status,
        trend: "unchanged",
        summary: `new section — ${c.summary}`,
      });
      continue;
    }
    sections.push(buildSectionDiff(p.name, p.status, c.status, p.summary, c.summary));
  }

  return {
    prev,
    curr,
    sections,
    trend: rollUpTrend(sections.map((s) => s.trend)),
  };
}

function buildSectionDiff(
  name: string,
  prevStatus: Status,
  currStatus: Status,
  prevSummary: string,
  currSummary: string
): SectionDiff {
  if (RANK[currStatus] < RANK[prevStatus]) {
    return {
      name,
      prevStatus,
      currStatus,
      trend: "improved",
      summary: `${prevStatus} → ${currStatus}`,
    };
  }
  if (RANK[currStatus] > RANK[prevStatus]) {
    return {
      name,
      prevStatus,
      currStatus,
      trend: "regressed",
      summary: `${prevStatus} → ${currStatus}`,
    };
  }

  // Status unchanged — look at the count-style numbers in the summary.
  // Summary lines often contain MULTIPLE n/m ratios (e.g. "35/39 tokens
  // · 30/45 primitives adopted"). Earlier this method only checked the
  // first ratio, missing improvements in the second column. Now we
  // compare every ratio pair-wise and pick the most-changed direction.
  const prevPairs = extractRatios(prevSummary);
  const currPairs = extractRatios(currSummary);
  if (prevPairs.length > 0 && prevPairs.length === currPairs.length) {
    let improved = false;
    let regressed = false;
    let firstChangeIdx = -1;
    for (let i = 0; i < prevPairs.length; i++) {
      if (currPairs[i].used > prevPairs[i].used) {
        improved = true;
        if (firstChangeIdx < 0) firstChangeIdx = i;
      } else if (currPairs[i].used < prevPairs[i].used) {
        regressed = true;
        if (firstChangeIdx < 0) firstChangeIdx = i;
      }
    }
    if (improved || regressed) {
      const idx = firstChangeIdx;
      return {
        name,
        prevStatus,
        currStatus,
        trend: improved && regressed ? "regressed" : improved ? "improved" : "regressed",
        summary: `${prevPairs[idx].used}/${prevPairs[idx].total} → ${currPairs[idx].used}/${currPairs[idx].total}`,
      };
    }
  }

  return {
    name,
    prevStatus,
    currStatus,
    trend: "unchanged",
    summary: `${currStatus} (no change)`,
  };
}

function extractRatios(s: string): Array<{ used: number; total: number }> {
  return [...s.matchAll(/(\d+)\s*\/\s*(\d+)/g)].map((m) => ({
    used: parseInt(m[1], 10),
    total: parseInt(m[2], 10),
  }));
}

function rollUpTrend(trends: Trend[]): Trend {
  const hasImproved = trends.includes("improved");
  const hasRegressed = trends.includes("regressed");
  if (hasImproved && hasRegressed) return "mixed";
  if (hasImproved) return "improved";
  if (hasRegressed) return "regressed";
  return "unchanged";
}
