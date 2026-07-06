"use client";

import Link from "next/link";
import { useEffect, useState, useCallback, useRef } from "react";
import { usePathname } from "next/navigation";
import { formatPrice, formatDateTime } from "@/lib/format";
import { Money, EmptyState, Icon, TrustTier, WhyLink, type IconName } from "@/lib/ui";
import { useVoice } from "@/lib/wardrobe/context";
import type { OrderBookEntry, MarketTrade } from "@/lib/market/types";
import type { UnifiedMarketView } from "@/lib/market/unified";
import type { EscrowTier } from "@/lib/escrow/service-tiers";
import type { CatalogIdentity } from "@/lib/market/catalog-card";
import { ListingsPanel, type TrustLimits } from "./ListingsPanel";
import { tradeLimitWarning } from "./offer-guidance";

// Identity resolved server-side from the local card_set_cards catalogue,
// plus the reference price resolved from the same substrate the /market
// table reads. Seeded into the client so the FIRST render (SSR + hydration)
// already carries the card name, image and reference price — no nameless
// SKU, no "Not available" next to a table that shows a number.
export interface CardIdentitySeed extends CatalogIdentity {
  reference_price: number | null;
}

// A live auction for this exact card, resolved server-side from
// auctions.sku. Additive read only — the auction engine is untouched.
export interface AlsoAtAuction {
  id: string;
  title: string;
  auction_type: string;
  current_price: string;
  ends_at: string | null;
  image_url: string | null;
}

const AUCTION_TYPE_LABELS: Record<string, string> = {
  english: "English",
  dutch: "Dutch",
  buy_now: "Buy Now",
};

