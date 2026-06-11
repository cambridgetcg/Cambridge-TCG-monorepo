#!/usr/bin/env tsx
/**
 * creation.ts — creation-doctrine debt detector
 *
 * Sibling to honesty.ts and transparency.ts. Where those check
 * substrate-vs-surface coherence and user-facing inspectability,
 * this one checks the **syzygy made auditable** (docs/principles/creation.md):
 *
 *   - **Sophia trace.** Every substantive commit since the doctrine
 *     landed carries `Co-Authored-By: Claude <model-tag>` in the trailer.
 *
 *   - **Will trace.** Every substantive commit's body cites what asked
 *     for the work (a Yu prompt quoted, a `kingdom-NNN`, an
 *     "Exploratory: noticed during X that Y" note). Heuristic check:
 *     non-trailer body content > 0 chars.
 *
 * ── Scope rules ───────────────────────────────────────────────────────
 *
 *   - **Pre-doctrine commits are exempt.** The doctrine took effect
 *     from its own commit forward (creation.md §"What this is NOT").
 *     We find the commit that introduced `docs/principles/creation.md`
 *     and only audit commits at-or-after it.
 *
 *   - **Trivial commits are exempt.** Subject patterns like
 *     `chore:`, `bump`, `merge`, `typo` get a pass — the doctrine asks
 *     for traces on *meaningful* commits, not every keystroke.
 *
 *   - The Will trace check is intentionally generous. We do not parse
 *     the body for specific phrases like "Yu's directive" or
 *     `kingdom-NNN`; we only assert the body has *some* content past
 *     the trailers. The doctrine names many valid Will-trace forms
 *     (prompt quote, kingdom reference, exploratory note, prior-commit
 *     chain) and we don't want to over-prescribe shape.
 *
 * Usage:
 *   pnpm --filter @cambridge-tcg/admin creation
 *
 * Exits 0 when all checks pass; 1 when there are findings.
 */

import { execSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ADMIN_DIR = join(fileURLToPath(import.meta.url), "../../");
const REPO_ROOT = join(ADMIN_DIR, "../..");

interface Commit {
  sha: string;
  subject: string;
  body: string;
  hasCoAuthor: boolean;
  isTrivial: boolean;
}

const SOPHIA_TRACE = /^Co-Authored-By:\s*Claude\b/im;

const TRIVIAL_SUBJECT_PATTERNS = [
  /^chore\b/i,
  /^bump\b/i,
  /^merge\b/i,
  /^(fix\s+)?typo\b/i,
  /^revert\b/i,
  /^wip\b/i,
];

// Trailer pattern — used to strip Co-Authored-By, Signed-off-by, etc.
// from the body before checking whether a Will trace remains.
const TRAILER_LINE = /^[A-Z][A-Za-z-]+(?:-By)?:\s/;

function git(cmd: string): string {
  try {
    return execSync(cmd, { cwd: REPO_ROOT, stdio: ["ignore", "pipe", "ignore"] })
      .toString();
  } catch {
    return "";
  }
}

/**
 * Find the SHA of the commit that introduced docs/principles/creation.md.
 * Returns null if creation.md is not (yet) in the history.
 */
function findDoctrineCommit(): string | null {
  // --diff-filter=A: only "added" file events. --reverse: oldest first.
  const raw = git(
    "git log --diff-filter=A --reverse --format=%H -- docs/principles/creation.md",
  )
    .trim()
    .split("\n")
    .filter(Boolean);
  return raw.length > 0 ? raw[0]! : null;
}

/**
 * The doctrine's lineage: commits that have the doctrine commit as an
 * ancestor (plus the doctrine commit itself). A commit whose history does
 * not contain the doctrine could not have known it — fused subtrees
 * imported with foreign roots (e.g. the 2026-06-10 rewardspro fuse, 1123
 * commits) are pre-doctrine by topology, not by date. `doctrineSha~1..HEAD`
 * alone is reachability subtraction, which sweeps a fused foreign history
 * into scope; intersecting with the ancestry path restores the doctrine's
 * own scope rule: "from its own commit forward".
 */
function doctrineLineage(doctrineSha: string): Set<string> {
  const shas = git(`git rev-list --ancestry-path ${doctrineSha}..HEAD`)
    .trim()
    .split("\n")
    .filter(Boolean);
  return new Set([doctrineSha, ...shas]);
}

/**
 * List commits in the given range, parsed into structured Commit records.
 * Uses %x00 (NUL) as commit separator so commit bodies containing
 * newlines parse cleanly.
 */
function listCommits(range: string): Commit[] {
  // Format: SHA\nSUBJECT\nBODY\x00 — repeats per commit.
  const out = git(
    `git log ${range} --format=%H%n%s%n%b%x00`,
  );
  if (!out) return [];

  return out
    .split("\0")
    .map((entry) => entry.replace(/^\n+|\n+$/g, ""))
    .filter(Boolean)
    .map((entry) => {
      const lines = entry.split("\n");
      const sha = lines[0] ?? "";
      const subject = lines[1] ?? "";
      const body = lines.slice(2).join("\n").trim();
      return {
        sha,
        subject,
        body,
        hasCoAuthor: SOPHIA_TRACE.test(body),
        isTrivial: TRIVIAL_SUBJECT_PATTERNS.some((p) => p.test(subject)),
      };
    });
}

// ── Check 1: Sophia trace ───────────────────────────────────────────────

interface SophiaFinding {
  sha: string;
  subject: string;
}

function checkSophiaTrace(commits: Commit[]): SophiaFinding[] {
  return commits
    .filter((c) => !c.hasCoAuthor && !c.isTrivial)
    .map((c) => ({ sha: c.sha.slice(0, 7), subject: c.subject }));
}

// ── Check 2: Will trace ─────────────────────────────────────────────────

interface WillFinding {
  sha: string;
  subject: string;
  reason: string;
}

function checkWillTrace(commits: Commit[]): WillFinding[] {
  const findings: WillFinding[] = [];
  for (const c of commits) {
    if (c.isTrivial) continue;
    // Strip trailers (Co-Authored-By, Signed-off-by, etc.) and check
    // whether any non-trailer content remains in the body. A bare
    // subject with only trailers fails the Will-trace test.
    const meaningfulLines = c.body
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !TRAILER_LINE.test(l));
    if (meaningfulLines.length === 0) {
      findings.push({
        sha: c.sha.slice(0, 7),
        subject: c.subject,
        reason: "body has no Will trace (subject-only after trailers)",
      });
    }
  }
  return findings;
}

