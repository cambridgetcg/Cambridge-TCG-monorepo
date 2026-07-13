#!/usr/bin/env node
/**
 * progress-report.mjs — single-command snapshot of where the app is.
 *
 * Bundles existing verification surfaces into one report:
 *   • Git state (branch, ahead/behind, dirty files, last 10 commits)
 *   • Production process liveness (/api/health on Vercel)
 *   • Type check, lint, build (optional, --full)
 *   • Route health (scripts/test-routes.sh)
 *
 * Usage:
 *   node scripts/progress-report.mjs            # quick (no build, no full route scan)
 *   node scripts/progress-report.mjs --full     # add typecheck + lint + build + route scan
 *   node scripts/progress-report.mjs --json     # machine-readable output
 *   node scripts/progress-report.mjs --no-prod  # skip prod probe (offline mode)
 */

import { execSync, spawnSync } from "node:child_process";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    full: { type: "boolean", default: false },
    json: { type: "boolean", default: false },
    "no-prod": { type: "boolean", default: false },
  },
  strict: true,
});

const PROD_URL = "https://rewardspro-production.vercel.app";
const report = { generatedAt: new Date().toISOString(), checks: {} };

const c = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  bold: "\x1b[1m",
};

function sh(cmd, opts = {}) {
  try {
    return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts }).trim();
  } catch (e) {
    return { error: e.message, stdout: e.stdout?.toString() ?? "", stderr: e.stderr?.toString() ?? "" };
  }
}

function shExitOnly(cmd, timeoutMs = 120_000) {
  const r = spawnSync("sh", ["-c", cmd], { timeout: timeoutMs, encoding: "utf8" });
  return { code: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "", timedOut: r.signal === "SIGTERM" };
}

// ── Git ─────────────────────────────────────────────────────────────────────
function gitState() {
  const branch = sh("git rev-parse --abbrev-ref HEAD");
  const head = sh("git rev-parse HEAD");
  const headShort = sh("git rev-parse --short HEAD");
  sh("git fetch origin --quiet 2>/dev/null"); // best-effort
  const upstream = sh("git rev-parse --abbrev-ref @{upstream} 2>/dev/null");
  const ahead = sh(`git rev-list --count ${upstream}..HEAD 2>/dev/null`) || "0";
  const behind = sh(`git rev-list --count HEAD..${upstream} 2>/dev/null`) || "0";
  const dirty = sh("git status --porcelain").split("\n").filter(Boolean);
  const lastCommits = sh("git log --oneline -10").split("\n");
  return { branch, head, headShort, upstream, ahead: +ahead, behind: +behind, dirty, lastCommits };
}

// ── Prod liveness ──────────────────────────────────────────────────────────
async function prodLiveness() {
  const start = Date.now();
  try {
    const r = await fetch(`${PROD_URL}/api/health`, { signal: AbortSignal.timeout(15_000) });
    const latency = Date.now() - start;
    if (!r.ok) return { ok: false, status: r.status, latency };
    const body = await r.json();
    return { ok: true, status: r.status, latency, body };
  } catch (e) {
    return { ok: false, error: e.message, latency: Date.now() - start };
  }
}

// ── Build checks ────────────────────────────────────────────────────────────
function runCheck(name, cmd, timeoutMs) {
  const start = Date.now();
  const r = shExitOnly(cmd, timeoutMs);
  return {
    name,
    cmd,
    pass: r.code === 0,
    code: r.code,
    timedOut: r.timedOut,
    durationMs: Date.now() - start,
    stderrTail: r.stderr.split("\n").slice(-15).join("\n"),
    stdoutTail: r.stdout.split("\n").slice(-15).join("\n"),
  };
}

// ── Route health ────────────────────────────────────────────────────────────
function routeHealth() {
  const start = Date.now();
  const r = shExitOnly(`bash scripts/test-routes.sh ${PROD_URL} 2>&1`, 300_000);
  const summary = {};
  for (const [key, re] of [
    ["ok", /✓ OK:\s+(\d+)/],
    ["auth", /○ AUTH:\s+(\d+)/],
    ["err", /⚠ ERR:\s+(\d+)/],
    ["skip", /- SKIP:\s+(\d+)/],
    ["crash", /✗ CRASH:\s+(\d+)/],
  ]) {
    const m = r.stdout.match(re);
    summary[key] = m ? +m[1] : null;
  }
  const totalMatch = r.stdout.match(/RESULTS:\s+(\d+)\s+routes tested/);
  return {
    pass: r.code === 0,
    durationMs: Date.now() - start,
    total: totalMatch ? +totalMatch[1] : null,
    ...summary,
  };
}

