#!/usr/bin/env node

/**
 * deploy-verify.mjs — Recursive deploy-verify loop for RewardsPro
 *
 * Usage:
 *   node scripts/deploy-verify.mjs [options]
 *
 * Options:
 *   --dry-run           Skip git push, just probe current production
 *   --expected-status N Expected HTTP status (default: 200)
 *   --probe-url URL     Custom probe URL (repeatable)
 *   --max-iterations N  Max retry iterations (default: 5)
 *   --timeout N         Build watch timeout in seconds (default: 180)
 */

import { execSync } from "node:child_process";
import { parseArgs } from "node:util";

// ── CLI args ────────────────────────────────────────────────────────────────

const { values } = parseArgs({
  options: {
    "dry-run": { type: "boolean", default: false },
    "expected-status": { type: "string", default: "200" },
    "probe-url": { type: "string", multiple: true, default: [] },
    "max-iterations": { type: "string", default: "5" },
    timeout: { type: "string", default: "180" },
  },
  strict: true,
});

const DRY_RUN = values["dry-run"];
const EXPECTED_STATUS = parseInt(values["expected-status"], 10);
const MAX_ITERATIONS = parseInt(values["max-iterations"], 10);
const BUILD_TIMEOUT_S = parseInt(values["timeout"], 10);
const POLL_INTERVAL_MS = 5_000;

const BASE_URL = "https://rewardspro-production.vercel.app";

const DEFAULT_PROBES = [
  `${BASE_URL}/app`,
];

const PROBE_URLS =
  values["probe-url"].length > 0 ? values["probe-url"] : DEFAULT_PROBES;

// ── Helpers ─────────────────────────────────────────────────────────────────

function ts() {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

function log(msg) {
  console.log(`[${ts()}] ${msg}`);
}

function logError(msg) {
  console.error(`[${ts()}] ❌ ${msg}`);
}

function run(cmd, opts = {}) {
  try {
    return execSync(cmd, { encoding: "utf-8", timeout: 30_000, ...opts }).trim();
  } catch (err) {
    if (opts.allowFailure) return err.stdout?.trim() ?? "";
    throw err;
  }
}

// ── Step 1: PUSH ────────────────────────────────────────────────────────────

function push() {
  if (DRY_RUN) {
    log("DRY-RUN: skipping git push");
    return;
  }
  log("PUSH → git push origin main");
  const output = run("git push origin main 2>&1", { timeout: 60_000 });
  console.log(output);
}

// ── Step 2: WATCH — poll Vercel until build completes ───────────────────────

async function watchBuild() {
  if (DRY_RUN) {
    log("DRY-RUN: skipping build watch");
    return "ready";
  }

  log(`WATCH → polling Vercel deployment (timeout: ${BUILD_TIMEOUT_S}s)`);

  const deadline = Date.now() + BUILD_TIMEOUT_S * 1_000;

  while (Date.now() < deadline) {
    try {
      const raw = run("vercel ls rewardspro-production --json 2>/dev/null", {
        allowFailure: true,
        timeout: 15_000,
      });

      if (raw) {
        // vercel ls --json outputs one deployment per line or a JSON array
        // Try to find the latest deployment status
        const lines = raw.split("\n").filter(Boolean);
        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            const deployments = Array.isArray(data) ? data : data.deployments ?? [data];
            if (deployments.length > 0) {
              const latest = deployments[0];
              const state = latest.state ?? latest.readyState ?? "unknown";
              log(`  Build state: ${state}`);

              if (state === "READY" || state === "ready") return "ready";
              if (state === "ERROR" || state === "error") return "error";
              if (state === "CANCELED" || state === "canceled") return "canceled";
            }
          } catch {
            // not JSON, try next line
          }
        }
      }
    } catch {
      // vercel ls failed, retry
    }

    // Fallback: use vercel inspect on the project
    try {
      const inspectRaw = run(
        'vercel inspect rewardspro-production --json 2>/dev/null | head -1',
        { allowFailure: true, timeout: 15_000 }
      );
      if (inspectRaw) {
        try {
          const info = JSON.parse(inspectRaw);
          const state = info.readyState ?? info.state ?? "unknown";
          log(`  Build state (inspect): ${state}`);
          if (state === "READY" || state === "ready") return "ready";
          if (state === "ERROR" || state === "error") return "error";
        } catch { /* ignore */ }
      }
    } catch { /* ignore */ }

    await sleep(POLL_INTERVAL_MS);
  }

  logError(`Build watch timed out after ${BUILD_TIMEOUT_S}s`);
  return "timeout";
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Step 3: PROBE — hit health endpoints ────────────────────────────────────

