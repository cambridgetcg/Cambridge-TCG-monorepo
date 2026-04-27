// HTTP client for CardRush product-group pages
// Handles pagination, rate limiting, retry, and proxy fallback

import { ITEMS_PER_PAGE, REQUEST_DELAY_MS } from "./config";

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 2000;

const HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept-Language": "ja",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isCloudFlareBlock(status: number): boolean {
  return status === 403 || status === 503;
}

export async function fetchWithRetry(url: string): Promise<string> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1);
      console.log(`    Retry ${attempt}/${MAX_RETRIES - 1}, waiting ${backoff}ms...`);
      await sleep(backoff);
    }

    try {
      const res = await fetch(url, { headers: HEADERS });

      if (isCloudFlareBlock(res.status)) {
        // Try proxy if available
        const proxyUrl = process.env.BRIGHT_DATA_PROXY;
        if (proxyUrl && attempt === 0) {
          console.log(`    CloudFlare block (${res.status}), trying Bright Data proxy...`);
          return await fetchWithProxy(url, proxyUrl);
        }
        throw new Error(`CloudFlare block: HTTP ${res.status}`);
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      return await res.text();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.log(`    Attempt ${attempt + 1} failed: ${lastError.message}`);
    }
  }

  throw new Error(`Failed after ${MAX_RETRIES} attempts: ${lastError?.message}`);
}

async function fetchWithProxy(url: string, proxyUrl: string): Promise<string> {
  // Bright Data proxy: route request through proxy
  // The proxy URL format: http://user:pass@host:port
  const proxy = new URL(proxyUrl);

  const res = await fetch(url, {
    headers: {
      ...HEADERS,
      "Proxy-Authorization": `Basic ${Buffer.from(`${proxy.username}:${proxy.password}`).toString("base64")}`,
    },
  });

  if (!res.ok) {
    throw new Error(`Proxy request failed: HTTP ${res.status}`);
  }

  return await res.text();
}

export async function fetchProductGroupPages(
  productGroupId: number,
  maxPages: number = 20,
  baseUrl: string = "https://www.cardrush-op.jp"
): Promise<string[]> {
  const pages: string[] = [];
  let page = 1;

  while (true) {
    const url = `${baseUrl}/product-group/${productGroupId}?limit=${ITEMS_PER_PAGE}&page=${page}`;
    console.log(`  Fetching page ${page}: ${url}`);

    const html = await fetchWithRetry(url);

    // Count products on this page — CardRush wraps around instead of returning
    // empty pages, so we detect the last page by item count < ITEMS_PER_PAGE
    const itemCount = (html.match(/list_item_cell/g) || []).length;
    console.log(`    ${itemCount} items on page ${page}`);

    if (itemCount === 0) {
      console.log(`  Page ${page} has no items, stopping`);
      break;
    }

    pages.push(html);

    // Last page: fewer items than limit
    if (itemCount < ITEMS_PER_PAGE) {
      console.log(`  Page ${page} has ${itemCount} < ${ITEMS_PER_PAGE} items (last page)`);
      break;
    }

    // Safety limit
    if (page >= maxPages) {
      console.log(`  Reached page limit (${maxPages}), stopping`);
      break;
    }

    page++;
    await sleep(REQUEST_DELAY_MS);
  }

  console.log(`  Fetched ${pages.length} page(s)`);
  return pages;
}

export async function fetchProductListPages(
  listId: number,
  maxPages: number = 20,
  baseUrl: string = "https://www.cardrush-op.jp"
): Promise<string[]> {
  const pages: string[] = [];
  let page = 1;

  while (true) {
    const url = `${baseUrl}/product-list/${listId}?page=${page}`;
    console.log(`  Fetching page ${page}: ${url}`);

    const html = await fetchWithRetry(url);

    const itemCount = (html.match(/list_item_cell/g) || []).length;
    console.log(`    ${itemCount} items on page ${page}`);

    if (itemCount === 0) {
      console.log(`  Page ${page} has no items, stopping`);
      break;
    }

    pages.push(html);

    if (itemCount < ITEMS_PER_PAGE) {
      console.log(`  Page ${page} has ${itemCount} < ${ITEMS_PER_PAGE} items (last page)`);
      break;
    }

    if (page >= maxPages) {
      console.log(`  Reached page limit (${maxPages}), stopping`);
      break;
    }

    page++;
    await sleep(REQUEST_DELAY_MS);
  }

  console.log(`  Fetched ${pages.length} page(s)`);
  return pages;
}

export async function fetchDiscoveryPage(
  baseUrl: string = "https://www.cardrush-op.jp"
): Promise<string> {
  const url = `${baseUrl}/product-group/`;
  console.log(`  Fetching product-group index: ${url}`);
  return await fetchWithRetry(url);
}
