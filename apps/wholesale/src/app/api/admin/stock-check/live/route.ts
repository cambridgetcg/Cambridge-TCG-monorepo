import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import * as cheerio from "cheerio";
import {
  CARDRUSH_ACQUISITION_ENABLED,
  CARDRUSH_BLOCK_REASON,
  CARDRUSH_DATA_POLICY_URL,
} from "@cambridge-tcg/data-ingest";

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 2000;
const INTER_REQUEST_DELAY_MS = 500;

const HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept-Language": "ja",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url: string): Promise<string> {
  if (!CARDRUSH_ACQUISITION_ENABLED) {
    throw new Error(CARDRUSH_BLOCK_REASON);
  }
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1);
      await sleep(backoff);
    }

    try {
      const res = await fetch(url, { headers: HEADERS });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      return await res.text();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw new Error(`Failed after ${MAX_RETRIES} attempts: ${lastError?.message}`);
}

const PRICE_RE = /([\d,]+)円/;
const STOCK_RE = /在庫数\s*(\d+)枚/;

function parseProductPage(html: string): { priceJpy: number; stock: number } {
  const $ = cheerio.load(html);

  const priceText = $(".selling_price .figure").text();
  const priceMatch = priceText.match(PRICE_RE);
  const priceJpy = priceMatch ? parseInt(priceMatch[1].replace(/,/g, ""), 10) : 0;

  const stockText = $(".stock").text();
  const stockMatch = stockText.match(STOCK_RE);
  let stock: number;
  if (stockMatch) {
    stock = parseInt(stockMatch[1], 10);
  } else if (stockText.includes("在庫なし")) {
    stock = 0;
  } else {
    const scriptMatch = html.match(/pConf\.maxQuantity\s*=\s*(\d+)/);
    stock = scriptMatch ? parseInt(scriptMatch[1], 10) : 0;
  }

  return { priceJpy, stock };
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!CARDRUSH_ACQUISITION_ENABLED) {
    return NextResponse.json(
      {
        error: "CardRush automated stock checks are disabled",
        reason: CARDRUSH_BLOCK_REASON,
        policy: CARDRUSH_DATA_POLICY_URL,
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const body = await req.json();
  const urls: string[] = body.urls;

  if (!Array.isArray(urls) || urls.length === 0) {
    return NextResponse.json({ error: "urls array required" }, { status: 400 });
  }

  if (urls.length > 50) {
    return NextResponse.json({ error: "Max 50 URLs per request" }, { status: 400 });
  }

  // URL allowlist — only allow fetching from CardRush
  const ALLOWED_ORIGINS = ["https://cardrush.co.jp"];
  for (const url of urls) {
    try {
      const parsed = new URL(url);
      if (!ALLOWED_ORIGINS.some((origin) => `${parsed.protocol}//${parsed.hostname}` === origin)) {
        return NextResponse.json({ error: `URL not allowed: ${url}` }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ error: `Invalid URL: ${url}` }, { status: 400 });
    }
  }

  const results: Record<string, { priceJpy: number; stock: number } | { error: string }> = {};

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    try {
      const html = await fetchWithRetry(url);
      results[url] = parseProductPage(html);
    } catch (err) {
      results[url] = { error: err instanceof Error ? err.message : String(err) };
    }

    if (i < urls.length - 1) {
      await sleep(INTER_REQUEST_DELAY_MS);
    }
  }

  return NextResponse.json({ results });
}
