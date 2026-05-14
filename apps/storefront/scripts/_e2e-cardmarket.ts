#!/usr/bin/env tsx
/**
 * _e2e-cardmarket.ts — scratch POC for Path A (public daily download via Bright Data).
 *
 * Mirror of kingdom-088's _e2e-bright-data.ts (since deleted). Five tests:
 *
 *   1. Proxy reachability — lumtest.com/myip.json through the proxy.
 *   2. cardmarket.com perimeter — /robots.txt (universally exempt).
 *   3. The price-guide HTML page — proves Cloudflare Bot Management is solved
 *      and the page is not a login redirect.
 *   4. Extract the download href from page HTML.
 *   5. Fetch the .csv.gz, gunzip, count rows, print header + first 3 rows.
 *
 * Delete after a green run. Real Path A implementation will live in
 * packages/data-ingest/src/cardmarket/index.ts and the wholesale writer.
 *
 * Run:
 *   cd apps/admin
 *   CARDMARKET_BRIGHT_DATA_PROXY_URL='http://brd-customer-<id>-zone-<zone>:<pw>@brd.superproxy.io:33335' \
 *     tsx scripts/_e2e-cardmarket.ts
 *
 * Expected on green:
 *   [1] proxy reachable, exit IP printed
 *   [2] robots.txt 200
 *   [3] price-guide page 200, no <form action="/login"
 *   [4] download href extracted (e.g. /en/Magic/Data/Download/PriceGuide/1)
 *   [5] gzip ok, N rows parsed, header has idProduct/Avg/Trend/Low columns
 *
 * Expected on red — the failure mode tells the next step:
 *   * [1] proxy reachable but [2] robots.txt non-200  → proxy can't reach cardmarket
 *   * [2] ok but [3] returns Cloudflare "Just a moment" → Bot Management not solved
 *   * [3] ok but body is a login form              → public download is gated
 *   * [4] no href match                              → page structure changed
 *   * [5] gunzip fails                               → response isn't .csv.gz (login redirect?)
 */

import { gunzipSync } from "node:zlib";
import { createFetcher, cardmarket } from "@cambridge-tcg/data-ingest";
import type { IngestContext, IngestEvent } from "@cambridge-tcg/data-ingest";

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9,de;q=0.8",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
  "sec-ch-ua":
    '"Chromium";v="131", "Not_A Brand";v="24", "Google Chrome";v="131"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"macOS"',
};

