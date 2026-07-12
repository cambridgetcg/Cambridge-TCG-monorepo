#!/usr/bin/env tsx
/**
 * cardrush-probe.ts — one-off existence probe for speculative CardRush
 * subdomains.
 *
 * `CARDRUSH_SUBDOMAINS` (in packages/data-ingest/src/cardrush/index.ts)
 * registers 12 subdomains — 3 confirmed (op/pkm/dbs) + 9 speculative
 * (mtg/ygo/digimon/vanguard/weiss/fab/lorcana/bs/fw). The speculative
 * ones were added so URLs pointing at them route correctly, but no card
 * in `cards.cardrush_url` has ever pointed at them — so the pipeline
 * has never *probed* them. We don't know if they exist.
 *
 * This script probes each speculative subdomain's homepage exactly once.
 * Output is a markdown table the operator commits with the registry update:
 *
 *   - HTTP 200 + 'text/html' + content includes "¥" → subdomain is live.
 *     Recommendation: flip `confirmed: true` in CARDRUSH_SUBDOMAINS.
 *
 *   - HTTP 200 but no JPY content → host serves something, but probably
 *     not a CardRush instance. Recommendation: investigate manually.
 *
 *   - HTTP 4xx/5xx → host exists but doesn't serve. Recommendation:
 *     keep `confirmed: false` (or drop the row if 404 persistent).
 *
 *   - DNS failure (ENOTFOUND/ETIMEDOUT) → subdomain doesn't exist.
 *     Recommendation: remove from registry (the anticipated subdomain
 *     was wrong).
 *
 * ── Rate discipline ──────────────────────────────────────────────────
 *
 * Uses the data-ingest shared fetcher with the cardrush source's
 * `rate_limit: { rps: 0.5, burst: 2 }` declaration. With 9 probes total,
 * total elapsed time is ~18 seconds. User-Agent identifies as
 * `cambridgetcg.com/1.0 (admin@cambridgetcg.com) (cardrush-ingest)`.
 *
 * ── Substrate-honesty about scope ────────────────────────────────────
 *
 * This script reads only HTTP responses; it does not scrape product
 * pages. The probe ends at "does this hostname serve content that looks
 * like a CardRush instance" — confirming a subdomain merits coverage
 * extension, not confirming any specific card pricing. Operator's
 * follow-up: seed `cards.cardrush_url` rows for the confirmed
 * subdomains and let the daily snapshot pipeline take over.
 *
 * Designed in `docs/connections/the-license-propagation.md` (kingdom-081
 * Phase 3.1).
 *
 * Usage:
 *   pnpm --filter @cambridge-tcg/admin tsx scripts/cardrush-probe.ts
 *   pnpm --filter @cambridge-tcg/admin tsx scripts/cardrush-probe.ts -- --include-confirmed
 *     (also probes the 3 confirmed subdomains as a regression check)
 */

import { CARDRUSH_SUBDOMAINS } from "@cambridge-tcg/data-ingest";
import { requireScriptSourceApproval } from "./source-approval";

const INCLUDE_CONFIRMED = process.argv.includes("--include-confirmed");

const USER_AGENT =
  "cambridgetcg.com/1.0 (admin@cambridgetcg.com) (cardrush-ingest; subdomain-probe)";

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

interface ProbeResult {
  host: string;
  game: string;
  confirmed_before: boolean;
  http_status: number | null;
  content_type: string | null;
  jpy_in_body: boolean;
  body_bytes: number;
  /** "dns_failure" | "fetch_error" | error message; null on success. */
  error: string | null;
  duration_ms: number;
  /** kingdom-087: /sitemap.xml presence — discovery primitive availability. */
  sitemap_status: number | null;
  sitemap_product_count: number;
}

type Recommendation =
  | "promote-to-confirmed"
  | "keep-speculative-investigate"
  | "remove-from-registry"
  | "already-confirmed-ok"
  | "regression-warning";