function auctionEndsLabel(endsAt: string | null): string | null {
  if (!endsAt) return null;
  const ms = new Date(endsAt).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return "ending";
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `ends in ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `ends in ${hours}h`;
  return `ends in ${Math.floor(hours / 24)}d`;
}

/** Quiet strip linking to any live auction(s) for this card. */
function AlsoAtAuctionStrip({ auctions }: { auctions: AlsoAtAuction[] }) {
  if (auctions.length === 0) return null;
  return (
    <div className="wardrobe-mat rounded-lg p-3 mb-4">
      <p className="text-[10px] text-ink-faint uppercase tracking-wide mb-2">
        Also at auction
      </p>
      <ul className="space-y-2">
        {auctions.map((a) => {
          const ends = auctionEndsLabel(a.ends_at);
          return (
            <li key={a.id}>
              <Link
                href={`/auctions/${a.id}`}
                className="flex items-center gap-2 group"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-xs text-ink truncate group-hover:text-accent transition">
                    {AUCTION_TYPE_LABELS[a.auction_type] || a.auction_type}
                    {ends && <span className="text-ink-faint"> · {ends}</span>}
                  </span>
                </span>
                <span className="text-xs font-mono tabular-nums text-bid shrink-0">
                  <Money value={Number(a.current_price)} />
                </span>
                <span className="text-ink-faint text-xs shrink-0" aria-hidden>→</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// Wardrobe migration (spec §3.4): Gallery semantic tokens, Icon glyphs and a
// voiced empty state — skin only; fetches, polling, hooks and forms unchanged.

// API expects ISO-style codes; UI shows human labels.
// "Damaged" is intentionally absent from the API enum, so it's not offered here.
const CONDITIONS: { code: "NM" | "LP" | "MP" | "HP"; label: string }[] = [
  { code: "NM", label: "Near Mint" },
  { code: "LP", label: "Lightly Played" },
  { code: "MP", label: "Moderately Played" },
  { code: "HP", label: "Heavily Played" },
];

// Collectors-first (2026-07-06): the book renders collector orders only.
// The house rows (CTCG ask from stock, standing credit bid) that used to
// be injected — and clickable — are gone; every row is display-only, and
// the forms on the right are the only way orders enter the book.
function OrderBookViz({
  bids,
  asks,
}: {
  bids: OrderBookEntry[];
  asks: OrderBookEntry[];
}) {
  const maxBidQty = Math.max(1, ...bids.map((b) => b.total_quantity));
  const maxAskQty = Math.max(1, ...asks.map((a) => a.total_quantity));
  const maxRows = Math.max(bids.length, asks.length, 1);

  return (
    <div className="grid grid-cols-2 gap-1">
      {/* Bids header */}
      <div className="flex justify-between px-2 text-[10px] text-ink-faint uppercase tracking-wide mb-1">
        <span>Qty</span>
        <span>Bid</span>
      </div>
      {/* Asks header */}
      <div className="flex justify-between px-2 text-[10px] text-ink-faint uppercase tracking-wide mb-1">
        <span>Ask</span>
        <span>Qty</span>
      </div>

      {/* Rows */}
      {Array.from({ length: maxRows }).map((_, i) => (
        <BidAskRow
          key={i}
          bid={bids[i]}
          ask={asks[i]}
          maxBidQty={maxBidQty}
          maxAskQty={maxAskQty}
          isFirst={i === 0}
        />
      ))}
    </div>
  );
}

function BidAskRow({
  bid,
  ask,
  maxBidQty,
  maxAskQty,
  isFirst,
}: {
  bid?: OrderBookEntry;
  ask?: OrderBookEntry;
  maxBidQty: number;
  maxAskQty: number;
  isFirst: boolean;
}) {
  const askBorderColor = isFirst ? "border-l-2 border-ask/40" : "border-l border-border-subtle";
  const bidBorderColor = isFirst ? "border-r-2 border-bid/40" : "border-r border-border-subtle";

  return (
    <>
      {/* Bid cell */}
      <div className={`relative h-8 flex items-center ${bidBorderColor}`}>
        {bid ? (
          <>
            <div
              className="absolute inset-y-0 right-0 bg-bid/20 rounded-l"
              style={{ width: `${(Math.min(bid.total_quantity, maxBidQty) / maxBidQty) * 100}%` }}
            />
            <span className="relative z-10 w-full flex justify-between px-2 text-xs font-mono tabular-nums">
              <span className="text-ink-muted">{bid.total_quantity}</span>
              <span className="text-bid font-medium">
                <Money value={Number(bid.price)} />
              </span>
            </span>
          </>
        ) : (
          <span className="w-full text-center text-ink-faint text-xs">—</span>
        )}
      </div>
      {/* Ask cell */}
      <div className={`relative h-8 flex items-center ${askBorderColor}`}>
        {ask ? (
          <>
            <div
              className="absolute inset-y-0 left-0 bg-ask/20 rounded-r"
              style={{ width: `${(ask.total_quantity / maxAskQty) * 100}%` }}
            />
            <span className="relative z-10 w-full flex justify-between px-2 text-xs font-mono tabular-nums">
              <span className="text-ask font-medium">
                <Money value={Number(ask.price)} />
              </span>
              <span className="text-ink-muted">{ask.total_quantity}</span>
            </span>
          </>
        ) : (
          <span className="w-full text-center text-ink-faint text-xs">—</span>
        )}
      </div>
    </>
  );
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) +
    " " +
    d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

/** Inline SVG sparkline — no chart lib, no deps.
 *  Height 28px, width scales to container. Stroke is the theme accent;
 *  the 24h change pill alongside carries the trend reading. */
function Sparkline({ points, width = 120, height = 28 }: {
  points: number[]; width?: number; height?: number;
}) {
  if (!points.length) return null;
  if (points.length === 1) {
    return (
      <svg width={width} height={height} className="block">
        <line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke="var(--color-ink-faint)" strokeWidth={1} />
      </svg>
    );
  }
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const stepX = width / (points.length - 1);
  const path = points
    .map((p, i) => {
      const x = i * stepX;
      const y = height - ((p - min) / range) * (height - 4) - 2;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width={width} height={height} className="block" aria-hidden="true">
      <path d={path} fill="none" stroke="var(--color-accent)" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** Price history tile — sparkline + 24h change pill. */
function PriceHistoryTile({ analytics }: {
  analytics: { sparkline: number[]; lastPrice: number | null; change24hPct: number | null };
}) {
  const { sparkline, lastPrice, change24hPct } = analytics;
  if (!sparkline?.length || lastPrice === null) {
    return (
      <div className="wardrobe-mat rounded-lg p-3 mb-4">
        <span className="text-xs text-ink-faint">No trade history yet.</span>
      </div>
    );
  }
  const changeColor =
    change24hPct === null ? "text-ink-faint" :
    change24hPct > 0 ? "text-bid" :
    change24hPct < 0 ? "text-ask" : "text-ink-muted";
  const changeSign = change24hPct === null ? "" : change24hPct > 0 ? "+" : "";
  return (
    <div className="wardrobe-mat rounded-lg p-3 mb-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-ink-faint uppercase tracking-wide">30-day price</span>
        {change24hPct !== null && (
          <span className={`text-xs font-mono tabular-nums ${changeColor}`}>
            {changeSign}{change24hPct.toFixed(1)}% 24h
          </span>
        )}
      </div>
      <Sparkline points={sparkline} width={200} height={32} />
      <p className="text-[10px] text-ink-faint mt-1">
        <span className="font-mono tabular-nums">{sparkline.length}</span> day{sparkline.length !== 1 ? "s" : ""} of trades
      </p>
    </div>
  );
}

/** Reference price + market price info panel.
 *  Collectors-first (2026-07-06): the two-sided CTCG spread block and the
 *  trade-in rows died with the we-buy desk. The catalogue price survives
 *  strictly as a labelled reference — open data, nobody's offer. */
function ReferencePricePanel({ view }: { view: UnifiedMarketView }) {
  const { reference_price, market_price, p2p_discount } = view;

  return (
    <div className="wardrobe-mat rounded-lg p-3 mb-4 space-y-2">
      {/* Reference price (open data, not an offer) */}
      <div className="flex items-center justify-between">
        <span
          className="text-xs text-ink-muted"
          title="The catalogue reference price — open data, not anyone's offer. Nothing sells at it; the collector book below is the market."
        >
          Reference price <span className="text-ink-faint">(ref)</span>
        </span>
        {reference_price != null ? (
          <span className="text-sm font-mono tabular-nums text-ink font-semibold">
            <Money value={reference_price} />
          </span>
        ) : (
          <span
            className="text-xs text-ink-faint"
            title="The catalogue price source (wholesale) is currently unreachable. This is a source outage, not a card without value."
          >
            Source unavailable
          </span>
        )}
      </div>

      {/* Market Price */}
      {market_price != null && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-ink-muted">Market Price</span>
          <span className="text-sm font-mono tabular-nums text-ink font-bold">
            <Money value={market_price} />
            {p2p_discount != null && p2p_discount > 0 && (
              <span className="ml-1.5 text-[10px] font-sans font-semibold px-1.5 py-0.5 rounded-full bg-ok/10 text-ok border border-ok/30">
                <span className="font-mono tabular-nums">{p2p_discount}%</span> below reference
              </span>
            )}
          </span>
        </div>
      )}
    </div>
  );
}

// ── Escrow routing preview ──

interface EscrowPreview {
  routing: {
    tier: EscrowTier;
    label: string;
    description: string;
    estimatedDays: string;
  };
  summary: string[];
}

const TIER_STYLES: Record<EscrowTier, { border: string; bg: string; text: string; icon: IconName }> = {
  direct: {
    border: "border-ok/30",
    bg: "bg-ok/10",
    text: "text-ok",
    icon: "arrow-right",
  },
  verified: {
    border: "border-info/30",
    bg: "bg-info/10",
    text: "text-info",
    icon: "eye",
  },
  full_escrow: {
    border: "border-accent/30",
    bg: "bg-accent-wash",
    text: "text-accent",
    icon: "lock",
  },
};

function EscrowRoutingPreview({ orderValue }: { orderValue: number }) {
  const [preview, setPreview] = useState<EscrowPreview | null>(null);

  useEffect(() => {
    if (!orderValue || orderValue <= 0) {
      setPreview(null);
      return;
    }
    const controller = new AbortController();
    fetch(`/api/escrow/routing?value=${orderValue}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data) setPreview(data); })
      .catch(() => {});
    return () => controller.abort();
  }, [orderValue]);

  if (!preview) return null;

  const style = TIER_STYLES[preview.routing.tier];

  return (
    <div className={`mt-4 rounded-lg border ${style.border} ${style.bg} p-3`}>
      <p className="text-xs text-ink-muted mb-2 font-medium uppercase tracking-wide">How this trade will work</p>
      <div className="flex items-center gap-2 mb-2">
        <span className={`flex items-center ${style.text}`}><Icon name={style.icon} /></span>
        <span className={`text-sm font-semibold ${style.text}`}>{preview.routing.label}</span>
        <span className="text-xs text-ink-faint">&mdash; {preview.routing.description.split(".")[0]}</span>
        <span className="ml-auto text-xs text-ink-faint">({preview.routing.estimatedDays})</span>
      </div>
      <ul className="space-y-1">
        {preview.summary.map((point, i) => (
          <li key={i} className="text-xs text-ink-muted flex items-start gap-1.5">
            <span className={`mt-0.5 ${style.text}`}>&bull;</span>
            <span>{point}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Buy routing info — tells the user where they're buying from, and acts:
 *  clicking it prefills the buy form at the best ask. Every ask is a
 *  collector's; the reference price is context, not a rival offer. */
function BuyRoutingInfo({
  view,
  onBuy,
}: {
  view: UnifiedMarketView;
  onBuy: (opts: { price: number; quantity?: number; condition?: "NM" | "LP" | "MP" | "HP" }) => void;
}) {
  const { asks, reference_price } = view;
  if (asks.length === 0) return null;

  const bestPrice = Number(asks[0].price);
  const below = reference_price != null && bestPrice < reference_price;

  return (
    <button
      type="button"
      onClick={() => onBuy({ price: bestPrice, quantity: 1 })}
      className={`w-full text-left text-xs px-3 py-2 rounded-lg border transition hover:opacity-90 ${
        below
          ? "bg-bid/10 border-bid/20 text-bid"
          : "bg-surface-elevated border-border-strong text-ink-muted"
      }`}
    >
      Buy from seller at <Money value={bestPrice} className="font-mono tabular-nums" />
      {below && reference_price != null && (
        <> (<Money value={reference_price - bestPrice} className="font-mono tabular-nums" /> below the reference price)</>
      )}
    </button>
  );
}

export default function CardMarketClient({
  sku,
  identity,
  alsoAtAuction = [],
}: {
  sku: string;
  identity: CardIdentitySeed;
  alsoAtAuction?: AlsoAtAuction[];
}) {
  const pathname = usePathname();
  // Sign-in CTAs carry the current path so the login flow can return here.
  const signInHref = `/login?return=${encodeURIComponent(pathname || `/market/${sku}`)}`;
  const v = useVoice();

  // Seed the market view from the server-resolved identity so the first
  // paint (SSR + hydration) already shows the card — name, image, set,
  // reference price — instead of a loading skeleton. The order book fills
  // in from the /unified fetch below; identity never blanks out even if
  // that fetch fails.
  const seed: UnifiedMarketView = {
    sku: identity.sku,
    card_name: identity.card_name,
    card_number: identity.card_number,
    set_code: identity.set_code,
    set_name: identity.set_name,
    image_url: identity.image_url,
    rarity: identity.rarity,
    reference_price: identity.reference_price,
    bids: [],
    asks: [],
    recent_trades: [],
    best_ask_seller: null,
    best_bid: null,
    best_ask: null,
    market_price: null,
    spread: null,
    p2p_discount: null,
  };

  const [book, setBook] = useState<UnifiedMarketView | null>(seed);
  const [analytics, setAnalytics] = useState<{
    sparkline: number[];
    lastPrice: number | null;
    change24hPct: number | null;
  } | null>(null);
  // Not "loading" from a blank slate — identity is already seeded, so the
  // page renders immediately and the order book fills in.
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Order form state
  const [tab, setTab] = useState<"buy" | "sell">("buy");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [condition, setCondition] = useState<"NM" | "LP" | "MP" | "HP">("NM");
  // Listing options (ask side). Returns are a per-listing opt-in; the
  // window rides onto the trade snapshot at match time.
  const [acceptsReturns, setAcceptsReturns] = useState(false);
  const [returnWindowDays, setReturnWindowDays] = useState("14");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
    // Set when the order matched immediately — the success box links to
    // the trade and names the payment deadline the trade row enforces.
    // tradeId is only set for a single match; multiple matches fall back
    // to the trades list, whose default tab does not show them.
    matched?: { count: number; paymentExpiresAt: string | null; tradeId: string | null };
  } | null>(null);
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  // Own trading limits (trust engine) — fetched once after sign-in so
  // per-trade / daily-limit rejections surface BEFORE submit.
  const [limits, setLimits] = useState<TrustLimits | null>(null);

  // Watchlist
  const [watching, setWatching] = useState<boolean | null>(null);
  const [watchToggling, setWatchToggling] = useState(false);
  const [related, setRelated] = useState<Array<{
    sku: string; cardName: string | null; imageUrl: string | null;
    bestAsk: number | null; coWatchCount: number;
  }>>([]);
  const [fairValue, setFairValue] = useState<{
    vwap: number | null; median: number | null;
    tradeCount: number; totalVolume: number;
    priceRange: { min: number | null; max: number | null };
  } | null>(null);
  const [bidAnalysis, setBidAnalysis] = useState<{
    fillProbabilityPct: number | null;
    expectedDaysToFill: number | null;
  } | null>(null);

  // Price alert form
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertPrice, setAlertPrice] = useState("");
  const [alertDirection, setAlertDirection] = useState<"below" | "above">("below");
  const [alertSubmitting, setAlertSubmitting] = useState(false);
  const [alertResult, setAlertResult] = useState<{ ok: boolean; message: string } | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval>>(undefined);

  // Buy affordances (P1a): an ask row's Buy button, and the "Buy from
  // seller" line, prefill this form and scroll/focus it, so the advertised
  // one-click buy actually moves the user somewhere instead of doing
  // nothing. The buyForm ref is the scroll target; priceInput is focused.
  const buyFormRef = useRef<HTMLDivElement>(null);
  const priceInputRef = useRef<HTMLInputElement>(null);
  const [prefillPulse, setPrefillPulse] = useState(false);

  const prefillBuy = useCallback(
    (opts: { price: number; quantity?: number; condition?: "NM" | "LP" | "MP" | "HP" }) => {
      setTab("buy");
      setResult(null);
      setPrice(opts.price.toFixed(2));
      if (opts.quantity && opts.quantity > 0) setQuantity(String(opts.quantity));
      if (opts.condition) setCondition(opts.condition);
      // Visible state change: scroll the form into view, focus the price,
      // and pulse the border so the jump is legible.
      requestAnimationFrame(() => {
        buyFormRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        priceInputRef.current?.focus();
        setPrefillPulse(true);
        setTimeout(() => setPrefillPulse(false), 1200);
      });
    },
    [],
  );

  const fetchBook = useCallback(async () => {
    try {
      const res = await fetch(`/api/market/${sku}/unified`);
      if (!res.ok) throw new Error("Not found");
      const data: UnifiedMarketView = await res.json();
      // The live view wins for the order book, but identity + reference
      // price fall back to the server seed so a wholesale outage can never
      // blank out a name or price the SSR already rendered.
      setBook({
        ...data,
        card_name: data.card_name ?? identity.card_name,
        card_number: data.card_number ?? identity.card_number,
        set_code: data.set_code ?? identity.set_code,
        set_name: data.set_name ?? identity.set_name,
        image_url: data.image_url ?? identity.image_url,
        rarity: data.rarity ?? identity.rarity,
        reference_price: data.reference_price ?? identity.reference_price,
      });
      setError("");
    } catch {
      // Keep the seeded identity on screen; only the order book is missing.
      setError("Could not load the live order book — showing the last known card details.");
    } finally {
      setLoading(false);
    }
  }, [sku, identity]);

  useEffect(() => {
    fetchBook();
    pollRef.current = setInterval(fetchBook, 10000);
    return () => clearInterval(pollRef.current);
  }, [fetchBook]);

  // Tab title — once book loads, swap the generic site title for the card
  // name. /product/[sku] sets a real <title> server-side; this page is a
  // client component, so we update document.title once we have the data.
  useEffect(() => {
    if (!book?.card_name) return;
    const prev = document.title;
    document.title = `${book.card_name} ${book.card_number ?? sku} — Cambridge TCG`;
    return () => { document.title = prev; };
  }, [book?.card_name, book?.card_number, sku]);

  // Analytics fetched once per SKU — trades are infrequent, no need to poll.
  useEffect(() => {
    fetch(`/api/market/${sku}/candles?interval=1d&limit=30`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setAnalytics({ sparkline: d.sparkline, lastPrice: d.lastPrice, change24hPct: d.change24hPct }); })
      .catch(() => {});
  }, [sku]);

  // Co-watch recommendations — also fetched once.
  useEffect(() => {
    fetch(`/api/market/${sku}/related?limit=8`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setRelated(d.related || []); })
      .catch(() => {});
  }, [sku]);

  // Fair value (fresh per SKU). Bid analysis re-fetches when the price
  // input changes; debounced so typing doesn't hammer the endpoint.
  useEffect(() => {
    fetch(`/api/market/${sku}/fair-value`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setFairValue(d.fairValue); })
      .catch(() => {});
  }, [sku]);

  useEffect(() => {
    const parsed = parseFloat(price);
    if (!parsed || parsed <= 0 || tab !== "buy") {
      setBidAnalysis(null);
      return;
    }
    const handle = setTimeout(() => {
      fetch(`/api/market/${sku}/fair-value?bidPrice=${parsed}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (d?.bidAnalysis) setBidAnalysis(d.bidAnalysis); })
        .catch(() => {});
    }, 400);
    return () => clearTimeout(handle);
  }, [sku, price, tab]);

  // Watchlist state — derived from listing the user's full watchlist once
  // (cheaper than a per-sku check endpoint).
  useEffect(() => {
    fetch("/api/market/watches")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) { setWatching(false); return; }
        setWatching((d.watches || []).some((w: { sku: string }) => w.sku === sku));
      })
      .catch(() => setWatching(false));
  }, [sku]);

  async function toggleWatch() {
    if (watching === null) return;
    setWatchToggling(true);
    try {
      const method = watching ? "DELETE" : "POST";
      const res = await fetch("/api/market/watches", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku }),
      });
      if (res.ok) setWatching(!watching);
    } finally {
      setWatchToggling(false);
    }
  }

  async function submitAlert(e: React.FormEvent) {
    e.preventDefault();
    setAlertSubmitting(true);
    setAlertResult(null);
    try {
      const res = await fetch("/api/market/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku,
          thresholdPrice: parseFloat(alertPrice),
          direction: alertDirection,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAlertResult({ ok: false, message: data.error || "Failed" });
        return;
      }
      setAlertResult({ ok: true, message: "Alert created" });
      setAlertPrice("");
    } finally {
      setAlertSubmitting(false);
    }
  }

  // Account is enough to trade (global free trade, 2026-06-10) — no
  // verification prefetch; reputation replaces identity at the point of
  // trade.
  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((data) => setLoggedIn(!!data?.user?.email))
      .catch(() => setLoggedIn(false));
  }, []);

  // Trading limits for the pre-submit hint. /api/escrow/trust returns the
  // caller's own trust profile — trade_limit and daily_limit are what
  // canTrade() enforces server-side on both order placement and offers.
  useEffect(() => {
    if (loggedIn !== true) return;
    fetch("/api/escrow/trust")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.profile) return;
        setLimits({
          tradeLimit: d.profile.trade_limit != null ? parseFloat(d.profile.trade_limit) : null,
          dailyLimit: d.profile.daily_limit != null ? parseFloat(d.profile.daily_limit) : null,
          warnings: d.tradeCheck?.warnings || [],
        });
      })
      .catch(() => {});
  }, [loggedIn]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);
    try {
      const res = await fetch("/api/market/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          side: tab === "buy" ? "bid" : "ask",
          sku,
          price: parseFloat(price),
          quantity: parseInt(quantity, 10),
          condition,
          ...(tab === "sell" && acceptsReturns
            ? { acceptsReturns: true, returnWindowDays: parseInt(returnWindowDays, 10) }
            : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to place order");
      }
      if (data.matched) {
        const trades: MarketTrade[] = data.trades || [];
        setResult({
          success: true,
          message: `Order placed — matched ${trades.length} trade${trades.length !== 1 ? "s" : ""} immediately.`,
          matched: {
            count: trades.length,
            paymentExpiresAt: trades[0]?.payment_expires_at ?? null,
            tradeId: trades.length === 1 ? trades[0]?.id ?? null : null,
          },
        });
      } else {
        setResult({ success: true, message: "Order placed on the book." });
      }
      setPrice("");
      setQuantity("1");
      fetchBook();
    } catch (err: any) {
      setResult({ success: false, message: err.message });
    } finally {
      setSubmitting(false);
    }
  }

  // Spread calculation
  const spread =
    book?.best_bid && book?.best_ask
      ? (Number(book.best_ask) - Number(book.best_bid)).toFixed(2)
      : null;

  if (loading) {
    return (
      <div className="min-h-screen">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-surface-elevated rounded w-64" />
            <div className="grid md:grid-cols-3 gap-6">
              <div className="aspect-[2.5/3.5] bg-surface-elevated rounded-lg" />
              <div className="bg-surface rounded-lg h-96" />
              <div className="bg-surface rounded-lg h-96" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // `book` is always seeded from server identity, so this is unreachable in
  // practice — kept as a guard for the type narrowing below.
  if (!book) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-bold font-display tracking-tight text-ink mb-2">Card not found</h2>
          <p className="text-ink-muted mb-4">This card has no catalogue entry.</p>
          <Link href="/market" className="text-accent hover:underline text-sm">
            Back to Market
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <div className="mb-6 text-sm">
          <Link href="/market" className="text-accent hover:underline">Market</Link>
          <span className="text-ink-faint mx-2">/</span>
          <span className="text-ink-muted">{book.card_name || sku}</span>
        </div>

        {/* Main layout */}
        <div className="grid md:grid-cols-[240px_1fr_320px] gap-6">
          {/* Left: Card image + spot info */}
          <div>
            {book.image_url ? (
              <div className="wardrobe-mat rounded-lg p-2">
                <img
                  src={book.image_url}
                  alt={book.card_name || sku}
                  className="w-full rounded"
                />
              </div>
            ) : (
              <div className="aspect-[2.5/3.5] w-full wardrobe-mat rounded-lg flex items-center justify-center">
                <span className="text-ink-faint">No Image</span>
              </div>
            )}
            <div className="flex items-start justify-between gap-2 mt-4">
              <div className="min-w-0">
                <h1 className="text-lg font-bold font-display tracking-tight text-ink">{book.card_name || sku}</h1>
                <p className="text-xs text-ink-faint font-mono tabular-nums">{sku}</p>
              </div>
              {loggedIn && watching !== null && (
                <button
                  onClick={toggleWatch}
                  disabled={watchToggling}
                  title={watching ? "Remove from watchlist" : "Add to watchlist"}
                  className={`text-xl transition shrink-0 ${watching ? "text-accent" : "text-ink-faint hover:text-accent"}`}
                  aria-label={watching ? "Unwatch" : "Watch"}
                >
                  {watching ? "★" : "☆"}
                </button>
              )}
            </div>
            {loggedIn && (
              <div className="mt-3">
                <button
                  onClick={() => setAlertOpen((o) => !o)}
                  className="text-xs text-ink-muted hover:text-accent transition"
                >
                  {alertOpen ? "− Hide alert" : "+ Set price alert"}
                </button>
                {alertOpen && (
                  <form onSubmit={submitAlert} className="mt-2 wardrobe-mat rounded-lg p-3 space-y-2">
                    <div className="flex gap-2">
                      <select
                        value={alertDirection}
                        onChange={(e) => setAlertDirection(e.target.value as "below" | "above")}
                        className="px-2 py-1.5 bg-surface-elevated border border-border-strong rounded text-ink text-xs"
                      >
                        <option value="below">Notify when ask ≤</option>
                        <option value="above">Notify when sold ≥</option>
                      </select>
                      <div className="relative flex-1">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-faint text-xs">£</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          value={alertPrice}
                          onChange={(e) => setAlertPrice(e.target.value)}
                          required
                          placeholder="0.00"
                          className="w-full pl-6 pr-2 py-1.5 bg-surface-elevated border border-border-strong rounded text-ink text-xs font-mono tabular-nums"
                        />
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={alertSubmitting}
                      className="w-full px-3 py-1.5 bg-accent text-page text-xs font-bold rounded hover:bg-accent-strong transition disabled:opacity-50"
                    >
                      {alertSubmitting ? "..." : "Create alert"}
                    </button>
                    {alertResult && (
                      <p className={`text-xs ${alertResult.ok ? "text-ok" : "text-danger"}`}>
                        {alertResult.message}
                      </p>
                    )}
                  </form>
                )}
              </div>
            )}

            {/* Reference price panel below card image */}
            <div className="mt-4">
              <AlsoAtAuctionStrip auctions={alsoAtAuction} />
              <ReferencePricePanel view={book} />
              {analytics && <PriceHistoryTile analytics={analytics} />}
              {fairValue && fairValue.tradeCount > 0 && (
                <div className="wardrobe-mat rounded-lg p-3 mb-4 space-y-1.5">
                  <p className="text-[10px] text-ink-faint uppercase tracking-wide">Fair value (30d)</p>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-ink-muted">VWAP</span>
                    <span className="font-mono tabular-nums text-ink">
                      {fairValue.vwap !== null ? <Money value={fairValue.vwap} /> : "—"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-ink-muted">Median</span>
                    <span className="font-mono tabular-nums text-ink-muted">
                      {fairValue.median !== null ? <Money value={fairValue.median} /> : "—"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-ink-faint">Range</span>
                    <span className="font-mono tabular-nums text-ink-faint">
                      {fairValue.priceRange.min !== null && fairValue.priceRange.max !== null
                        ? `${formatPrice(fairValue.priceRange.min)}–${formatPrice(fairValue.priceRange.max)}`
                        : "—"}
                    </span>
                  </div>
                  <p className="text-[10px] text-ink-faint pt-1">
                    Based on <span className="font-mono tabular-nums">{fairValue.tradeCount}</span> trade{fairValue.tradeCount !== 1 ? "s" : ""} &middot; <span className="font-mono tabular-nums">{fairValue.totalVolume}</span> unit{fairValue.totalVolume !== 1 ? "s" : ""}
                  </p>
                </div>
              )}
              {/* Cold tape: no own trades to compute a fair value from, so
                  the catalogue reference price stands in — labelled, because
                  it is a different kind of fact (a catalogue number, not a
                  P2P clearing price, and nobody's offer). */}
              {fairValue && fairValue.tradeCount === 0 && book.reference_price != null && (
                <div className="wardrobe-mat rounded-lg p-3 mb-4 space-y-1.5">
                  <p className="text-[10px] text-ink-faint uppercase tracking-wide">Fair value (30d)</p>
                  <p className="text-xs text-ink-muted">
                    No P2P trades in the last 30 days — nothing to compute a fair value from.
                  </p>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-ink-muted">Reference price</span>
                    <span className="font-mono tabular-nums text-ink"><Money value={book.reference_price} /></span>
                  </div>
                  <p
                    className="text-[10px] uppercase tracking-wider text-ink-faint"
                    title="The catalogue reference price, shown as a reference only. It is open data — a different source than what peers paid each other, and not an offer from anyone."
                  >
                    reference · catalogue, not p2p tape
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Center: Order book + per-listing asks */}
          <div className="space-y-6">
          <div className="wardrobe-mat rounded-lg p-4">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-sm font-bold font-display tracking-tight text-ink">Order Book</h2>
            </div>

            {error && (
              <p className="text-xs text-warning bg-warning/10 border border-warning/30 rounded-lg px-3 py-2 mb-3">
                {error}
              </p>
            )}

            {/* Spread indicator */}
            <div className="flex items-center gap-3 mb-4 text-xs">
              <span className="text-bid">
                Best Bid: {book.best_bid ? <Money value={Number(book.best_bid)} className="font-mono tabular-nums" /> : "—"}
              </span>
              {spread && (
                <span className="px-2 py-0.5 bg-surface-subtle rounded text-ink-muted">
                  Spread: <Money value={Number(spread)} className="font-mono tabular-nums" />
                </span>
              )}
              <span className="text-ask">
                Best Ask: {book.best_ask ? <Money value={Number(book.best_ask)} className="font-mono tabular-nums" /> : "—"}
              </span>
            </div>

            {/* Buy routing info */}
            <div className="mb-4">
              <BuyRoutingInfo view={book} onBuy={prefillBuy} />
            </div>

            {book.bids.length === 0 && book.asks.length === 0 ? (
              <EmptyState
                title={v("market.empty.book.title")}
                description={v("market.empty.book.description")}
              />
            ) : (
              <OrderBookViz bids={book.bids} asks={book.asks} />
            )}
          </div>

          {/* Per-listing asks: negotiate (offers) + pre-trade contact */}
          <ListingsPanel
            sku={sku}
            loggedIn={loggedIn}
            bestBid={book.best_bid !== null ? Number(book.best_bid) : null}
            fairValue={fairValue}
            spotPrice={book.reference_price}
            limits={limits}
            onBuy={prefillBuy}
          />
          </div>

          {/* Right: the order form — collectors trading with collectors */}
          <div className="space-y-4">
            {/* ========== P2P Order Form ========== */}
            <div
              ref={buyFormRef}
              className={`wardrobe-mat rounded-lg p-4 transition-shadow ${
                prefillPulse ? "ring-2 ring-accent" : ""
              }`}
            >
            <div className="flex mb-4 bg-surface-subtle border border-border-subtle rounded-lg p-1">
              <button
                onClick={() => { setTab("buy"); setResult(null); }}
                className={`flex-1 py-2 text-sm font-bold rounded-md transition ${
                  tab === "buy"
                    ? "bg-bid text-page"
                    : "text-ink-muted hover:text-ink"
                }`}
              >
                Buy
              </button>
              <button
                onClick={() => { setTab("sell"); setResult(null); }}
                className={`flex-1 py-2 text-sm font-bold rounded-md transition ${
                  tab === "sell"
                    ? "bg-ask text-page"
                    : "text-ink-muted hover:text-ink"
                }`}
              >
                Sell
              </button>
            </div>

            {/* Reference price */}
            <div className="mb-4 text-xs text-ink-muted">
              {tab === "buy" ? "Best ask: " : "Best bid: "}
              <span className="font-mono tabular-nums">
                {tab === "buy"
                  ? (book.best_ask ? formatPrice(Number(book.best_ask)) : "—")
                  : (book.best_bid ? formatPrice(Number(book.best_bid)) : "—")}
              </span>
              {tab === "buy" && book.reference_price != null && (
                <span className="ml-2 text-ink-faint" title="Catalogue reference price — open data, not an offer.">
                  (ref: <Money value={book.reference_price} className="font-mono tabular-nums" />)
                </span>
              )}
            </div>

            {loggedIn === false ? (
              <div className="text-center py-8">
                <p className="text-ink-muted text-sm mb-3">You need to be signed in to trade.</p>
                <Link
                  href={signInHref}
                  className="text-accent hover:underline text-sm font-medium"
                >
                  Sign in to trade &mdash; you&rsquo;ll come back here
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs text-ink-faint mb-1">Price (GBP)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint text-sm">£</span>
                    <input
                      ref={priceInputRef}
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      required
                      className="w-full pl-7 pr-3 py-2.5 bg-surface-elevated border border-border-strong rounded-lg text-ink text-sm font-mono tabular-nums focus:outline-none focus:border-accent transition"
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-ink-faint mb-1">Quantity</label>
                  <input
                    type="number"
                    min="1"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    required
                    className="w-full px-3 py-2.5 bg-surface-elevated border border-border-strong rounded-lg text-ink text-sm font-mono tabular-nums focus:outline-none focus:border-accent transition"
                  />
                </div>

                <div>
                  <label className="block text-xs text-ink-faint mb-1">Condition</label>
                  <select
                    value={condition}
                    onChange={(e) => setCondition(e.target.value as typeof condition)}
                    className="w-full px-3 py-2.5 bg-surface-elevated border border-border-strong rounded-lg text-ink text-sm focus:outline-none focus:border-accent transition"
                  >
                    {CONDITIONS.map((c) => (
                      <option key={c.code} value={c.code}>{c.label}</option>
                    ))}
                  </select>
                </div>

                {/* Listing options — asks only. The toggle + window are
                    frozen onto any resulting trade, so a later edit to the
                    listing can't change a completed trade's eligibility. */}
                {tab === "sell" && (
                  <div className="bg-surface-subtle rounded-lg p-3 space-y-2">
                    <label className="flex items-center gap-2 text-xs text-ink cursor-pointer">
                      <input
                        type="checkbox"
                        checked={acceptsReturns}
                        onChange={(e) => setAcceptsReturns(e.target.checked)}
                        className="accent-current"
                      />
                      <span className="font-medium">Accept returns</span>
                      <WhyLink href="/methodology/trade-completion" tooltip="How no-fault returns work" />
                    </label>
                    {acceptsReturns && (
                      <div className="flex items-center gap-2 text-xs text-ink-muted">
                        <span>Return window</span>
                        <select
                          value={returnWindowDays}
                          onChange={(e) => setReturnWindowDays(e.target.value)}
                          className="px-2 py-1 bg-surface-elevated border border-border-strong rounded text-ink text-xs"
                        >
                          <option value="7">7 days</option>
                          <option value="14">14 days</option>
                          <option value="30">30 days</option>
                        </select>
                      </div>
                    )}
                    <p className="text-[10px] text-ink-faint leading-relaxed">
                      {acceptsReturns
                        ? "Buyers can request a no-fault return within the window after the trade completes. You review each request; refunds are issued by Cambridge TCG admins, not automatically."
                        : "Off: buyers can still open disputes for misdescribed or missing cards, but no change-of-mind returns."}
                    </p>
                  </div>
                )}

                {/* Total preview */}
                {price && quantity && (
                  <div className="text-xs text-ink-muted text-right">
                    Total: <Money value={parseFloat(price) * parseInt(quantity, 10) || 0} className="font-mono tabular-nums" />
                  </div>
                )}

                {/* Fill probability — only meaningful for bids */}
                {tab === "buy" && bidAnalysis && bidAnalysis.fillProbabilityPct !== null && (
                  <div className={`text-xs rounded-lg px-3 py-2 border ${
                    bidAnalysis.fillProbabilityPct >= 50 ? "bg-bid/10 border-bid/20 text-bid"
                    : bidAnalysis.fillProbabilityPct >= 20 ? "bg-accent-wash border-accent/20 text-accent"
                    : "bg-surface-elevated border-border-strong text-ink-muted"
                  }`}>
                    <div className="flex items-center justify-between">
                      <span>Historical fill odds</span>
                      <span className="font-mono tabular-nums font-bold">{bidAnalysis.fillProbabilityPct}%</span>
                    </div>
                    {bidAnalysis.expectedDaysToFill !== null && (
                      <div className="flex items-center justify-between mt-0.5 text-[10px] opacity-80">
                        <span>Expected time to fill</span>
                        <span className="font-mono tabular-nums">~{bidAnalysis.expectedDaysToFill}d</span>
                      </div>
                    )}
                    <p className="text-[10px] text-ink-faint mt-1">
                      % of last 30d trades at or below this price.
                    </p>
                  </div>
                )}

                {/* Pre-submit trust hint — mirrors the canTrade() gate the
                    server enforces, so a limit rejection is announced here
                    instead of arriving as a 403 after submit. */}
                {(() => {
                  const total = (parseFloat(price) || 0) * (parseInt(quantity, 10) || 0);
                  const warning = tradeLimitWarning(total, limits);
                  if (warning) {
                    return (
                      <p className="text-xs text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">
                        {warning}
                        <WhyLink href="/methodology/trust-score" tooltip="How trading limits are set" />
                      </p>
                    );
                  }
                  if (total > 0 && limits && limits.warnings.length > 0) {
                    return <p className="text-[11px] text-accent">{limits.warnings[0]}</p>;
                  }
                  return null;
                })()}

                <button
                  type="submit"
                  disabled={submitting || loggedIn === null}
                  className={`w-full py-3 rounded-lg font-bold text-sm transition disabled:opacity-50 ${
                    tab === "buy"
                      ? "bg-bid text-page hover:opacity-90"
                      : "bg-ask text-page hover:opacity-90"
                  }`}
                >
                  {(() => {
                    if (submitting) return "Submitting...";
                    if (tab === "sell") return "Place Ask";
                    // A bid at/above the best ask crosses the book — it
                    // buys immediately. Say so, and name the price.
                    const parsed = parseFloat(price);
                    const crosses =
                      book.best_ask != null &&
                      Number.isFinite(parsed) &&
                      parsed >= Number(book.best_ask);
                    return crosses ? `Buy for ${formatPrice(parsed)}` : "Place Bid";
                  })()}
                </button>

                {result && (
                  <div
                    className={`p-3 rounded-lg text-sm ${
                      result.success
                        ? "bg-ok/10 text-ok border border-ok/30"
                        : "bg-danger/10 text-danger border border-danger/30"
                    }`}
                  >
                    <p>{result.message}</p>
                    {result.matched && (
                      <p className="text-xs text-ink-muted mt-1.5">
                        {result.matched.tradeId ? (
                          <Link
                            href={`/account/trades/${result.matched.tradeId}`}
                            className="text-accent hover:underline font-medium"
                          >
                            View your trade &rarr;
                          </Link>
                        ) : (
                          // /account/trades opens on Open Orders; matched
                          // trades live under Trade History — name it.
                          <Link href="/account/trades" className="text-accent hover:underline font-medium">
                            View your trades (under Trade History) &rarr;
                          </Link>
                        )}{" "}
                        {result.matched.paymentExpiresAt ? (
                          tab === "buy"
                            ? <>Payment is due by <span className="font-mono tabular-nums">{formatDateTime(result.matched.paymentExpiresAt)}</span> (your payment window) or the trade cancels.</>
                            : <>The buyer&rsquo;s payment is due by <span className="font-mono tabular-nums">{formatDateTime(result.matched.paymentExpiresAt)}</span> (their payment window); you&rsquo;ll be notified when it lands.</>
                        ) : (
                          "Payment is due within the buyer's payment window — the trade page shows the exact deadline."
                        )}
                      </p>
                    )}
                  </div>
                )}
              </form>
            )}

            {/* Escrow routing preview */}
            {loggedIn !== false && price && quantity && (
              <EscrowRoutingPreview orderValue={parseFloat(price) * parseInt(quantity, 10) || 0} />
            )}

            {/* Reputation checker (global free trade, 2026-06-10): the
                verification wall came down; what stands in its place is
                visibility — who is on the other side of the best ask, and
                how the room remembers them. */}
            <div className="mt-4 pt-4 border-t border-border-subtle space-y-2">
              {book.best_ask_seller?.username && (
                <div className="flex items-center gap-2 flex-wrap text-xs">
                  <span className="text-ink-faint">Best ask from</span>
                  <Link
                    href={`/u/${book.best_ask_seller.username}`}
                    className="text-accent hover:underline font-medium"
                  >
                    @{book.best_ask_seller.username}
                  </Link>
                  {book.best_ask_seller.tier && (
                    <TrustTier
                      name={book.best_ask_seller.tier}
                      score={book.best_ask_seller.trust_score}
                    />
                  )}
                  <Link
                    href={`/u/${book.best_ask_seller.username}/trust`}
                    className="text-ink-muted hover:text-accent hover:underline"
                  >
                    <span className="font-mono tabular-nums">{book.best_ask_seller.review_count}</span> review{book.best_ask_seller.review_count !== 1 ? "s" : ""}
                    {book.best_ask_seller.avg_rating != null && book.best_ask_seller.review_count > 0 && (
                      <> &middot; <span className="font-mono tabular-nums">{book.best_ask_seller.avg_rating.toFixed(1)}</span>★</>
                    )}
                  </Link>
                </div>
              )}
              <p className="text-[11px] text-ink-faint leading-relaxed">
                Trades are protected by escrow routing and the{" "}
                <Link href="/methodology/trust-score" className="text-accent hover:underline">
                  reputation system
                </Link>
                {" "}&mdash; check any counterparty before you trade.
              </p>
            </div>

          </div>

          </div>
        </div>

        {/* Recent trades */}
        <div className="mt-8 wardrobe-mat rounded-lg p-4">
          <h2 className="text-sm font-bold font-display tracking-tight text-ink mb-4">Recent Trades</h2>
          {book.recent_trades.length === 0 ? (
            <p className="text-ink-faint text-sm py-4 text-center">No trades yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-ink-faint text-xs uppercase tracking-wide border-b border-border-subtle">
                    <th className="text-left py-2 font-medium">Price</th>
                    <th className="text-left py-2 font-medium">Quantity</th>
                    <th className="text-left py-2 font-medium">Seller</th>
                    <th className="text-right py-2 font-medium">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {book.recent_trades.map((trade) => (
                    <tr key={trade.id} className="border-b border-border-subtle/50">
                      <td className="py-2 text-ink font-mono tabular-nums">
                        <Money value={Number(trade.price)} />
                      </td>
                      <td className="py-2 text-ink-muted font-mono tabular-nums">{trade.quantity}</td>
                      <td className="py-2 text-ink-muted text-xs">
                        {trade.seller_username ? (
                          <span className="inline-flex items-center gap-1.5">
                            <Link
                              href={`/u/${trade.seller_username}`}
                              className="text-accent hover:underline"
                            >
                              {trade.seller_name || trade.seller_username}
                            </Link>
                            {trade.seller_tier && (
                              <TrustTier name={trade.seller_tier} score={null} showScore={false} />
                            )}
                          </span>
                        ) : (
                          <span className="text-ink-faint">—</span>
                        )}
                      </td>
                      <td className="py-2 text-ink-faint text-right text-xs font-mono tabular-nums">
                        {formatTime(trade.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {related.length > 0 && (
          <div className="mt-8 wardrobe-mat rounded-lg p-4">
            <h2 className="text-sm font-bold font-display tracking-tight text-ink mb-4">
              Also watched by buyers of this card
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
              {related.map((r) => (
                <Link
                  key={r.sku}
                  href={`/market/${r.sku}`}
                  className="group block"
                >
                  <div className="aspect-[2.5/3.5] bg-surface-subtle border border-border-subtle rounded-lg overflow-hidden mb-2">
                    {r.imageUrl ? (
                      <img src={r.imageUrl} alt="" className="w-full h-full object-cover group-hover:scale-105 transition" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-ink-faint text-xs">
                        No image
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-ink truncate group-hover:text-accent transition">
                    {r.cardName || r.sku}
                  </p>
                  <div className="flex items-center justify-between text-[10px] text-ink-faint mt-0.5">
                    <span><span className="font-mono tabular-nums">{r.coWatchCount}</span> watchers</span>
                    {r.bestAsk !== null && (
                      <span className="text-ask font-mono tabular-nums"><Money value={r.bestAsk} /></span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