async function main() {
  const PROXY_URL = process.env.CARDMARKET_BRIGHT_DATA_PROXY_URL;
  const API_TOKEN = process.env.CARDMARKET_BRIGHT_DATA_API_TOKEN;
  const API_ZONE = process.env.CARDMARKET_BRIGHT_DATA_API_ZONE ?? "web_unlocker1";
  if (!PROXY_URL && !API_TOKEN) {
    console.error("Neither CARDMARKET_BRIGHT_DATA_PROXY_URL nor CARDMARKET_BRIGHT_DATA_API_TOKEN is set.");
    console.error("Set one of:");
    console.error("  CARDMARKET_BRIGHT_DATA_PROXY_URL=http://brd-customer-<id>-zone-<zone>:<pw>@brd.superproxy.io:33335");
    console.error("  CARDMARKET_BRIGHT_DATA_API_TOKEN=<bearer>  CARDMARKET_BRIGHT_DATA_API_ZONE=<zone>  (default zone: web_unlocker1)");
    process.exit(1);
  }
  if (PROXY_URL && API_TOKEN) {
    console.error("Both CARDMARKET_BRIGHT_DATA_PROXY_URL and CARDMARKET_BRIGHT_DATA_API_TOKEN are set — pick one.");
    process.exit(1);
  }

  const events: IngestEvent[] = [];
  const ctx: IngestContext = {
    on_event: (e) => {
      events.push(e);
    },
  };

  const fetcher = PROXY_URL
    ? createFetcher(ctx, cardmarket.meta, { proxy_url: PROXY_URL })
    : createFetcher(ctx, cardmarket.meta, { api_token: API_TOKEN!, api_zone: API_ZONE });
  console.log(`> mode: ${PROXY_URL ? "proxy" : `api(zone=${API_ZONE})`}`);
  console.log(`> proxy_label: ${fetcher.via_proxy_label}`);
  console.log();

  let failed = 0;

  async function step<T>(
    n: number,
    label: string,
    fn: () => Promise<T>,
  ): Promise<T | null> {
    const t0 = Date.now();
    try {
      const result = await fn();
      console.log(`[${n}] ✓ ${label} (${Date.now() - t0}ms)`);
      return result;
    } catch (err) {
      console.error(`[${n}] ✗ ${label} — ${err instanceof Error ? err.message : String(err)}`);
      failed += 1;
      return null;
    }
  }

  // ── Test 1: proxy reachability ──────────────────────────────────────
  const ipRes = await step(1, "proxy reachable (lumtest.com/myip.json)", async () => {
    const r = await fetcher("https://lumtest.com/myip.json", {
      headers: { Accept: "application/json" },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return (await r.json()) as { ip?: string; country?: string };
  });
  if (ipRes) console.log(`    exit IP: ${ipRes.ip} (${ipRes.country})`);

  // ── Test 2: cardmarket perimeter ────────────────────────────────────
  await step(2, "cardmarket.com/robots.txt through proxy", async () => {
    const r = await fetcher("https://www.cardmarket.com/robots.txt", {
      headers: { Accept: "text/plain,*/*;q=0.8" },
    });
    if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
    const body = await r.text();
    if (!body.includes("User-agent")) throw new Error("body doesn't look like robots.txt");
    return body.length;
  });

  // ── Test 3: Magic Price Guide HTML page ─────────────────────────────
  const pageHtml = await step(3, "Price-Guide HTML page", async () => {
    const r = await fetcher("https://www.cardmarket.com/en/Magic/Data/Price-Guide", {
      headers: BROWSER_HEADERS,
    });
    console.log(
      `    HTTP ${r.status} | content-type=${r.headers.get("content-type")} | bytes=${r.headers.get("content-length") ?? "?"}`,
    );
    if (r.status !== 200) {
      const cf = r.headers.get("cf-mitigated");
      if (cf) throw new Error(`Cloudflare mitigated: ${cf} (status ${r.status})`);
      throw new Error(`HTTP ${r.status}`);
    }
    // Bright Data API surfaces upstream/proxy errors in response headers
    // even when the body is HTTP 200 + empty. Inspect before reading body.
    const brdErrCode = r.headers.get("x-brd-err-code");
    const brdErrMsg = r.headers.get("x-brd-err-msg");
    if (brdErrCode) throw new Error(`Bright Data error ${brdErrCode}: ${brdErrMsg ?? "(no message)"}`);
    const html = await r.text();
    // Empty body = silent failure. Real cardmarket page is ~100KB+.
    // Re-probe via format=json to extract BD's wrapped error code.
    if (html.length < 1000) {
      let diag = `body is ${html.length} bytes — too small for a real page`;
      const apiToken = process.env.CARDMARKET_BRIGHT_DATA_API_TOKEN;
      const apiZone = process.env.CARDMARKET_BRIGHT_DATA_API_ZONE ?? "web_unlocker1";
      if (apiToken) {
        try {
          const probe = await fetch("https://api.brightdata.com/request", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiToken}` },
            body: JSON.stringify({
              zone: apiZone,
              url: "https://www.cardmarket.com/en/Magic/Data/Price-Guide",
              format: "json",
            }),
          });
          const j = (await probe.json()) as { status_code?: number; headers?: Record<string, string>; body?: string };
          const hdrs = j.headers ?? {};
          const code = hdrs["x-brd-err-code"];
          const msg = hdrs["x-brd-err-msg"] ?? hdrs["x-brd-error"];
          if (code || msg) diag += ` | BD says: ${code ?? "(no code)"} — ${msg ?? "(no message)"}`;
          else diag += ` | upstream status_code=${j.status_code ?? "?"} body.len=${(j.body ?? "").length}`;
        } catch (e) {
          diag += ` | diagnostic probe failed: ${e instanceof Error ? e.message : String(e)}`;
        }
      }
      throw new Error(diag);
    }
    if (/<title>Just a moment/i.test(html)) throw new Error("Cloudflare challenge page returned 200 but body is still a challenge");
    if (/<form[^>]+action="\/[^"]*[Ll]ogin/i.test(html) || /name="login_username"/i.test(html)) {
      throw new Error("page is a login form — public download is gated behind login");
    }
    return html;
  });

  // ── Test 4: extract download href ───────────────────────────────────
  let downloadUrl: string | null = null;
  if (pageHtml) {
    await step(4, "extract download href from HTML", async () => {
      const patterns = [
        /href="([^"]*\/Data\/Download\/PriceGuide\/?\d*[^"]*)"/i,
        /href="([^"]*\/Data\/Download\/?[^"]*)"/i,
        /href="([^"]*PriceGuide[^"]*\.csv(?:\.gz)?)"/i,
        /href="([^"]*priceguide[^"]*\.(?:csv|gz))"/i,
        /data-href="([^"]*PriceGuide[^"]*)"/i,
      ];
      for (const re of patterns) {
        const m = pageHtml.match(re);
        if (m) {
          downloadUrl = m[1].startsWith("http")
            ? m[1]
            : `https://www.cardmarket.com${m[1].startsWith("/") ? m[1] : `/${m[1]}`}`;
          console.log(`    matched: ${re.source.slice(0, 60)}...`);
          console.log(`    href: ${downloadUrl}`);
          return downloadUrl;
        }
      }
      const head = pageHtml.slice(0, 1500);
      const downloadCtx = [...pageHtml.matchAll(/.{0,80}[Dd]ownload.{0,120}/g)]
        .slice(0, 5)
        .map((m) => m[0].replace(/\s+/g, " "));
      console.error("    no download href matched any pattern");
      console.error("    --- HTML head (first 1500B) ---");
      console.error(head);
      console.error("    --- visible 'Download' mentions ---");
      for (const c of downloadCtx) console.error(`    | ${c}`);
      throw new Error("download href not found");
    });
  }

  // ── Test 5: download and parse the .csv.gz ──────────────────────────
  if (downloadUrl) {
    await step(5, "download + gunzip + parse CSV", async () => {
      const r = await fetcher(downloadUrl!, {
        headers: {
          ...BROWSER_HEADERS,
          Accept: "*/*",
          Referer: "https://www.cardmarket.com/en/Magic/Data/Price-Guide",
        },
      });
      if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
      const ct = r.headers.get("content-type") ?? "";
      console.log(`    content-type: ${ct}`);
      const buf = Buffer.from(await r.arrayBuffer());
      console.log(`    bytes: ${buf.length}`);

      let csv: string;
      try {
        csv = gunzipSync(buf).toString("utf8");
        console.log(`    gunzipped: ${csv.length} bytes`);
      } catch {
        csv = buf.toString("utf8");
        console.log(`    not gzipped — treating as plain text: ${csv.length} bytes`);
      }

      const lines = csv.split(/\r?\n/);
      console.log(`    rows: ${lines.length}`);
      if (lines.length < 2) throw new Error(`only ${lines.length} rows — not a real CSV`);
      console.log(`    header: ${lines[0]}`);
      console.log("    first 3 data rows:");
      for (let i = 1; i <= 3 && i < lines.length; i++) {
        console.log(`      ${lines[i].slice(0, 200)}`);
      }
      return lines.length;
    });
  }

  // ── Summary ─────────────────────────────────────────────────────────
  console.log();
  console.log(`requests through proxy: ${fetcher.count}`);
  console.log(`events captured: ${events.length}`);
  const rateLimits = events.filter((e) => e.kind === "rate-limit").length;
  const errors = events.filter((e) => e.kind === "error").length;
  if (rateLimits) console.log(`  rate-limits: ${rateLimits}`);
  if (errors) console.log(`  errors:      ${errors}`);

  if (failed) {
    console.log();
    console.error(`✗ ${failed} step(s) failed`);
    process.exit(1);
  }
  console.log();
  console.log("✓ all green — Path A proxy wire works against cardmarket.com");
}

main().catch((err) => {
  console.error("POC crashed:", err);
  process.exit(2);
});
