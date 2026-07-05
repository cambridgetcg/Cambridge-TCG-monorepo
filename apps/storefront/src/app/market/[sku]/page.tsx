"use client";

import Link from "next/link";
import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, usePathname } from "next/navigation";
import { formatPrice, formatDateTime } from "@/lib/format";
import { Money, EmptyState, Icon, TrustTier, WhyLink, type IconName } from "@/lib/ui";
import { useVoice } from "@/lib/wardrobe/context";
import { useToast } from "@/components/ui/Toast";
import { useCreditSell } from "@/context/CreditSellContext";
import type { OrderBookEntry, MarketTrade } from "@/lib/market/types";
import type { UnifiedMarketView } from "@/lib/market/unified";
import type { EscrowTier } from "@/lib/escrow/service-tiers";
import { ListingsPanel, type TrustLimits } from "./ListingsPanel";
import { tradeLimitWarning } from "./offer-guidance";

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

type UnifiedAsk = OrderBookEntry & { is_house?: boolean };
type UnifiedBid = OrderBookEntry & { is_house?: boolean; is_credit?: boolean; label?: string };

function OrderBookViz({
  bids,
  asks,
  onHouseAskClick,
  onHouseBidClick,
}: {
  bids: UnifiedBid[];
  asks: UnifiedAsk[];
  onHouseAskClick?: () => void;
  onHouseBidClick?: () => void;
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
          onHouseAskClick={onHouseAskClick}
          onHouseBidClick={onHouseBidClick}
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
  onHouseAskClick,
  onHouseBidClick,
}: {
  bid?: UnifiedBid;
  ask?: UnifiedAsk;
  maxBidQty: number;
  maxAskQty: number;
  isFirst: boolean;
  onHouseAskClick?: () => void;
  onHouseBidClick?: () => void;
}) {
  const isHouse = ask?.is_house;
  const askBgColor = isHouse ? "bg-accent-wash" : "bg-ask/20";
  const askTextColor = isHouse ? "text-accent" : "text-ask";
  const askBorderColor = isFirst
    ? isHouse ? "border-l-2 border-accent/40" : "border-l-2 border-ask/40"
    : "border-l border-border-subtle";

  const isBidHouse = bid?.is_house && bid?.is_credit;
  const bidBgColor = isBidHouse ? "bg-accent-wash" : "bg-bid/20";
  const bidTextColor = isBidHouse ? "text-accent" : "text-bid";
  const bidBorderColor = isFirst
    ? isBidHouse ? "border-r-2 border-accent/40" : "border-r-2 border-bid/40"
    : "border-r border-border-subtle";

  // House rows are clickable shortcuts to the matching real action.
  // P2P rows are display-only — clicking them does not match orders, the form does.
  const askClickable = isHouse && onHouseAskClick;
  const bidClickable = isBidHouse && onHouseBidClick;

  return (
    <>
      {/* Bid cell */}
      <div
        className={`relative h-8 flex items-center ${bidBorderColor} ${bidClickable ? "cursor-pointer hover:brightness-125" : ""}`}
        onClick={bidClickable ? onHouseBidClick : undefined}
        role={bidClickable ? "button" : undefined}
        tabIndex={bidClickable ? 0 : undefined}
        onKeyDown={bidClickable ? (e) => { if (e.key === "Enter") onHouseBidClick?.(); } : undefined}
        title={bidClickable ? "Sell to CTCG for store credit" : undefined}
      >
        {bid ? (
          <>
            <div
              className={`absolute inset-y-0 right-0 ${bidBgColor} rounded-l`}
              style={{ width: `${(Math.min(bid.total_quantity, maxBidQty) / maxBidQty) * 100}%` }}
            />
            <span className="relative z-10 w-full flex justify-between px-2 text-xs font-mono tabular-nums">
              <span className="text-ink-muted">{isBidHouse ? "\u221E" : bid.total_quantity}</span>
              <span className={`${bidTextColor} font-medium flex items-center gap-1`}>
                {isBidHouse && <span title="CTCG Store Credit" className="flex items-center"><Icon name="credit" size={12} /></span>}
                <Money value={Number(bid.price)} />
                {isBidHouse && <span className="text-[10px] text-accent font-sans font-semibold">CTCG &mdash; We Buy (unlimited)</span>}
                {isBidHouse && <span className="text-[9px] bg-accent-wash text-accent px-1 py-px rounded font-sans">credit</span>}
              </span>
            </span>
          </>
        ) : (
          <span className="w-full text-center text-ink-faint text-xs">—</span>
        )}
      </div>
      {/* Ask cell */}
      <div
        className={`relative h-8 flex items-center ${askBorderColor} ${askClickable ? "cursor-pointer hover:brightness-125" : ""}`}
        onClick={askClickable ? onHouseAskClick : undefined}
        role={askClickable ? "button" : undefined}
        tabIndex={askClickable ? 0 : undefined}
        onKeyDown={askClickable ? (e) => { if (e.key === "Enter") onHouseAskClick?.(); } : undefined}
        title={askClickable ? "Buy from CTCG (catalog)" : undefined}
      >
        {ask ? (
          <>
            <div
              className={`absolute inset-y-0 left-0 ${askBgColor} rounded-r`}
              style={{ width: `${(ask.total_quantity / maxAskQty) * 100}%` }}
            />
            <span className="relative z-10 w-full flex justify-between px-2 text-xs font-mono tabular-nums">
              <span className={`${askTextColor} font-medium flex items-center gap-1`}>
                {isHouse && <span title="CTCG stock" className="flex items-center"><Icon name="card" size={12} /></span>}
                <Money value={Number(ask.price)} />
                {isHouse && <span className="text-[10px] text-accent font-sans font-semibold">CTCG</span>}
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

/** Spot price + market price info panel */
function SpotPricePanel({ view }: { view: UnifiedMarketView }) {
  const { spot_price, spot_stock, market_price, p2p_discount, tradein_credit, tradein_cash } = view;

  return (
    <div className="wardrobe-mat rounded-lg p-3 mb-4 space-y-2">
      {/* CTCG Spot */}
      {spot_price != null ? (
        <div className="flex items-center justify-between">
          <span className="text-xs text-ink-muted">CTCG Spot</span>
          <span className="text-sm font-mono tabular-nums text-accent font-bold">
            <Money value={spot_price} />
            <span className="text-xs text-ink-faint font-normal ml-1.5">
              ({spot_stock} in stock)
            </span>
          </span>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <span className="text-xs text-ink-muted">CTCG Spot</span>
          <span className="text-xs text-ink-faint">Not available</span>
        </div>
      )}

      {/* Market Price */}
      {market_price != null && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-ink-muted">Market Price</span>
          <span className="text-sm font-mono tabular-nums text-ink font-bold">
            <Money value={market_price} />
            {p2p_discount != null && p2p_discount > 0 && (
              <span className="ml-1.5 text-[10px] font-sans font-semibold px-1.5 py-0.5 rounded-full bg-ok/10 text-ok border border-ok/30">
                <span className="font-mono tabular-nums">{p2p_discount}%</span> below spot
              </span>
            )}
          </span>
        </div>
      )}

      {/* CTCG two-sided spread */}
      {spot_price != null && tradein_credit != null && (
        <div className="border-t border-border-subtle pt-2 mt-2 space-y-1.5">
          <span className="text-[10px] text-ink-faint uppercase tracking-wide">CTCG Spread</span>
          <div className="flex items-center justify-between">
            <span className="text-xs text-ink-muted">CTCG Sells at</span>
            <span className="text-xs font-mono tabular-nums text-accent font-semibold"><Money value={spot_price} /></span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-ink-muted">CTCG Buys at</span>
            <span className="text-xs font-mono tabular-nums text-accent font-semibold">
              <Money value={tradein_credit} />
              <span className="ml-1 text-[9px] bg-accent-wash text-accent px-1 py-px rounded">credit</span>
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-ink-faint">Spread</span>
            <span className="text-xs font-mono tabular-nums text-ink-faint"><Money value={spot_price - tradein_credit} /></span>
          </div>
        </div>
      )}

      {/* Trade-in reference (when no full spread available) */}
      {spot_price == null && (tradein_credit != null || tradein_cash != null) && (
        <div className="border-t border-border-subtle pt-2 mt-2 space-y-1">
          <span className="text-[10px] text-ink-faint uppercase tracking-wide">Trade-in reference</span>
          {tradein_credit != null && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-ink-faint">Trade-in credit</span>
              <span className="text-xs font-mono tabular-nums text-accent">~<Money value={tradein_credit} /></span>
            </div>
          )}
          {tradein_cash != null && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-ink-faint">Trade-in cash</span>
              <span className="text-xs font-mono tabular-nums text-ink-muted">~<Money value={tradein_cash} /></span>
            </div>
          )}
        </div>
      )}

      {/* Cash trade-in (shown alongside spread if available) */}
      {spot_price != null && tradein_cash != null && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-ink-faint">Cash trade-in</span>
          <span className="text-xs font-mono tabular-nums text-ink-muted">~<Money value={tradein_cash} /></span>
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

/** Buy routing info — tells user where they're buying from */
function BuyRoutingInfo({ view }: { view: UnifiedMarketView }) {
  const { asks, spot_price } = view;
  if (asks.length === 0) return null;

  const bestAsk = asks[0];
  const bestPrice = Number(bestAsk.price);
  const isHouse = bestAsk.is_house;

  if (isHouse) {
    return (
      <div className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-accent-wash border border-accent/20 text-accent">
        <Icon name="card" size={12} className="shrink-0" />
        <span>Buy from CTCG at <Money value={bestPrice} className="font-mono tabular-nums" /> (guaranteed stock)</span>
      </div>
    );
  }

  // P2P seller — show savings vs CTCG if spot exists
  if (spot_price != null && bestPrice < spot_price) {
    const savings = spot_price - bestPrice;
    return (
      <div className="text-xs px-3 py-2 rounded-lg bg-bid/10 border border-bid/20 text-bid">
        Buy from seller at <Money value={bestPrice} className="font-mono tabular-nums" /> (save <Money value={savings} className="font-mono tabular-nums" /> vs CTCG spot)
      </div>
    );
  }

  return (
    <div className="text-xs px-3 py-2 rounded-lg bg-surface-elevated border border-border-strong text-ink-muted">
      Buy from seller at <Money value={bestPrice} className="font-mono tabular-nums" />
    </div>
  );
}

export default function CardMarketPage() {
  const params = useParams();
  const sku = params.sku as string;
  const pathname = usePathname();
  // Sign-in CTAs carry the current path so the login flow can return here.
  const signInHref = `/login?return=${encodeURIComponent(pathname || `/market/${sku}`)}`;
  const v = useVoice();

  const [book, setBook] = useState<UnifiedMarketView | null>(null);
  const [analytics, setAnalytics] = useState<{
    sparkline: number[];
    lastPrice: number | null;
    change24hPct: number | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
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
    matched?: { count: number; paymentExpiresAt: string | null };
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

  // Sell-for-credit state
  const [creditQty, setCreditQty] = useState(1);
  const [creditAdded, setCreditAdded] = useState(false);
  const { toast } = useToast();
  const { addItem, openDrawer, items, updateQty } = useCreditSell();

  const pollRef = useRef<ReturnType<typeof setInterval>>(undefined);

  const fetchBook = useCallback(async () => {
    try {
      const res = await fetch(`/api/market/${sku}/unified`);
      if (!res.ok) throw new Error("Not found");
      const data: UnifiedMarketView = await res.json();
      setBook(data);
      setError("");
    } catch {
      setError("Could not load order book.");
    } finally {
      setLoading(false);
    }
  }, [sku]);

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

  function handleAddToSellCart() {
    if (!book) return;
    const existing = items.find(i => i.sku === sku);
    const currentQty = existing?.quantity || 0;
    // Add the item (creates if not exists, increments by 1)
    addItem({
      sku,
      name: book.card_name || sku,
      cardNumber: book.card_number || "",
      setCode: book.set_code || null,
      imageUrl: book.image_url || null,
      creditPrice: book.tradein_credit!,
    });
    // Set the correct total quantity
    if (creditQty > 1) {
      updateQty(sku, currentQty + creditQty);
    }
    toast("Added to sell cart", "success");
    setCreditAdded(true);
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

  if (error || !book) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-bold font-display tracking-tight text-ink mb-2">Order book not found</h2>
          <p className="text-ink-muted mb-4">{error || "This card has no market activity."}</p>
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

            {/* Spot price panel below card image */}
            <div className="mt-4">
              <SpotPricePanel view={book} />
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
                  the CTCG spot stands in — labelled, because it is a
                  different kind of fact (our catalogue price, not a P2P
                  clearing price). */}
              {fairValue && fairValue.tradeCount === 0 && book.spot_price != null && (
                <div className="wardrobe-mat rounded-lg p-3 mb-4 space-y-1.5">
                  <p className="text-[10px] text-ink-faint uppercase tracking-wide">Fair value (30d)</p>
                  <p className="text-xs text-ink-muted">
                    No P2P trades in the last 30 days — nothing to compute a fair value from.
                  </p>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-ink-muted">CTCG spot</span>
                    <span className="font-mono tabular-nums text-accent"><Money value={book.spot_price} /></span>
                  </div>
                  <p
                    className="text-[10px] uppercase tracking-wider text-ink-faint"
                    title="Cambridge TCG's own catalogue price, shown as a reference only. It is our retail price — a different source than what peers paid each other."
                  >
                    reference · ctcg catalogue, not p2p tape
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
              {book.demand_pressure && book.demand_pressure.pressure > 0 && (
                <span
                  className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-accent-wash text-accent border border-accent/30"
                  title={`${book.demand_pressure.watchCount} watchers, ${book.demand_pressure.alertCount} alerts, ${book.demand_pressure.askDepth} asks available`}
                >
                  <Icon name="pulse" size={10} /> Demand pressure{book.demand_pressure.tightenPct > 0 && (
                    <span className="font-mono tabular-nums"> · CTCG tightened {(book.demand_pressure.tightenPct * 100).toFixed(1)}%</span>
                  )}
                </span>
              )}
            </div>

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
              <BuyRoutingInfo view={book} />
            </div>

            {book.bids.length === 0 && book.asks.length === 0 ? (
              <EmptyState
                title={v("market.empty.book.title")}
                description={v("market.empty.book.description")}
              />
            ) : (
              <OrderBookViz
                bids={book.bids}
                asks={book.asks}
                onHouseAskClick={() => { window.location.href = `/product/${sku}`; }}
                onHouseBidClick={handleAddToSellCart}
              />
            )}
          </div>

          {/* Per-listing asks: negotiate (offers) + pre-trade contact */}
          <ListingsPanel
            sku={sku}
            loggedIn={loggedIn}
            bestBid={book.best_bid !== null ? Number(book.best_bid) : null}
            fairValue={fairValue}
            spotPrice={book.spot_price}
            limits={limits}
          />
          </div>

          {/* Right: P2P forms first; the house credit box follows */}
          <div className="space-y-4">
            {/* ========== P2P Order Form ========== */}
            <div className="wardrobe-mat rounded-lg p-4">
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
              {tab === "buy" && book.spot_price != null && (
                <span className="ml-2 text-accent/80">
                  (CTCG Spot: <Money value={book.spot_price} className="font-mono tabular-nums" />)
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
                  {submitting
                    ? "Submitting..."
                    : tab === "buy"
                    ? "Place Bid"
                    : "Place Ask"}
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
                        <Link href="/account/trades" className="text-accent hover:underline font-medium">
                          View your trade{result.matched.count !== 1 ? "s" : ""} &rarr;
                        </Link>{" "}
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

            {/* ========== Cambridge TCG buys this card ==========
                The house standing bid, below the P2P surface: peer
                listings and negotiation lead this column; CTCG's credit
                bid is the fallback, not the headline. */}
            {book.tradein_credit != null && book.tradein_credit > 0 && (
              <div className="rounded-lg bg-accent-wash border border-border-subtle">
                <div className="p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="flex items-center text-accent"><Icon name="credit" size={18} /></span>
                    <h3 className="text-sm font-bold font-display text-ink uppercase tracking-wide">Cambridge TCG Buys This Card</h3>
                  </div>

                  {/* Stacked vertical: side-by-side caused word-by-word wrapping
                      because the parent column is fixed at 320px on md+ and the
                      description ended up with ~68px of width. */}
                  <div className="flex flex-col gap-3">
                    {/* Top: price + quantity + button */}
                    <div className="bg-surface border border-border-subtle rounded-lg p-4">
                      <p className="text-2xl font-bold font-mono tabular-nums text-accent mb-0.5">
                        <Money value={book.tradein_credit} />
                        <span className="text-sm ml-1.5 bg-accent-wash text-accent px-1.5 py-0.5 rounded font-sans font-semibold">
                          Store Credit
                        </span>
                      </p>

                      {!creditAdded && (
                        <>
                          {/* Quantity selector */}
                          <div className="flex items-center gap-2 mt-3 mb-3">
                            <span className="text-xs text-ink-muted">Qty:</span>
                            <button
                              onClick={() => setCreditQty(Math.max(1, creditQty - 1))}
                              className="w-6 h-6 flex items-center justify-center bg-surface-elevated border border-border-subtle text-ink-muted rounded hover:bg-surface-subtle transition text-xs font-bold"
                            >
                              -
                            </button>
                            <span className="text-sm font-mono tabular-nums text-ink w-8 text-center">{creditQty}</span>
                            <button
                              onClick={() => setCreditQty(Math.min(99, creditQty + 1))}
                              className="w-6 h-6 flex items-center justify-center bg-surface-elevated border border-border-subtle text-ink-muted rounded hover:bg-surface-subtle transition text-xs font-bold"
                            >
                              +
                            </button>
                          </div>

                          {loggedIn === false ? (
                            <Link
                              href={signInHref}
                              className="block w-full text-center py-2.5 rounded-lg font-bold text-sm bg-accent text-page hover:bg-accent-strong transition"
                            >
                              Sign in to sell
                            </Link>
                          ) : (
                            <button
                              onClick={handleAddToSellCart}
                              disabled={loggedIn === null}
                              className="w-full py-2.5 rounded-lg font-bold text-sm bg-accent text-page hover:bg-accent-strong transition disabled:opacity-50"
                            >
                              Sell for <span className="font-mono tabular-nums">{formatPrice(book.tradein_credit * creditQty)}</span> Credit
                            </button>
                          )}
                        </>
                      )}

                      {/* Success state */}
                      {creditAdded && (
                        <div className="mt-3 space-y-2">
                          <div className="bg-accent-wash border border-accent/30 rounded-lg p-3">
                            <p className="text-sm font-semibold text-accent">
                              Added to sell cart
                            </p>
                            <p className="text-[11px] text-ink-muted mt-1">
                              Submit your cart to lock in this offer. We&rsquo;ll confirm credit after inspection.
                            </p>
                          </div>
                          <button
                            onClick={openDrawer}
                            className="w-full py-2 rounded-lg font-bold text-sm bg-accent-wash text-accent border border-accent/30 hover:bg-accent/20 transition"
                          >
                            View Cart
                          </button>
                          <button
                            onClick={() => { setCreditAdded(false); setCreditQty(1); }}
                            className="text-xs text-accent hover:text-accent-strong transition"
                          >
                            Add more
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Bottom: messaging */}
                    <div className="space-y-1.5">
                      <p className="text-sm text-ink-muted">Always available. Unlimited quantity.</p>
                      <p className="text-sm text-ink-muted">Submit, ship within 7 days, we&rsquo;ll inspect &amp; confirm.</p>
                      <p className="text-sm text-ink-muted">Credit issued after we receive &amp; verify your cards.</p>
                    </div>
                  </div>

                  <p className="text-[11px] text-ink-faint mt-4 leading-relaxed">
                    Submission is reviewed before credit is issued; final amount may differ if condition does not match.
                    Store credit can only be used at Cambridge TCG. This is our standing bid &mdash; always available, unlimited quantity.
                  </p>
                </div>
              </div>
            )}
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
