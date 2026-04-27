// Map raw CardRush products to wholesale card format
// Filters, deduplicates, generates SKUs, and calculates GBP pricing
//
// Every card (standard and parallel) embeds the encoded CardRush product ID
// in the SKU (e.g. OP-OP05-001-JP-V13KF) so every SKU is permanently tied
// to its source listing. Standard cards are still deduped by card number
// (cheapest listing wins); the product ID is appended to the base SKU.

import { RawProduct, isGraded } from "./cardrush-parser";
import { MIN_PRICE_JPY, type GameMapConfig } from "./config";
import { calculatePrice, calculateSealedPrice, type PriceBreakdown } from "../../src/lib/pricing";

export interface WholesaleCard {
  cardNumber: string;
  sku: string;
  name: string;
  setCode: string;
  rarity: string | null;
  isParallel: boolean;
  // cardrushJpy is tax-inclusive (税込) — this is our actual cost
  cardrushJpy: number;
  pricing: PriceBreakdown;
  cardrushUrl: string | null;
  imageUrl: string | null;
  stock: number;
}

// ---------------------------------------------------------------------------
// Global SKU state — tracks base SKU claims and seen URLs across sets
// ---------------------------------------------------------------------------

export interface GlobalSkuState {
  /** Tracks which base SKUs have been claimed by a standard card */
  baseTaken: Set<string>;
  /** Tracks seen productUrls to skip duplicates across sets (e.g. PRB re-lists original-set cards) */
  seenUrls: Set<string>;
}

export function createSkuState(): GlobalSkuState {
  return { baseTaken: new Set(), seenUrls: new Set() };
}

// Extract CardRush product ID from URL (e.g. /product/9816 → "9816")
function extractProductId(url: string | null): string | null {
  if (!url) return null;
  const match = url.match(/\/product\/(\d+)/);
  return match ? match[1] : null;
}

// Obfuscate product ID so clients can't derive the supplier URL from the SKU
const SKU_XOR_KEY = 48879;

export function encodeProductId(id: number): string {
  return (id ^ SKU_XOR_KEY).toString(36).toUpperCase();
}

export function decodeProductId(encoded: string): number {
  return parseInt(encoded, 36) ^ SKU_XOR_KEY;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Clean display name by stripping metadata markers
function cleanName(raw: string, extraCleaner?: (name: string) => string): string {
  let cleaned = raw
    .replace(/\{[^}]+\}/g, "")          // {OP01-001}
    .replace(/【[^】]+】/g, "")           // 【SR】
    .replace(/〔[^〕]+〕/g, "")           // 〔状態A-〕
    .replace(/パラレル/g, "")             // パラレル
    .replace(/ミラー/g, "")              // ミラー (Pokemon mirrors)
    .replace(/\([^)]*alternate[^)]*\)/gi, "") // (alternate art) variants
    .replace(/\s+/g, " ")
    .trim();
  if (extraCleaner) cleaned = extraCleaner(cleaned).trim();
  return cleaned;
}

// Default base SKU generator (One Piece / Dragon Ball)
function defaultGenerateBaseSku(cardNumber: string): string {
  if (cardNumber === "DON" || cardNumber === "P") {
    return `${cardNumber}-JP`;
  }
  const prefix = cardNumber.match(/^(OP|ST|EB|PRB|FB|FS|SB|P|E)/)?.[1] ?? "OP";
  return `${prefix}-${cardNumber}-JP`;
}

// ---------------------------------------------------------------------------
// Singles mapper
// ---------------------------------------------------------------------------

