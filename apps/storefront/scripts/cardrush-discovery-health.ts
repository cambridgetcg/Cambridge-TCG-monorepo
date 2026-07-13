#!/usr/bin/env tsx
/**
 * cardrush-discovery-health.ts — operational monitoring for the
 * cardrush discovery pipeline.
 *
 * Sixteenth in the audit family. Kingdom-087 — companion to the
 * /api/cron/discover/cardrush cron. Extended kingdom-088 with
 * per-access-mode reporting for the Bright Data unlocker.
 * Answers: *is the discovery cron running, is each confirmed
 * subdomain's coverage growing, are any subdomains stale or regressing,
 * and is the operator's proxy config in place for WAF-blocked hosts?*
 *
 * Six checks:
 *
 *   1. **Per-subdomain sitemap liveness**: HTTP-fetch /sitemap.xml on
 *      each confirmed subdomain; report status + product count. A
 *      previously-counted sitemap dropping to 0 products is the strongest
 *      regression signal. Skips the direct fetch (with a substrate-honest
 *      note) for subdomains whose access mode requires a proxy the audit
 *      itself doesn't carry — those are tested by the cron path.
 *
 *   2. **Coverage ratio**: cards_with_cardrush_url for that subdomain's
 *      game / products_in_sitemap. Substrate-honest: a low ratio means
 *      the discovery cron hasn't caught up yet (new subdomain, or capped
 *      by maxNewPerSubdomain).
 *
 *   3. **Last discovery run**: most-recent ingest_run row with
 *      source_id='cardrush-discover'. Flag staleness > 48h.
 *
 *   4. **Run trend** (last 7 runs): rows_written + rows_quarantined +
 *      errors. Drift detector — a sudden quarantine spike means upstream
 *      schema changed.
 *
 *   5. **Subdomain-vs-registry coherence**: every CARDRUSH_SUBDOMAINS
 *      entry with `confirmed: true` should appear in recent discovery
 *      runs' events. Any missing = something's wrong with the cron.
 *
 *   6. **Access-mode coherence (kingdom-088)**: bright-data-unlocker
 *      subdomains require CARDRUSH_BRIGHT_DATA_PROXY_URL. If any exist
 *      without the env set (locally OR per the last cron run's
 *      proxy_configured event), warn. role="price-only" subdomains
 *      should NOT appear in recent discovery walks; flag if they do.
 *
 * Skips gracefully when WHOLESALE_DATABASE_URL is unset (same pattern
 * as cardrush-coverage / sets-coverage).
 *
 * Run:
 *   pnpm audit:cardrush-discovery-health          # informational
 *   pnpm audit:cardrush-discovery-health --strict # exits 1 on regression
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CARDRUSH_ACQUISITION_ENABLED,
  CARDRUSH_BLOCK_REASON,
  CARDRUSH_DATA_POLICY_URL,
  CARDRUSH_SUBDOMAINS,
} from "@cambridge-tcg/data-ingest";

const ADMIN_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const STRICT = process.argv.includes("--strict");

function loadEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

const envFile = loadEnvFile(join(ADMIN_DIR, ".env.local"));
const WHOLESALE_DATABASE_URL =
  process.env.WHOLESALE_DATABASE_URL ?? envFile.WHOLESALE_DATABASE_URL ?? "";
const CARDRUSH_BRIGHT_DATA_PROXY_URL =
  process.env.CARDRUSH_BRIGHT_DATA_PROXY_URL ??
  envFile.CARDRUSH_BRIGHT_DATA_PROXY_URL ??
  "";

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

interface Finding {
  check: number;
  severity: "fail" | "warn";
  message: string;
}

const findings: Finding[] = [];
const warn = (check: number, message: string) =>
  findings.push({ check, severity: "warn", message });
const fail = (check: number, message: string) =>
  findings.push({ check, severity: "fail", message });

interface SitemapHealth {
  host: string;
  game: string;
  confirmed: boolean;
  access: "direct" | "bright-data-unlocker" | "blocked";
  role: "catalog+price" | "price-only" | "blocked";
  http_status: number | null;
  product_count: number;
  error: string | null;
  /** When true, the audit deliberately did not direct-fetch this host
   *  because it requires a proxy. The cron path (which has the proxy)
   *  is the authoritative liveness check for these. */
  skipped_proxy_required: boolean;
}