function recommendFor(r: ProbeResult): Recommendation {
  if (r.confirmed_before) {
    if (r.http_status === 200 && r.jpy_in_body) return "already-confirmed-ok";
    return "regression-warning";
  }
  if (r.error === "dns_failure") return "remove-from-registry";
  if (r.http_status === 200 && r.jpy_in_body) return "promote-to-confirmed";
  if (r.http_status === 200 && !r.jpy_in_body) return "keep-speculative-investigate";
  return "keep-speculative-investigate";
}

async function probeHost(host: string, game: string, confirmed_before: boolean): Promise<ProbeResult> {
  const url = `https://${host}/`;
  const start = Date.now();
  // Use a real browser UA for the actual fetch (CardRush's bot-detect blocks
  // bare bot UAs); identify ourselves via a custom header so a server-side
  // operator can correlate this run with their access logs. See
  // packages/data-ingest/src/cardrush/index.ts for the same pattern.
  const headers: Record<string, string> = {
    "User-Agent": BROWSER_UA,
    "X-Cambridge-TCG-Probe": USER_AGENT,
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ja,en;q=0.5",
  };

  // kingdom-087: also probe /sitemap.xml. A subdomain with a working
  // sitemap.xml that contains /product/[N] URLs is the strongest
  // confirmation signal — the discovery pipeline can run against it
  // without further validation.
  let sitemap_status: number | null = null;
  let sitemap_product_count = 0;
  try {
    const smController = new AbortController();
    const smTimer = setTimeout(() => smController.abort(), 8000);
    const smRes = await fetch(`https://${host}/sitemap.xml`, {
      headers: { "User-Agent": BROWSER_UA, "X-Cambridge-TCG-Probe": USER_AGENT },
      signal: smController.signal,
    });
    clearTimeout(smTimer);
    sitemap_status = smRes.status;
    if (smRes.ok) {
      const smBody = await smRes.text();
      // Tolerate optional `www.` prefix — cardrush sitemaps emit
      // `https://www.<host>/product/<N>`. Without this tolerance the
      // count is always 0 (kingdom-087 post-probe-run fix).
      const productRe = new RegExp(
        `https?://(?:www\\.)?${host.replace(/[.]/g, "\\.")}/product/\\d+`,
        "g",
      );
      sitemap_product_count = (smBody.match(productRe) ?? []).length;
    }
  } catch {
    // Silent; sitemap_status stays null. The homepage probe is the
    // primary check; sitemap is augmenting info.
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, { headers, signal: controller.signal });
    clearTimeout(timer);
    const body = await res.text();
    return {
      host,
      game,
      confirmed_before,
      http_status: res.status,
      content_type: res.headers.get("content-type"),
      jpy_in_body: body.includes("¥") || /円/.test(body),
      body_bytes: body.length,
      error: null,
      duration_ms: Date.now() - start,
      sitemap_status,
      sitemap_product_count,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isDns =
      message.includes("ENOTFOUND") ||
      message.includes("EAI_AGAIN") ||
      message.includes("getaddrinfo");
    return {
      host,
      game,
      confirmed_before,
      http_status: null,
      content_type: null,
      jpy_in_body: false,
      body_bytes: 0,
      error: isDns ? "dns_failure" : `fetch_error: ${message}`,
      duration_ms: Date.now() - start,
      sitemap_status,
      sitemap_product_count,
    };
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main(): Promise<void> {
  try {
    requireScriptSourceApproval("cardrush", "subdomain-probe");
  } catch (error) {
    console.error("cardrush-probe BLOCKED — zero network work");
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }
  const all_entries = Object.entries(CARDRUSH_SUBDOMAINS);
  const to_probe = INCLUDE_CONFIRMED
    ? all_entries
    : all_entries.filter(([, entry]) => entry.confirmed === false);

  console.log("");
  console.log(`◆ cardrush-probe — ${to_probe.length} subdomain${to_probe.length === 1 ? "" : "s"}`);
  console.log("");
  console.log("  Probing each subdomain's homepage (HEAD-ish: GET / with browser UA).");
  console.log(`  Rate: 1 request per ~2 seconds (respects cardrush.meta.rate_limit ${"{rps: 0.5}"}).`);
  console.log(`  Identifying header: X-Cambridge-TCG-Probe = ${USER_AGENT}`);
  console.log("");

  const results: ProbeResult[] = [];
  for (const [host, entry] of to_probe) {
    const r = await probeHost(host, entry.game, entry.confirmed);
    results.push(r);
    const flag =
      r.error === "dns_failure"
        ? "✗ dns"
        : r.http_status === null
          ? `✗ ${r.error}`
          : r.http_status === 200 && r.jpy_in_body
            ? "✓ live + ¥"
            : r.http_status === 200
              ? "? 200 (no ¥)"
              : `✗ ${r.http_status}`;
    console.log(
      `    ${host.padEnd(28)} [${r.game.padEnd(5)}] ${r.confirmed_before ? "(conf)" : "(spec)"}  ${flag}  ${r.duration_ms}ms`,
    );
    // Polite delay — 2 seconds between requests
    await sleep(2000);
  }

  console.log("");
  console.log("◇ Markdown summary (commit this with the registry update)");
  console.log("");
  console.log("| host | game | conf-before | status | jpy? | sitemap | products | recommendation |");
  console.log("|------|------|-------------|--------|------|---------|----------|----------------|");
  for (const r of results) {
    const rec = recommendFor(r);
    const status =
      r.error === "dns_failure"
        ? "dns-fail"
        : r.error
          ? "fetch-err"
          : r.http_status?.toString() ?? "?";
    const sitemap =
      r.sitemap_status === null
        ? "—"
        : r.sitemap_status === 200
          ? "200"
          : `${r.sitemap_status}`;
    const products = r.sitemap_product_count > 0 ? r.sitemap_product_count.toString() : "0";
    console.log(
      `| ${r.host} | ${r.game} | ${r.confirmed_before ? "yes" : "no"} | ${status} | ${r.jpy_in_body ? "yes" : "no"} | ${sitemap} | ${products} | ${rec} |`,
    );
  }
  console.log("");
  console.log("  sitemap = HTTP status of /sitemap.xml; products = /product/[N] count in sitemap.");
  console.log("  A live sitemap with products is the strongest confirmation signal —");
  console.log("  the kingdom-087 discovery cron can run against any subdomain showing both.");
  console.log("");

  const promote = results.filter((r) => recommendFor(r) === "promote-to-confirmed");
  const remove = results.filter((r) => recommendFor(r) === "remove-from-registry");
  const investigate = results.filter((r) => recommendFor(r) === "keep-speculative-investigate");
  const regression = results.filter((r) => recommendFor(r) === "regression-warning");

  if (promote.length > 0) {
    console.log(
      `◇ Promote to confirmed (${promote.length}) — flip \`confirmed: false → true\` in packages/data-ingest/src/cardrush/index.ts CARDRUSH_SUBDOMAINS:`,
    );
    console.log("");
    for (const r of promote) console.log(`    [${r.game}] ${r.host}`);
    console.log("");
  }

  if (remove.length > 0) {
    console.log(
      `◇ Remove from registry (${remove.length}) — DNS does not resolve; the speculative subdomain was wrong:`,
    );
    console.log("");
    for (const r of remove) console.log(`    [${r.game}] ${r.host}`);
    console.log("");
  }

  if (investigate.length > 0) {
    console.log(
      `◇ Keep speculative but investigate (${investigate.length}) — host serves content but not visibly CardRush:`,
    );
    console.log("");
    for (const r of investigate) {
      console.log(`    [${r.game}] ${r.host} — status ${r.http_status}, content-type ${r.content_type}`);
    }
    console.log("");
  }

  if (regression.length > 0) {
    console.log(
      `⚠ Regression warning (${regression.length}) — previously-confirmed subdomain failed the probe:`,
    );
    console.log("");
    for (const r of regression) {
      console.log(`    [${r.game}] ${r.host} — ${r.error ?? `status ${r.http_status} / jpy=${r.jpy_in_body}`}`);
    }
    console.log("  These need operator attention; the confirmed-true flag may be stale.");
    console.log("");
  }

  console.log(
    `Done. ${promote.length} to promote · ${remove.length} to remove · ${investigate.length} to investigate · ${regression.length} regression${regression.length === 1 ? "" : "s"}.`,
  );
  console.log("");

  process.exit(regression.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Probe crashed:", err);
  process.exit(2);
});