async function probeEndpoints() {
  log(`PROBE → testing ${PROBE_URLS.length} endpoint(s)`);
  const results = [];

  for (const url of PROBE_URLS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);

      const resp = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: { "User-Agent": "deploy-verify/1.0" },
      });
      clearTimeout(timer);

      const status = resp.status;
      const pass = status === EXPECTED_STATUS;

      results.push({ url, status, pass });
      log(`  ${pass ? "✅" : "❌"} ${url} → ${status} (expected ${EXPECTED_STATUS})`);
    } catch (err) {
      results.push({ url, status: 0, pass: false, error: err.message });
      logError(`  ${url} → FETCH ERROR: ${err.message}`);
    }
  }

  return results;
}

// ── Step 4: COMPARE ─────────────────────────────────────────────────────────

function compareResults(probeResults) {
  const allPass = probeResults.every((r) => r.pass);
  if (allPass) {
    log("COMPARE → all probes passed");
  } else {
    const failed = probeResults.filter((r) => !r.pass);
    logError(`COMPARE → ${failed.length}/${probeResults.length} probe(s) failed`);
  }
  return allPass;
}

// ── Step 5: DIAGNOSE — fetch Vercel logs on failure ─────────────────────────

function diagnose() {
  log("DIAGNOSE → fetching recent Vercel function logs");
  try {
    const logs = run("vercel logs rewardspro-production --since 5m 2>&1", {
      allowFailure: true,
      timeout: 20_000,
    });
    if (logs) {
      const lines = logs.split("\n");
      const tail = lines.slice(-50);
      console.log("\n--- Vercel Logs (last 50 lines) ---");
      console.log(tail.join("\n"));
      console.log("--- End Logs ---\n");
    } else {
      log("  No logs returned");
    }
  } catch (err) {
    logError(`  Could not fetch logs: ${err.message}`);
  }
}

// ── Main loop ───────────────────────────────────────────────────────────────

async function main() {
  console.log("\n╔═══════════════════════════════════════════════╗");
  console.log("║    RewardsPro Deploy-Verify Loop              ║");
  console.log("╚═══════════════════════════════════════════════╝\n");

  log(`Config: expectedStatus=${EXPECTED_STATUS} maxIter=${MAX_ITERATIONS} dryRun=${DRY_RUN}`);
  log(`Probes: ${PROBE_URLS.join(", ")}`);
  console.log();

  for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
    console.log(`\n${"─".repeat(50)}`);
    log(`ITERATION ${iteration}/${MAX_ITERATIONS}`);
    console.log(`${"─".repeat(50)}`);

    // 1. Push
    push();

    // 2. Watch build
    const buildState = await watchBuild();
    if (buildState === "error") {
      logError("Build FAILED on Vercel");
      diagnose();
      if (iteration === MAX_ITERATIONS) break;
      log("Waiting 10s before next iteration...");
      await sleep(10_000);
      continue;
    }
    if (buildState === "timeout") {
      logError("Build watch timed out");
      if (iteration === MAX_ITERATIONS) break;
      log("Waiting 10s before next iteration...");
      await sleep(10_000);
      continue;
    }
    if (buildState === "canceled") {
      logError("Build was canceled");
      if (iteration === MAX_ITERATIONS) break;
      continue;
    }

    // 3. Probe endpoints
    // Give the deployment a moment to propagate
    if (!DRY_RUN) {
      log("Waiting 5s for deployment propagation...");
      await sleep(5_000);
    }
    const probeResults = await probeEndpoints();

    // 4. Compare
    const allPass = compareResults(probeResults);

    if (allPass) {
      console.log("\n╔═══════════════════════════════════════════════╗");
      console.log("║         DEPLOY VERIFIED ✅                     ║");
      console.log("╚═══════════════════════════════════════════════╝\n");
      log(`All ${PROBE_URLS.length} probe(s) passed on iteration ${iteration}`);
      process.exit(0);
    }

    // 5. Diagnose
    diagnose();

    if (iteration < MAX_ITERATIONS) {
      log(`Will retry (${MAX_ITERATIONS - iteration} attempts remaining)`);
      log("Waiting 10s before next iteration...");
      await sleep(10_000);
    }
  }

  // Exhausted all iterations
  console.log("\n╔═══════════════════════════════════════════════╗");
  console.log("║  ESCALATE: Manual intervention required ⚠️     ║");
  console.log("╚═══════════════════════════════════════════════╝\n");
  logError(`Failed after ${MAX_ITERATIONS} iterations`);
  process.exit(1);
}

main().catch((err) => {
  logError(`Unhandled error: ${err.message}`);
  console.error(err);
  process.exit(2);
});