// ── Run ─────────────────────────────────────────────────────────────────────
report.checks.git = gitState();

if (!values["no-prod"]) {
  report.checks.prodLiveness = await prodLiveness();
}

if (values.full) {
  report.checks.typecheck = runCheck("typecheck", "npm run typecheck 2>&1", 180_000);
  report.checks.lint = runCheck("lint", "npm run lint 2>&1", 180_000);
  report.checks.build = runCheck("build", "npm run build 2>&1", 300_000);
  report.checks.routes = routeHealth();
}

// ── Output ──────────────────────────────────────────────────────────────────
if (values.json) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const g = report.checks.git;
console.log(`${c.bold}━━━ RewardsPro progress report ━━━${c.reset}  ${c.dim}${report.generatedAt}${c.reset}\n`);

console.log(`${c.bold}Git${c.reset}`);
console.log(`  Branch:    ${g.branch} @ ${g.headShort}`);
if (g.upstream) {
  const aheadStr = g.ahead > 0 ? `${c.yellow}+${g.ahead}${c.reset}` : `${g.ahead}`;
  const behindStr = g.behind > 0 ? `${c.red}-${g.behind}${c.reset}` : `${g.behind}`;
  console.log(`  Upstream:  ${g.upstream}  (${aheadStr} ahead, ${behindStr} behind)`);
}
console.log(`  Dirty:     ${g.dirty.length === 0 ? c.green + "clean" + c.reset : c.yellow + g.dirty.length + " files" + c.reset}`);
if (g.dirty.length > 0 && g.dirty.length <= 10) {
  for (const line of g.dirty) console.log(`             ${c.dim}${line}${c.reset}`);
}
console.log(`  Recent commits:`);
for (const line of g.lastCommits.slice(0, 5)) console.log(`    ${c.dim}${line}${c.reset}`);

if (report.checks.prodLiveness) {
  const h = report.checks.prodLiveness;
  console.log(`\n${c.bold}Production${c.reset}  ${c.dim}${PROD_URL}${c.reset}`);
  if (h.ok) {
    const b = h.body;
    console.log(`  Liveness:  ${c.green}${b.status}${c.reset}  (${h.latency}ms)`);
    console.log(`  Readiness: requires the authenticated operator probe`);
  } else {
    console.log(`  ${c.red}DOWN${c.reset}  status=${h.status ?? "?"}  ${h.error ?? ""}`);
  }
}

if (values.full) {
  console.log(`\n${c.bold}Build checks${c.reset}`);
  for (const key of ["typecheck", "lint", "build"]) {
    const r = report.checks[key];
    if (!r) continue;
    const tag = r.pass ? c.green + "PASS" + c.reset : c.red + "FAIL" + c.reset;
    console.log(`  ${key.padEnd(10)} ${tag}  (${(r.durationMs / 1000).toFixed(1)}s)`);
    if (!r.pass) {
      const tail = (r.stderrTail || r.stdoutTail).split("\n").slice(-5).join("\n             ");
      console.log(`             ${c.dim}${tail}${c.reset}`);
    }
  }

  const rt = report.checks.routes;
  if (rt) {
    const tag = rt.pass ? c.green + "PASS" + c.reset : c.red + "FAIL" + c.reset;
    console.log(`\n${c.bold}Route health${c.reset}  ${tag}  (${(rt.durationMs / 1000).toFixed(1)}s)`);
    console.log(`  Total: ${rt.total}   ok=${rt.ok}  auth=${rt.auth}  err=${rt.err}  skip=${rt.skip}  ${c.red}crash=${rt.crash}${c.reset}`);
  }
}

console.log("");

// Exit code: nonzero if anything important failed
const failed =
  (report.checks.prodLiveness && !report.checks.prodLiveness.ok) ||
  (report.checks.typecheck && !report.checks.typecheck.pass) ||
  (report.checks.lint && !report.checks.lint.pass) ||
  (report.checks.build && !report.checks.build.pass) ||
  (report.checks.routes && !report.checks.routes.pass);
process.exit(failed ? 1 : 0);