export function mapToWholesale(
  rawProducts: RawProduct[],
  setCode: string,
  gbpJpyRate: number,
  skuState?: GlobalSkuState,
  mapConfig?: GameMapConfig
): WholesaleCard[] {
  const state = skuState ?? createSkuState();
  const { baseTaken, seenUrls } = state;
  const genSku = mapConfig?.generateBaseSku ?? defaultGenerateBaseSku;
  const extraCleaner = mapConfig?.cleanNameExtra;

  // Step 1: Filter out unwanted products
  const filtered = rawProducts.filter((p) => {
    if (!p.cardNumber) return false;
    if (p.priceJpy < MIN_PRICE_JPY) return false;
    if (isGraded(p)) return false;
    if (p.stock === 0) return false;
    // 状態 = condition grade (A-, B, C etc.) — these are sub-mint cards
    if (p.condition && p.condition.startsWith("状態")) return false;
    return true;
  });

  // Step 2: Group by card number + parallel flag
  const standardGroups = new Map<string, RawProduct[]>();
  const parallelGroups = new Map<string, RawProduct[]>();

  for (const product of filtered) {
    const cardNum = product.cardNumber!;
    const target = product.isParallel ? parallelGroups : standardGroups;
    const group = target.get(cardNum) ?? [];
    group.push(product);
    target.set(cardNum, group);
  }

  const wholesale: WholesaleCard[] = [];

  // Step 3a: Standard cards — dedup by card number, take lowest price
  // Sort by product URL for deterministic selection when prices are equal
  for (const [cardNum, group] of standardGroups) {
    group.sort((a, b) => a.priceJpy - b.priceJpy || (a.productUrl || "").localeCompare(b.productUrl || ""));
    const p = group[0];

    // Skip if this exact product URL was already mapped from a prior set
    if (p.productUrl && seenUrls.has(p.productUrl)) continue;

    const base = genSku(cardNum, setCode);
    // Dedup by base SKU (one standard card per card number)
    if (baseTaken.has(base)) continue;
    baseTaken.add(base);

    // Embed product ID so every SKU links back to its CardRush listing
    const productId = extractProductId(p.productUrl);
    if (!productId) continue; // skip if no URL — can't guarantee traceability
    const sku = `${base}-V${encodeProductId(Number(productId))}`;

    const pricing = calculatePrice(p.priceJpy, gbpJpyRate);
    if (p.productUrl) seenUrls.add(p.productUrl);

    wholesale.push({
      cardNumber: cardNum,
      sku,
      name: cleanName(p.name, extraCleaner),
      setCode,
      rarity: p.rarity,
      isParallel: false,
      cardrushJpy: p.priceJpy,
      pricing,
      cardrushUrl: p.productUrl,
      imageUrl: p.imageUrl,
      stock: p.stock,
    });
  }

  // Step 3b: Parallel cards — SKU embeds encoded product ID (V{encoded})
  for (const [cardNum, group] of parallelGroups) {
    // Dedup by name (same art variant may have multiple condition listings)
    const seen = new Map<string, RawProduct>();
    for (const p of group) {
      const key = cleanName(p.name, extraCleaner);
      const existing = seen.get(key);
      if (!existing || p.priceJpy < existing.priceJpy) {
        seen.set(key, p);
      }
    }

    const base = genSku(cardNum, setCode);

    for (const p of seen.values()) {
      // Skip if this exact product URL was already mapped from a prior set
      if (p.productUrl && seenUrls.has(p.productUrl)) continue;

      // Derive SKU from product URL — permanently ties SKU to the listing
      const productId = extractProductId(p.productUrl);
      if (!productId) continue; // skip parallels without a URL
      const sku = `${base}-V${encodeProductId(Number(productId))}`;

      const pricing = calculatePrice(p.priceJpy, gbpJpyRate);
      if (p.productUrl) seenUrls.add(p.productUrl);

      wholesale.push({
        cardNumber: cardNum,
        sku,
        name: cleanName(p.name, extraCleaner),
        setCode,
        rarity: p.rarity,
        isParallel: true,
        cardrushJpy: p.priceJpy,
        pricing,
        cardrushUrl: p.productUrl,
        imageUrl: p.imageUrl,
        stock: p.stock,
      });
    }
  }

  // Sort by SKU for consistent output
  wholesale.sort((a, b) => a.sku.localeCompare(b.sku));

  return wholesale;
}

// ---------------------------------------------------------------------------
// Sealed product mapper (booster boxes, starter decks, collections)
// ---------------------------------------------------------------------------

// Clean sealed product name — strip condition markers but keep identifiers
function cleanSealedName(raw: string): string {
  return raw
    .replace(/\{[^}]*\}/g, "")          // {-} or any tag
    .replace(/〔[^〕]+〕/g, "")           // 〔状態A-〕
    .replace(/【[^】]+】/g, "")           // 【未開封BOX】
    .replace(/\(A-\)/g, "")             // (A-) condition
    .replace(/\s+/g, " ")
    .trim();
}

// Check if a sealed product name indicates sub-mint condition
function isSealedSubMint(name: string): boolean {
  return /\(A-\)/.test(name) || /〔状態/.test(name);
}

export function mapSealedToWholesale(
  rawProducts: RawProduct[],
  gbpJpyRate: number
): WholesaleCard[] {
  // Step 1: Filter out unwanted products
  const filtered = rawProducts.filter((p) => {
    if (p.priceJpy <= 0) return false;
    if (p.stock === 0) return false;
    if (isSealedSubMint(p.name)) return false;
    if (isGraded(p)) return false;
    if (/英語版/.test(p.name)) return false;
    return true;
  });

  // Step 2: Dedup by cleaned name — take lowest price for same product
  const byName = new Map<string, RawProduct>();
  for (const p of filtered) {
    const key = cleanSealedName(p.name);
    const existing = byName.get(key);
    if (!existing || p.priceJpy < existing.priceJpy) {
      byName.set(key, p);
    }
  }

  // Step 3: Map to wholesale format
  const wholesale: WholesaleCard[] = [];
  for (const [, p] of byName) {
    const productId = extractProductId(p.productUrl);
    if (!productId) continue;

    const encodedId = encodeProductId(Number(productId));
    const sku = `SEALED-V${encodedId}-JP`;
    const pricing = calculateSealedPrice(p.priceJpy, gbpJpyRate);

    wholesale.push({
      cardNumber: `SEALED-V${encodedId}`,
      sku,
      name: cleanSealedName(p.name),
      setCode: "SEALED",
      rarity: null,
      isParallel: false,
      cardrushJpy: p.priceJpy,
      pricing,
      cardrushUrl: p.productUrl,
      imageUrl: p.imageUrl,
      stock: p.stock,
    });
  }

  wholesale.sort((a, b) => a.cardrushJpy - b.cardrushJpy);
  return wholesale;
}
