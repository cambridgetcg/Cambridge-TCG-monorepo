// Parse CardRush product-group HTML into structured product data
// Uses cheerio to extract product listings from server-rendered pages

import * as cheerio from "cheerio";
import type { GameParseConfig } from "./config";

export interface RawProduct {
  cardNumber: string | null;
  name: string;
  priceJpy: number;
  rarity: string | null;
  stock: number;
  condition: string | null;
  isParallel: boolean;
  productUrl: string | null;
  imageUrl: string | null;
}

export interface DiscoveredGroup {
  id: number;
  name: string;
  url: string;
}

// Regex patterns for extracting structured data from product names
const PRICE_RE = /([\d,]+)円/;
const RARITY_RE = /【([^】]+)】/;
const STOCK_RE = /在庫数\s*(\d+)枚/;
const CONDITION_RE = /〔([^〕]+)〕/;
const GRADED_INDICATORS = ["PSA", "BGS", "CGC", "ARS"];

// Default parse config (One Piece) for backward compatibility
const DEFAULT_PARSE_CONFIG: GameParseConfig = {
  cardNumberRegex: /\{((?:OP|ST|EB|PRB|FB|FS|SB)\d{2}-\d{3}|[PE]-\d{3})/,
  parallelIndicators: ["パラレル", "/P"],
  parallelRarityCheck: (rarity) => rarity.includes("P"),
  specialCards: { "ドン!!": "DON", "{P}": "P" },
};

export function parseProductGroupPage(
  html: string,
  baseUrl: string = "https://www.cardrush-op.jp",
  parseConfig: GameParseConfig = DEFAULT_PARSE_CONFIG
): RawProduct[] {
  const $ = cheerio.load(html);
  const products: RawProduct[] = [];

  // Each product is a <li class="list_item_cell"> inside <ul class="item_list">
  $("li.list_item_cell").each((_, el) => {
    const $el = $(el);
    const product = extractProduct($, $el, baseUrl, parseConfig);
    if (product) {
      products.push(product);
    }
  });

  return products;
}

function extractProduct(
  $: cheerio.CheerioAPI,
  $el: ReturnType<cheerio.CheerioAPI>,
  baseUrl: string,
  parseConfig: GameParseConfig
): RawProduct | null {
  // Product name from .goods_name span
  const name = $el.find(".goods_name").text().trim();
  if (!name) return null;

  // Price from .selling_price .figure — tax-inclusive (税込)
  const priceText = $el.find(".selling_price .figure").text();
  const priceMatch = priceText.match(PRICE_RE);
  const priceJpy = priceMatch ? parseInt(priceMatch[1].replace(/,/g, ""), 10) : 0;
  if (priceJpy === 0) return null;

  // Card number from product name using game-specific regex
  const cardNumberMatch = name.match(parseConfig.cardNumberRegex);
  let cardNumber: string | null = cardNumberMatch ? cardNumberMatch[1] : null;

  // Fallback: check game-specific special cards (e.g. ドン!! → DON for One Piece)
  if (!cardNumber) {
    for (const [substring, value] of Object.entries(parseConfig.specialCards)) {
      if (name.includes(substring)) {
        cardNumber = value;
        break;
      }
    }
  }

  // Rarity from product name: 【SR】
  const rarityMatch = name.match(RARITY_RE);
  const rarity = rarityMatch ? rarityMatch[1] : null;

  // Stock from .stock element
  const stockText = $el.find(".stock").text();
  const stockMatch = stockText.match(STOCK_RE);
  const stock = stockMatch
    ? parseInt(stockMatch[1], 10)
    : stockText.includes("在庫なし")
      ? 0
      : -1;

  // Condition from product name: 〔状態A-〕
  const conditionMatch = name.match(CONDITION_RE);
  const condition = conditionMatch ? conditionMatch[1] : null;

  // Parallel detection using game-specific indicators and rarity check
  const isParallel =
    parseConfig.parallelIndicators.some((p) => name.includes(p)) ||
    (rarity !== null && parseConfig.parallelRarityCheck(rarity));

  // Product URL from .item_data_link or first anchor
  const href =
    $el.find(".item_data_link").attr("href") ||
    $el.find("a").first().attr("href");
  const productUrl = href
    ? href.startsWith("http")
      ? href
      : `${baseUrl}${href}`
    : null;

  // Image URL from .global_photo img
  const imgSrc =
    $el.find(".global_photo img").attr("src") ||
    $el.find("img").first().attr("src");
  const imageUrl = imgSrc
    ? imgSrc.startsWith("http")
      ? imgSrc
      : `${baseUrl}${imgSrc}`
    : null;

  return {
    cardNumber,
    name,
    priceJpy,
    rarity,
    stock,
    condition,
    isParallel,
    productUrl,
    imageUrl,
  };
}

export interface LiveStockResult {
  priceJpy: number;
  stock: number;
}

/**
 * Parse a single CardRush product detail page (e.g. /product/7164)
 * for live price and stock count.
 */
export function parseProductPage(html: string): LiveStockResult {
  const $ = cheerio.load(html);

  // Price: selling price element, same pattern as group pages
  const priceText = $(".selling_price .figure").text();
  const priceMatch = priceText.match(PRICE_RE);
  const priceJpy = priceMatch ? parseInt(priceMatch[1].replace(/,/g, ""), 10) : 0;

  // Stock: "在庫数 63枚" or "在庫なし"
  const stockText = $(".stock").text();
  const stockMatch = stockText.match(STOCK_RE);
  let stock: number;
  if (stockMatch) {
    stock = parseInt(stockMatch[1], 10);
  } else if (stockText.includes("在庫なし")) {
    stock = 0;
  } else {
    // Fallback: check inline JS for pConf.maxQuantity
    const scriptMatch = html.match(/pConf\.maxQuantity\s*=\s*(\d+)/);
    stock = scriptMatch ? parseInt(scriptMatch[1], 10) : 0;
  }

  return { priceJpy, stock };
}

export function isGraded(product: RawProduct): boolean {
  return (
    GRADED_INDICATORS.some((g) => (product.condition ?? "").toUpperCase().includes(g)) ||
    GRADED_INDICATORS.some((g) => product.name.toUpperCase().includes(g))
  );
}

export function parseDiscoveryPage(
  html: string,
  baseUrl: string = "https://www.cardrush-op.jp"
): DiscoveredGroup[] {
  const $ = cheerio.load(html);
  const groups: DiscoveredGroup[] = [];

  // Look for links to product-group pages
  $('a[href*="/product-group/"]').each((_, el) => {
    const href = $(el).attr("href") || "";
    const match = href.match(/\/product-group\/(\d+)/);
    if (match) {
      const id = parseInt(match[1], 10);
      const name = $(el).text().trim();
      if (name && !groups.some((g) => g.id === id)) {
        groups.push({
          id,
          name,
          url: `${baseUrl}/product-group/${id}`,
        });
      }
    }
  });

  return groups.sort((a, b) => a.id - b.id);
}
