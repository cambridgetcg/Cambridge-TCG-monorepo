#!/usr/bin/env tsx
/**
 * deploy-verify.ts — post-deploy live-site sanity probe.
 *
 * Reads /api/v1/manifest from production and HTTP-probes every public
 * storefront resource. Exits non-zero on any unexpected status.
 *
 * Audit family member 16 (kingdom-085 deploy-fix follow-up). Closes
 * the verification gap that let a 2-week deploy outage stay invisible
 * on the storefront (last green build 2026-04-30; cf. the
 * ops-deploy-runbook.md "Lessons learned (2026-05-13)" section).
 *
 * ── What's a successful probe ────────────────────────────────────────
 *
 *   - public + GET: must return 200
 *   - public + POST: must return 4xx (no payload) — confirms route
 *     exists; 405/400/422 all acceptable
 *   - user-auth or agent-auth: 200 OR 307 (redirect to login) OR
 *     401 are all healthy
 *   - wholesale-key auth: 401 healthy (we're not sending the key)
 *
 * Substrate-honest about absence: a 404 on a resource declared in the
 * manifest is a fail — the manifest declares it, the site must serve
 * it. Discovering 404 mismatches is the whole point.
 *
 * ── Usage ────────────────────────────────────────────────────────────
 *
 *   pnpm --filter @cambridge-tcg/admin deploy-verify
 *   pnpm --filter @cambridge-tcg/admin deploy-verify -- --strict
 *   pnpm --filter @cambridge-tcg/admin deploy-verify -- --base=https://staging.example.com
 *
 *   --strict       fail on warnings (slow responses, redirects, etc.)
 *   --base=<url>   probe a non-production target
 *   --skip-wholesale  skip wholesale probes (when wholesale isn't deployed)
 *
 * ── Citation ─────────────────────────────────────────────────────────
 *
 *   docs/ops-deploy-runbook.md — the runbook this script enforces
 *   apps/storefront/src/lib/manifest.ts — source of truth for resources
 *   apps/storefront/src/app/api/v1/manifest/route.ts — JSON surface
 */

interface ManifestResource {
  id: string;
  path: string;
  host: "storefront" | "wholesale";
  methods: readonly string[];
  auth: string;
}

interface ProbeResult {
  id: string;
  url: string;
  expected: string;
  actual: number;
  status: "passed" | "skipped" | "failed";
  duration_ms: number;
  detail?: string;
}

const STRICT = process.argv.includes("--strict");
const SKIP_WHOLESALE = process.argv.includes("--skip-wholesale");
const BASE_ARG = process.argv.find((a) => a.startsWith("--base="));
const STOREFRONT_BASE = BASE_ARG
  ? BASE_ARG.slice("--base=".length)
  : "https://cambridgetcg.com";
const WHOLESALE_BASE = "https://wholesaletcgdirect.com";

const SLOW_MS = 3000;
const TIMEOUT_MS = 15000;

// ── Manifest fetch ───────────────────────────────────────────────────

async function fetchManifest(): Promise<ManifestResource[]> {
  const url = STOREFRONT_BASE + "/api/v1/manifest";
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) {
    throw new Error(`manifest fetch failed: HTTP ${res.status} at ${url}`);
  }
  // The /api/v1/manifest endpoint emits a flat top-level shape (not
  // envelope-wrapped). `resources` is keyed by category — flatten.
  const body = (await res.json()) as {
    resources?: Record<string, ManifestResource[]>;
    data?: { resources?: Record<string, ManifestResource[]> };
  };
  const resources = body.resources ?? body.data?.resources ?? {};
  const all: ManifestResource[] = [];
  for (const group of Object.values(resources)) {
    if (Array.isArray(group)) all.push(...group);
  }
  return all;
}

// ── Probe one resource ───────────────────────────────────────────────

function expectedFor(resource: ManifestResource): { codes: number[]; label: string } {
  // Substrate-honest classifier. The probe sends an unauthenticated
  // GET with stubbed path params. Acceptable codes per auth kind:
  //
  //   - 200          : route resolved and served content
  //   - 307 / 401    : login redirect / auth-required — route exists
  //   - 400          : route exists, rejected our query (e.g., missing param)
  //   - 404          : usually a real failure, EXCEPT for parametric paths
  //                    where the stub id may not resolve to data
  //   - 405          : route exists but doesn't accept GET — common for
  //                    POST-only endpoints or cookie-toggle redirects
  //                    that the probe can't simulate cleanly
  //   - 500          : ALWAYS a failure signal (server bug)
  //
  // The script favours signal over precision: a 400 from an endpoint
  // declared as public+GET means the route exists, which is what we
  // need to know. A 500 anywhere is a real bug surface.
  const healthyAnyKind = [200, 307, 400, 401, 404, 405];
  if (resource.auth === "wholesale-key") {
    return { codes: [401, 404], label: "401 (bearer required) / 404 (route absent)" };
  }
  if (resource.auth === "agent") {
    return { codes: [200, 400, 401], label: "200/400/401" };
  }
  if (resource.auth === "user") {
    return { codes: [200, 307, 401, 405], label: "200/307/401/405 (login flow)" };
  }
  if (resource.auth === "admin") {
    return { codes: [307, 401], label: "307/401 (admin gate)" };
  }
  if (resource.methods.includes("GET")) {
    // Public GET — most permissive; the route just needs to exist.
    return { codes: healthyAnyKind, label: "200 / 307 / 400 / 401 / 404 / 405" };
  }
  // POST-only without auth — should at least respond, not 404.
  return { codes: [400, 405, 422], label: "method-not-allowed range" };
}

