// Journey snapshot — deterministic dump of `getUserJourney()` output.
//
// Companion to the migration recorded in docs/connections/the-scribe.md
// postscript. The cutover swapped 826 LOC of monolithic timeline.ts for
// the bookshelf-based architecture (lifecycle slots + render.ts + slim
// composer); typecheck verified compile-time correctness but not
// behavioral parity with the legacy code.
//
// This script gives the operator a way to verify: run it against `main`
// (legacy code), save the snapshot; check out the migration branch, run
// again with the same user id, diff. Stable ordering by (at desc, kind,
// summary) makes line-level diffs meaningful.
//
// Beyond the cutover, this is also a general-purpose inspection tool:
// "show me what user X sees on their journey, right now." Useful for
// support, fraud review, or any time the operator wants to eyeball a
// user's full timeline without spinning up the dev server.
//
// ── Usage ─────────────────────────────────────────────────────────────
//
//   DATABASE_URL=postgres://... pnpm exec tsx scripts/journey-snapshot.mts \
//     <userId> [options]
//
// Options:
//   --customer            Apply customer-facing filter (hideAdminOnly=true).
//                         Default is admin view (everything visible).
//   --group=<g>           Filter to one group (vault|trade|auction|...).
//   --since=<ISO>         Only events at or after this timestamp.
//   --per-source=<n>      Per-source cap (default 200).
//   --out=<path>          Write to file instead of stdout.
//
// Diff workflow:
//   git checkout main
//   pnpm exec tsx scripts/journey-snapshot.mts <user> --out=/tmp/before.json
//   git checkout migration-branch
//   pnpm exec tsx scripts/journey-snapshot.mts <user> --out=/tmp/after.json
//   diff -u /tmp/before.json /tmp/after.json
//
// Exit code is 0 on success, 1 on bad input, 2 on DB / runtime error.

import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
// Type-only imports are erased at runtime; safe for cross-alias TS files.
import type { JourneyEvent, JourneyOptions } from "../src/lib/journey/types";
// Runtime: dynamic import, matching the pattern from
// test-journey-aggregator.mts — the @/ aliases inside timeline.ts only
// resolve when the import is delayed past module-instantiation.

interface ParsedArgs {
  userId: string;
  hideAdminOnly: boolean;
  group: JourneyEvent["group"] | undefined;
  since: Date | undefined;
  perSource: number;
  out: string | undefined;
}

function parseArgs(argv: string[]): ParsedArgs | null {
  const args = argv.slice(2);
  if (args.length === 0 || args[0]!.startsWith("--")) return null;

  const userId = args[0]!;
  if (!/^[0-9a-f-]{36}$/i.test(userId)) {
    console.error(`Bad userId: '${userId}' is not a UUID.`);
    return null;
  }

  const flag = (prefix: string): string | undefined => {
    const found = args.find((a) => a.startsWith(prefix));
    return found ? found.slice(prefix.length) : undefined;
  };

  const groupRaw = flag("--group=");
  const sinceRaw = flag("--since=");
  const perSourceRaw = flag("--per-source=");

  let since: Date | undefined;
  if (sinceRaw) {
    const d = new Date(sinceRaw);
    if (Number.isNaN(d.getTime())) {
      console.error(`Bad --since value: '${sinceRaw}' is not a valid ISO date.`);
      return null;
    }
    since = d;
  }

  const perSource = perSourceRaw ? parseInt(perSourceRaw, 10) : 200;
  if (!Number.isFinite(perSource) || perSource <= 0) {
    console.error(`Bad --per-source value: '${perSourceRaw}'.`);
    return null;
  }

  return {
    userId,
    hideAdminOnly: args.includes("--customer"),
    group: groupRaw as JourneyEvent["group"] | undefined,
    since,
    perSource,
    out: flag("--out="),
  };
}

function gitSha(): string {
  try {
    return execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "unknown";
  }
}

async function main(): Promise<number> {
  const parsed = parseArgs(process.argv);
  if (!parsed) {
    console.error(
      "Usage: DATABASE_URL=... pnpm exec tsx scripts/journey-snapshot.mts " +
        "<userId> [--customer] [--group=<g>] [--since=<ISO>] " +
        "[--per-source=<n>] [--out=<path>]",
    );
    return 1;
  }

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required.");
    return 1;
  }

  const options: JourneyOptions = {
    perSource: parsed.perSource,
    hideAdminOnly: parsed.hideAdminOnly,
    group: parsed.group,
    since: parsed.since,
  };

  const startMs = Date.now();
  let events: JourneyEvent[];
  try {
    const mod = await import("../src/lib/journey/timeline");
    events = await mod.getUserJourney(parsed.userId, options);
  } catch (err) {
    console.error(
      "getUserJourney failed:",
      err instanceof Error ? err.message : String(err),
    );
    return 2;
  }
  const elapsedMs = Date.now() - startMs;

  // Stable ordering: at desc, then kind asc, then summary asc. This is
  // what makes line-level diffs between two snapshots meaningful — two
  // events at the same millisecond won't flip order between runs.
  const sorted = [...events].sort((a, b) => {
    const dt = b.at.getTime() - a.at.getTime();
    if (dt !== 0) return dt;
    const k = a.kind.localeCompare(b.kind);
    if (k !== 0) return k;
    return a.summary.localeCompare(b.summary);
  });

  const countsByGroup: Record<string, number> = {};
  const countsByKind: Record<string, number> = {};
  for (const e of events) {
    countsByGroup[e.group] = (countsByGroup[e.group] ?? 0) + 1;
    countsByKind[e.kind] = (countsByKind[e.kind] ?? 0) + 1;
  }

  const snapshot = {
    meta: {
      capturedAt: new Date().toISOString(),
      userId: parsed.userId,
      gitSha: gitSha(),
      nodeVersion: process.version,
      elapsedMs,
      options: {
        perSource: parsed.perSource,
        hideAdminOnly: parsed.hideAdminOnly,
        group: parsed.group ?? null,
        since: parsed.since?.toISOString() ?? null,
      },
      totalEvents: events.length,
      countsByGroup,
      countsByKind,
    },
    // Stable shape — only what JourneyEvent declares, ISO timestamps,
    // explicit nulls for optional fields. No fancy. The diff is the
    // tool; this is the input.
    events: sorted.map((e) => ({
      kind: e.kind,
      summary: e.summary,
      at: e.at.toISOString(),
      link: e.link,
      group: e.group,
      tone: e.tone,
      isAdminOnly: e.isAdminOnly ?? false,
    })),
  };

  const json = JSON.stringify(snapshot, null, 2);
  if (parsed.out) {
    writeFileSync(parsed.out, json + "\n");
    console.error(
      `Wrote ${events.length} events (${Object.keys(countsByGroup).length} groups) to ${parsed.out}`,
    );
  } else {
    console.log(json);
  }
  return 0;
}

main()
  .then((code) => {
    process.exit(code);
  })
  .catch((err) => {
    console.error("Unhandled error:", err);
    process.exit(2);
  });