async function probeSitemap(host: string): Promise<{
  http_status: number | null;
  product_count: number;
  error: string | null;
}> {
  if (!CARDRUSH_ACQUISITION_ENABLED) {
    throw new Error(CARDRUSH_BLOCK_REASON);
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(`https://${host}/sitemap.xml`, {
      headers: { "User-Agent": BROWSER_UA },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      return { http_status: res.status, product_count: 0, error: null };
    }
    const body = await res.text();
    const productRe = new RegExp(
      `https?://(?:www\\.)?${host.replace(/[.]/g, "\\.")}/product/\\d+`,
      "g",
    );
    const product_count = (body.match(productRe) ?? []).length;
    return { http_status: res.status, product_count, error: null };
  } catch (err) {
    return {
      http_status: null,
      product_count: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function main(): Promise<void> {
  if (!CARDRUSH_ACQUISITION_ENABLED) {
    console.log("CardRush discovery is disabled pending a formal partnership.");
    console.log(`Policy: ${CARDRUSH_DATA_POLICY_URL}`);
    return;
  }
  console.log("");
  console.log("◆ cardrush-discovery-health — operational monitoring for the discovery cron");
  console.log("");

  const confirmedEntries = Object.entries(CARDRUSH_SUBDOMAINS).filter(
    ([, e]) => e.confirmed,
  );

  // ── Check 1: per-subdomain sitemap liveness ───────────────────────
  console.log(`◇ Check 1 — sitemap liveness (${confirmedEntries.length} confirmed subdomains)`);
  console.log("");
  const sitemapHealth: SitemapHealth[] = [];
  for (const [host, entry] of confirmedEntries) {
    // kingdom-088: bright-data-unlocker subdomains are WAF-blocked on
    // direct egress. The audit doesn't carry the operator's proxy
    // (substrate-honest: credentials belong in the cron environment,
    // not the admin one). Skip the direct probe with a visible note;
    // Check 4 (run trend) is the authoritative source of truth for
    // these hosts.
    if (entry.access === "bright-data-unlocker") {
      const sh: SitemapHealth = {
        host,
        game: entry.game,
        confirmed: entry.confirmed,
        access: entry.access,
        role: entry.role,
        http_status: null,
        product_count: 0,
        error: null,
        skipped_proxy_required: true,
      };
      sitemapHealth.push(sh);
      console.log(
        `    ${host.padEnd(28)} [${entry.game.padEnd(5)}]  skipped — access=bright-data-unlocker (cron is authoritative)`,
      );
      continue;
    }

    const probe = await probeSitemap(host);
    const sh: SitemapHealth = {
      host,
      game: entry.game,
      confirmed: entry.confirmed,
      access: entry.access,
      role: entry.role,
      skipped_proxy_required: false,
      ...probe,
    };
    sitemapHealth.push(sh);
    const status =
      sh.error
        ? `ERROR: ${sh.error.slice(0, 50)}`
        : sh.http_status === 200
          ? `${sh.product_count} products`
          : `HTTP ${sh.http_status}`;
    console.log(`    ${sh.host.padEnd(28)} [${sh.game.padEnd(5)}]  ${status}`);
    if (sh.error || sh.http_status !== 200) {
      fail(
        1,
        `${sh.host}: sitemap unreachable (${sh.error ?? `HTTP ${sh.http_status}`}); discovery cron will skip this subdomain`,
      );
    } else if (sh.product_count === 0) {
      warn(
        1,
        `${sh.host}: sitemap reachable but 0 products — possibly index-form sitemap or upstream regression`,
      );
    }
    // Throttle 2s between subdomains to respect 0.5 rps budget
    await new Promise((r) => setTimeout(r, 2000));
  }
  console.log("");

  // ── Check 6: access-mode coherence (kingdom-088) ───────────────────
  // Surface this before the DB checks so it runs regardless of DB status.
  console.log(`◇ Check 6 — access-mode coherence (kingdom-088)`);
  const accessCounts: Record<string, string[]> = {
    direct: [],
    "bright-data-unlocker": [],
    blocked: [],
  };
  const roleCounts: Record<string, string[]> = {
    "catalog+price": [],
    "price-only": [],
    blocked: [],
  };
  for (const [host, entry] of Object.entries(CARDRUSH_SUBDOMAINS)) {
    accessCounts[entry.access]?.push(host);
    roleCounts[entry.role]?.push(host);
  }
  console.log(`    by access: direct=${accessCounts.direct.length}  unlocker=${accessCounts["bright-data-unlocker"].length}  blocked=${accessCounts.blocked.length}`);
  console.log(`    by role:   catalog+price=${roleCounts["catalog+price"].length}  price-only=${roleCounts["price-only"].length}  blocked=${roleCounts.blocked.length}`);
  const unlockerHosts = accessCounts["bright-data-unlocker"];
  if (unlockerHosts.length > 0) {
    const proxyHere = Boolean(CARDRUSH_BRIGHT_DATA_PROXY_URL);
    console.log(
      `    bright-data-unlocker hosts: ${unlockerHosts.join(", ")} (proxy configured locally: ${proxyHere ? "yes" : "no"})`,
    );
    if (!proxyHere) {
      warn(
        6,
        "CARDRUSH_BRIGHT_DATA_PROXY_URL not set locally — admin audit can't probe these directly; verify the cron env (Vercel project: wholesale) carries the proxy URL",
      );
    }
  }
  console.log("");

  // ── DB-dependent checks (2-5) ─────────────────────────────────────
  if (!WHOLESALE_DATABASE_URL) {
    console.log(
      "  [checks 2-5] skipped — WHOLESALE_DATABASE_URL not set (set it for DB-side checks)",
    );
    console.log("");
    finalReport();
    return;
  }

  let client: Awaited<ReturnType<typeof import("@cambridge-tcg/db").createDb>>["client"];
  let close: Awaited<ReturnType<typeof import("@cambridge-tcg/db").createDb>>["close"];
  try {
    const { createDb } = await import("@cambridge-tcg/db");
    ({ client, close } = createDb({ url: WHOLESALE_DATABASE_URL }));
  } catch (err) {
    console.log(`  [checks 2-5] skipped — DB setup failed (${err instanceof Error ? err.message : String(err)})`);
    console.log("");
    finalReport();
    return;
  }

  try {
    // ── Check 2: coverage ratio (cards.cardrush_url / sitemap products) ─
    console.log(`◇ Check 2 — coverage ratio (cards with cardrush_url ÷ products in sitemap)`);
    console.log("");
    for (const sh of sitemapHealth) {
      if (sh.skipped_proxy_required) {
        // Substrate-honest about absence: we can't measure the ratio
        // for a host we didn't probe. Report cards count alone so the
        // operator sees what's in the DB.
        const rows = await client<{ n: number }[]>`
          SELECT COUNT(*)::int AS n
            FROM cards c
            JOIN games g ON g.id = c.game_id
           WHERE g.code = ${sh.game}
             AND c.cardrush_url LIKE ${`%${sh.host}/product/%`}
        `;
        const cardCount = rows[0]?.n ?? 0;
        console.log(
          `    ? ${sh.host.padEnd(28)} ${cardCount.toLocaleString().padStart(6)} / ?      (sitemap not probed; access=${sh.access})`,
        );
        continue;
      }
      if (sh.product_count === 0) continue;
      const rows = await client<{ n: number }[]>`
        SELECT COUNT(*)::int AS n
          FROM cards c
          JOIN games g ON g.id = c.game_id
         WHERE g.code = ${sh.game}
           AND c.cardrush_url LIKE ${`%${sh.host}/product/%`}
      `;
      const cardCount = rows[0]?.n ?? 0;
      const ratio = cardCount / sh.product_count;
      const pct = (ratio * 100).toFixed(1);
      const tag = ratio >= 0.95 ? "✓" : ratio >= 0.5 ? "~" : "✗";
      console.log(
        `    ${tag} ${sh.host.padEnd(28)} ${cardCount.toLocaleString().padStart(6)} / ${sh.product_count.toLocaleString().padStart(6)} (${pct}%)`,
      );
      if (ratio < 0.5) {
        warn(
          2,
          `${sh.host}: coverage ${pct}% — discovery cron hasn't caught up (newly confirmed subdomain, or capped by maxNewPerSubdomain)`,
        );
      }
    }
    console.log("");

    // ── Check 3: most-recent discovery run ────────────────────────
    console.log(`◇ Check 3 — most-recent cardrush-discover ingest_run`);
    const recentRun = await client<
      Array<{
        id: number;
        triggered_at: string;
        finished_at: string | null;
        status: string;
        rows_read: number;
        rows_written: number;
        rows_quarantined: number;
        errors: number;
      }>
    >`
      SELECT id, triggered_at::text, finished_at::text, status,
             rows_read, rows_written, rows_quarantined, errors
        FROM ingest_run
       WHERE source_id = 'cardrush-discover'
       ORDER BY triggered_at DESC
       LIMIT 1
    `;
    if (recentRun.length === 0) {
      warn(3, "no cardrush-discover ingest_run rows yet — cron has never fired (deploy first)");
      console.log("    no runs yet");
    } else {
      const r = recentRun[0];
      const ageMs = Date.now() - new Date(r.triggered_at).getTime();
      const ageHours = Math.round(ageMs / (1000 * 60 * 60) * 10) / 10;
      console.log(`    id=${r.id} status=${r.status} triggered=${r.triggered_at} age=${ageHours}h`);
      console.log(
        `    rows_read=${r.rows_read} rows_written=${r.rows_written} rows_quarantined=${r.rows_quarantined} errors=${r.errors}`,
      );
      if (ageHours > 48) {
        fail(3, `last cardrush-discover run was ${ageHours}h ago (>48h threshold) — cron may have stopped`);
      }
      if (r.status === "failed") {
        fail(3, `last cardrush-discover run finished as 'failed'`);
      }
    }
    console.log("");

    // ── Check 4: run trend (last 7 runs) ──────────────────────────
    console.log(`◇ Check 4 — last 7 cardrush-discover runs (trend)`);
    const trend = await client<
      Array<{
        triggered_at: string;
        status: string;
        rows_written: number;
        rows_quarantined: number;
        errors: number;
      }>
    >`
      SELECT triggered_at::text, status, rows_written, rows_quarantined, errors
        FROM ingest_run
       WHERE source_id = 'cardrush-discover'
       ORDER BY triggered_at DESC
       LIMIT 7
    `;
    if (trend.length === 0) {
      console.log("    no runs yet");
    } else {
      for (const r of trend) {
        console.log(
          `    ${r.triggered_at}  ${r.status.padEnd(8)} written=${String(r.rows_written).padStart(4)} quarantined=${String(r.rows_quarantined).padStart(3)} errors=${r.errors}`,
        );
      }
      const totalQuarantined = trend.reduce((a, r) => a + r.rows_quarantined, 0);
      const totalErrors = trend.reduce((a, r) => a + r.errors, 0);
      if (totalQuarantined > 100) {
        warn(
          4,
          `${totalQuarantined} quarantined rows across last 7 runs — possible upstream title-format change`,
        );
      }
      if (totalErrors > 50) {
        warn(4, `${totalErrors} errors across last 7 runs — operator should investigate`);
      }
    }
    console.log("");

    // ── Check 5: registry-vs-runs coherence ───────────────────────
    console.log(`◇ Check 5 — registry-vs-runs coherence`);
    if (recentRun.length === 0) {
      console.log("    skipped — no recent run to inspect events from");
    } else {
      const runRow = await client<Array<{ events: unknown }>>`
        SELECT events FROM ingest_run WHERE id = ${recentRun[0].id}
      `;
      const events = (runRow[0]?.events ?? []) as Array<{ host?: string; kind: string }>;
      const hostsInEvents = new Set(
        events
          .filter((e) => typeof e.host === "string")
          .map((e) => e.host as string),
      );
      const missing = confirmedEntries
        .map(([h]) => h)
        .filter((h) => !hostsInEvents.has(h));
      console.log(`    confirmed: ${confirmedEntries.length} subdomains`);
      console.log(`    hosts referenced in last run's events: ${hostsInEvents.size}`);
      if (missing.length > 0) {
        warn(
          5,
          `confirmed subdomains not walked in last run: ${missing.join(", ")} — possible registry-vs-runner drift`,
        );
      } else {
        console.log(`    ✓ every confirmed subdomain was walked in the last run`);
      }
    }
    console.log("");

    await close();
  } catch (err) {
    await close().catch(() => {});
    console.log(`  Crashed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(2);
  }

  finalReport();
}

function finalReport(): void {
  const fails = findings.filter((f) => f.severity === "fail");
  const warns = findings.filter((f) => f.severity === "warn");

  if (fails.length === 0 && warns.length === 0) {
    console.log("✓ cardrush discovery pipeline is healthy");
    console.log("");
    process.exit(0);
  }

  if (fails.length > 0) {
    console.log(`✗ ${fails.length} failure${fails.length === 1 ? "" : "s"}:`);
    for (const f of fails) console.log(`    [check ${f.check}] ${f.message}`);
    console.log("");
  }
  if (warns.length > 0) {
    console.log(`⚠ ${warns.length} warning${warns.length === 1 ? "" : "s"}:`);
    for (const w of warns) console.log(`    [check ${w.check}] ${w.message}`);
    console.log("");
  }

  if (STRICT && fails.length > 0) process.exit(1);
  process.exit(0);
}

main().catch((err) => {
  console.error("Audit crashed:", err);
  process.exit(2);
});