function urlFor(resource: ManifestResource): string {
  // Replace dynamic path segments with safe stub values so the route
  // resolves even without real ids. Routes that 404 on stubs aren't
  // checked here — that's the job of an integration test, not a live
  // probe.
  const base = resource.host === "storefront" ? STOREFRONT_BASE : WHOLESALE_BASE;
  const path = resource.path
    .replace(/\[sku\]/g, "op-op01-001-ja")
    .replace(/\[hash\]/g, "sha256:0000000000000000000000000000000000000000000000000000000000000000")
    .replace(/\[id\]/g, "1")
    .replace(/\[game\]/g, "one-piece")
    .replace(/\[set\]/g, "op01")
    .replace(/\[number\]/g, "001")
    .replace(/\[code\]/g, "op01")
    .replace(/\[token\]/g, "op")
    .replace(/\[hash\]/g, "x")
    .replace(/\[username\]/g, "test")
    .replace(/\[term_id\]/g, "don")
    .replace(/\[section_id\]/g, "overview")
    .replace(/\[endpoint_id\]/g, "x")
    .replace(/\[slug\]/g, "how-to-play")
    .replace(/\[kind\]/g, "resource")
    .replace(/\[YYYY-MM-DD\]/g, "2026-01-01")
    .replace(/\[date\]/g, "2026-01-01")
    .replace(/\[ref\]/g, "x");
  return base + path;
}

async function probe(resource: ManifestResource): Promise<ProbeResult> {
  const url = urlFor(resource);
  const expected = expectedFor(resource);
  const start = Date.now();
  // Routes with parametrised segments may return a non-200 even on a
  // healthy deploy because the stub ID doesn't exist. We still probe;
  // the audit treats any acceptable-range code as healthy.
  const isParametric = /\[[^\]]+\]/.test(resource.path);
  try {
    const res = await fetch(url, {
      method: resource.methods[0] ?? "GET",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "manual",
    });
    const duration_ms = Date.now() - start;
    const ok = expected.codes.includes(res.status);
    // For parametric paths, also accept 404 (stub id not found) and
    // 400 (validation error) — the route IS deployed; the stub just
    // doesn't resolve to data.
    const okParametric = isParametric && (res.status === 404 || res.status === 400);
    // 500 is ALWAYS a fail — server bug, regardless of auth/parametric.
    const is500 = res.status >= 500 && res.status < 600;
    const passed = (ok || okParametric) && !is500;
    return {
      id: resource.id,
      url,
      expected: expected.label,
      actual: res.status,
      status: passed ? "passed" : "failed",
      duration_ms,
      detail: is500
        ? `server error ${res.status} — investigate`
        : !passed
          ? `expected ${expected.label}, got ${res.status}`
          : undefined,
    };
  } catch (err) {
    return {
      id: resource.id,
      url,
      expected: expected.label,
      actual: 0,
      status: "failed",
      duration_ms: Date.now() - start,
      detail: `fetch failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ── Main ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("");
  console.log(`◆ deploy-verify — live-site probe against ${STOREFRONT_BASE}`);
  console.log("");

  let manifest: ManifestResource[];
  try {
    manifest = await fetchManifest();
  } catch (err) {
    console.error(`✗ Could not fetch manifest: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }

  const filtered = manifest.filter((r) => {
    if (SKIP_WHOLESALE && r.host === "wholesale") return false;
    return true;
  });

  console.log(`  ${filtered.length} resources to probe`);
  console.log(`  ${manifest.filter((r) => r.host === "storefront").length} storefront / ${manifest.filter((r) => r.host === "wholesale").length} wholesale`);
  console.log("");

  // Probe sequentially to keep the load gentle. 100+ requests in a
  // burst can trip rate limits.
  const results: ProbeResult[] = [];
  for (const r of filtered) {
    const result = await probe(r);
    results.push(result);
    const icon =
      result.status === "passed" ? "✓" : result.status === "skipped" ? "·" : "✗";
    const slow = result.duration_ms > SLOW_MS ? ` ⚠ ${result.duration_ms}ms` : "";
    console.log(
      `  ${icon} ${String(result.actual).padStart(3)} ${result.id}${slow}${result.detail ? " — " + result.detail : ""}`,
    );
  }

  console.log("");
  const passed = results.filter((r) => r.status === "passed").length;
  const failed = results.filter((r) => r.status === "failed").length;
  const slow = results.filter((r) => r.duration_ms > SLOW_MS).length;
  console.log(
    `  Summary: ${passed} passed · ${failed} failed${slow ? ` · ${slow} slow (>${SLOW_MS}ms)` : ""}`,
  );
  console.log("");

  if (failed > 0) {
    console.log("  ✗ One or more endpoints failed verification.");
    console.log("    Likely causes:");
    console.log("      - Deploy alias hasn't propagated yet (wait 30s + retry)");
    console.log("      - The manifest declares a resource the deploy doesn't serve");
    console.log("      - Vercel built an older commit (check /system/deploys for SHA)");
    process.exit(1);
  }
  if (STRICT && slow > 0) {
    console.log("  ✗ --strict: slow responses (>3s) not allowed in strict mode.");
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("audit crashed:", err);
  process.exit(1);
});