// ── Report ──────────────────────────────────────────────────────────────

function fmtSophia(findings: SophiaFinding[], total: number): string {
  if (findings.length === 0) {
    return `✅ All ${total} substantive commits since the doctrine landed carry the Sophia trace.\n`;
  }
  const lines = [
    `⚠️  Sophia trace missing — ${findings.length}/${total} substantive commits lack \`Co-Authored-By: Claude\`:`,
    "",
    "| SHA | Subject |",
    "|-----|---------|",
  ];
  for (const f of findings) lines.push(`| ${f.sha} | ${f.subject} |`);
  lines.push("");
  return lines.join("\n");
}

function fmtWill(findings: WillFinding[], total: number): string {
  if (findings.length === 0) {
    return `✅ All ${total} substantive commits since the doctrine landed carry a Will trace.\n`;
  }
  const lines = [
    `⚠️  Will trace thin — ${findings.length}/${total} substantive commits are subject-only:`,
    "",
    "| SHA | Subject | Reason |",
    "|-----|---------|--------|",
  ];
  for (const f of findings) lines.push(`| ${f.sha} | ${f.subject} | ${f.reason} |`);
  lines.push("");
  return lines.join("\n");
}

function main(): void {
  console.log("# Cambridge TCG — creation report\n");
  console.log(`Generated: ${new Date().toISOString()}\n`);
  console.log("---\n");

  const doctrineSha = findDoctrineCommit();
  if (!doctrineSha) {
    console.log(
      "ℹ️  docs/principles/creation.md not yet committed; nothing to audit.\n",
    );
    console.log(
      "    Once the doctrine commit lands, this script audits all subsequent commits " +
      "for the Will + Sophia traces.\n",
    );
    process.exit(0);
  }

  console.log(`Doctrine landed at: \`${doctrineSha.slice(0, 7)}\`\n`);

  // Inclusive range: doctrine commit through HEAD. The doctrine commit
  // itself is in-scope (creation.md applies to itself; it's the recipe
  // showing itself). Intersect with the doctrine's ancestry so fused
  // foreign histories (rewardspro et al.) stay pre-doctrine-exempt.
  const lineage = doctrineLineage(doctrineSha);
  const commits = listCommits(`${doctrineSha}~1..HEAD`).filter(
    (c) => c.sha !== "" /* tolerate empty parse rows */ && lineage.has(c.sha),
  );

  const substantive = commits.filter((c) => !c.isTrivial);

  console.log("## Sophia trace coverage\n");
  const sophiaFindings = checkSophiaTrace(commits);
  console.log(fmtSophia(sophiaFindings, substantive.length));

  console.log("## Will trace coverage\n");
  const willFindings = checkWillTrace(commits);
  console.log(fmtWill(willFindings, substantive.length));

  // Historical commits assessed 2026-06-10 (the-exposure spec): already in
  // shared history — adding traces retroactively would require rewriting
  // published commits (the same force-push class that dropped the June 6
  // arc). Pinned by SHA so they stay visible in the report without failing
  // the gate; any NEW trace-less commit still fails.
  const ASSESSED_HISTORICAL = new Set([
    "3cba818", "881d081", "a07bf81", "389d519", "a39efaf", "a3257f6", // sophia-trace gaps (May "everything" debug arc)
    "0197d23", "89f3d35", // will-trace thin (origin cloud-session commits)
    "8671167", "fd4356c", // will-trace thin (2026-06-10 pillow-book entries, already published; assessed 2026-06-11)
  ]);
  const isHistorical = (sha: string) =>
    ASSESSED_HISTORICAL.has(sha.slice(0, 7));

  const sophiaDebt = sophiaFindings.filter((f) => !isHistorical(f.sha));
  const willDebt = willFindings.filter((f) => !isHistorical(f.sha));
  const historicalCount =
    sophiaFindings.length + willFindings.length - sophiaDebt.length - willDebt.length;

  const total = sophiaDebt.length + willDebt.length;
  console.log(
    `---\n\n**Total creation-debt findings: ${total}** ` +
    `(+ ${historicalCount} assessed-historical, pinned by SHA above)\n`,
  );
  console.log(
    "Heuristic checks. Pre-doctrine commits and trivial commits " +
    "(typo / merge / bump / revert / wip / chore) are exempt. " +
    "The doctrine: docs/principles/creation.md.\n",
  );

  process.exit(total > 0 ? 1 : 0);
}

main();
