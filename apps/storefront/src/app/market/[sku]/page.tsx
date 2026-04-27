"use client";

import Link from "next/link";
import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { formatPrice } from "@/lib/format";
import { useToast } from "@/components/ui/Toast";
import { useCreditSell } from "@/context/CreditSellContext";
import type { OrderBookEntry, MarketTrade } from "@/lib/market/types";
import type { UnifiedMarketView } from "@/lib/market/unified";
import type { EscrowTier } from "@/lib/escrow/service-tiers";

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
      <div className="flex justify-between px-2 text-[10px] text-neutral-500 uppercase tracking-wide mb-1">
        <span>Qty</span>
        <span>Bid</span>
      </div>
      {/* Asks header */}
      <div className="flex justify-between px-2 text-[10px] text-neutral-500 uppercase tracking-wide mb-1">
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
  const askBgColor = isHouse ? "bg-amber-500/10" : "bg-red-500/20";
  const askTextColor = isHouse ? "text-amber-400" : "text-red-400";
  const askBorderColor = isFirst
    ? isHouse ? "border-l-2 border-amber-500/40" : "border-l-2 border-red-500/40"
    : "border-l border-neutral-800";

  const isBidHouse = bid?.is_house && bid?.is_credit;
  const bidBgColor = isBidHouse ? "bg-purple-500/20" : "bg-emerald-500/20";
  const bidTextColor = isBidHouse ? "text-purple-400" : "text-emerald-400";
  const bidBorderColor = isFirst
    ? isBidHouse ? "border-r-2 border-purple-500/40" : "border-r-2 border-emerald-500/40"
    : "border-r border-neutral-800";

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
            <span className="relative z-10 w-full flex justify-between px-2 text-xs font-mono">
              <span className="text-neutral-400">{isBidHouse ? "\u221E" : bid.total_quantity}</span>
              <span className={`${bidTextColor} font-medium flex items-center gap-1`}>
                {isBidHouse && <span title="CTCG Store Credit">&#127978;</span>}
                {formatPrice(Number(bid.price))}
                {isBidHouse && <span className="text-[10px] text-purple-400/80 font-sans font-semibold">CTCG &mdash; We Buy (unlimited)</span>}
                {isBidHouse && <span className="text-[9px] bg-purple-500/20 text-purple-400 px-1 py-px rounded font-sans">credit</span>}
              </span>
            </span>
          </>
        ) : (
          <span className="w-full text-center text-neutral-700 text-xs">—</span>
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
            <span className="relative z-10 w-full flex justify-between px-2 text-xs font-mono">
              <span className={`${askTextColor} font-medium flex items-center gap-1`}>
                {isHouse && <span title="CTCG stock">&#127978;</span>}
                {formatPrice(Number(ask.price))}
                {isHouse && <span className="text-[10px] text-amber-500/80 font-sans font-semibold">CTCG</span>}
              </span>
              <span className="text-neutral-400">{ask.total_quantity}</span>
            </span>
          </>
        ) : (
          <span className="w-full text-center text-neutral-700 text-xs">—</span>
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
 *  Height 28px, width scales to container. Stroke colour follows the
 *  overall trend (last point vs first) so the glyph is self-describing. */
function Sparkline({ points, width = 120, height = 28 }: {
  points: number[]; width?: number; height?: number;
}) {
  if (!points.length) return null;
  if (points.length === 1) {
    return (
      <svg width={width} height={height} className="block">
        <line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke="#737373" strokeWidth={1} />
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
  const trendUp = points[points.length - 1] >= points[0];
  const stroke = trendUp ? "#34d399" : "#f87171";
  return (
    <svg width={width} height={height} className="block" aria-hidden="true">
      <path d={path} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
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
      <div className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-3 mb-4">
        <span className="text-xs text-neutral-500">No trade history yet.</span>
      </div>
    );
  }
  const changeColor =
    change24hPct === null ? "text-neutral-500" :
    change24hPct > 0 ? "text-emerald-400" :
    change24hPct < 0 ? "text-red-400" : "text-neutral-400";
  const changeSign = change24hPct === null ? "" : change24hPct > 0 ? "+" : "";
  return (
    <div className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-3 mb-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-neutral-500 uppercase tracking-wide">30-day price</span>
        {change24hPct !== null && (
          <span className={`text-xs font-mono ${changeColor}`}>
            {changeSign}{change24hPct.toFixed(1)}% 24h
          </span>
        )}
      </div>
      <Sparkline points={sparkline} width={200} height={32} />
      <p className="text-[10px] text-neutral-500 mt-1">
        {sparkline.length} day{sparkline.length !== 1 ? "s" : ""} of trades
      </p>
    </div>
  );
}

/** Spot price + market price info panel */
function SpotPricePanel({ view }: { view: UnifiedMarketView }) {
  const { spot_price, spot_stock, market_price, p2p_discount, tradein_credit, tradein_cash } = view;

  return (
    <div className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-3 mb-4 space-y-2">
      {/* CTCG Spot */}
      {spot_price != null ? (
        <div className="flex items-center justify-between">
          <span className="text-xs text-neutral-400">CTCG Spot</span>
          <span className="text-sm font-mono text-amber-400 font-bold">
            {formatPrice(spot_price)}
            <span className="text-xs text-neutral-500 font-normal ml-1.5">
              ({spot_stock} in stock)
            </span>
          </span>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <span className="text-xs text-neutral-400">CTCG Spot</span>
          <span className="text-xs text-neutral-600">Not available</span>
        </div>
      )}

      {/* Market Price */}
      {market_price != null && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-neutral-400">Market Price</span>
          <span className="text-sm font-mono text-white font-bold">
            {formatPrice(market_price)}
            {p2p_discount != null && p2p_discount > 0 && (
              <span className="ml-1.5 text-[10px] font-sans font-semibold px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                {p2p_discount}% below spot
              </span>
            )}
          </span>
        </div>
      )}

      {/* CTCG two-sided spread */}
      {spot_price != null && tradein_credit != null && (
        <div className="border-t border-neutral-800 pt-2 mt-2 space-y-1.5">
          <span className="text-[10px] text-neutral-500 uppercase tracking-wide">CTCG Spread</span>
          <div className="flex items-center justify-between">
            <span className="text-xs text-neutral-400">CTCG Sells at</span>
            <span className="text-xs font-mono text-amber-400 font-semibold">{formatPrice(spot_price)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-neutral-400">CTCG Buys at</span>
            <span className="text-xs font-mono text-purple-400 font-semibold">
              {formatPrice(tradein_credit)}
              <span className="ml-1 text-[9px] bg-purple-500/20 text-purple-400 px-1 py-px rounded">credit</span>
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-neutral-500">Spread</span>
            <span className="text-xs font-mono text-neutral-500">{formatPrice(spot_price - tradein_credit)}</span>
          </div>
        </div>
      )}

      {/* Trade-in reference (when no full spread available) */}
      {spot_price == null && (tradein_credit != null || tradein_cash != null) && (
        <div className="border-t border-neutral-800 pt-2 mt-2 space-y-1">
          <span className="text-[10px] text-neutral-500 uppercase tracking-wide">Trade-in reference</span>
          {tradein_credit != null && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-neutral-500">Trade-in credit</span>
              <span className="text-xs font-mono text-purple-400">~{formatPrice(tradein_credit)}</span>
            </div>
          )}
          {tradein_cash != null && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-neutral-500">Trade-in cash</span>
              <span className="text-xs font-mono text-neutral-300">~{formatPrice(tradein_cash)}</span>
            </div>
          )}
        </div>
      )}

      {/* Cash trade-in (shown alongside spread if available) */}
      {spot_price != null && tradein_cash != null && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-neutral-500">Cash trade-in</span>
          <span className="text-xs font-mono text-neutral-300">~{formatPrice(tradein_cash)}</span>
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

const TIER_STYLES: Record<EscrowTier, { border: string; bg: string; text: string; icon: string }> = {
  direct: {
    border: "border-emerald-500/30",
    bg: "bg-emerald-500/10",
    text: "text-emerald-400",
    icon: "\u2192", // →
  },
  verified: {
    border: "border-blue-500/30",
    bg: "bg-blue-500/10",
    text: "text-blue-400",
    icon: "\u2713", // ✓
  },
  full_escrow: {
    border: "border-amber-500/30",
    bg: "bg-amber-500/10",
    text: "text-amber-400",
    icon: "\u26e8", // ⛨ (shield-like)
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
      <p className="text-xs text-neutral-400 mb-2 font-medium uppercase tracking-wide">How this trade will work</p>
      <div className="flex items-center gap-2 mb-2">
        <span className={`text-base ${style.text}`}>{style.icon}</span>
        <span className={`text-sm font-semibold ${style.text}`}>{preview.routing.label}</span>
        <span className="text-xs text-neutral-500">&mdash; {preview.routing.description.split(".")[0]}</span>
        <span className="ml-auto text-xs text-neutral-500">({preview.routing.estimatedDays})</span>
      </div>
      <ul className="space-y-1">
        {preview.summary.map((point, i) => (
          <li key={i} className="text-xs text-neutral-400 flex items-start gap-1.5">
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
      <div className="text-xs px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300">
        &#127978; Buy from CTCG at {formatPrice(bestPrice)} (guaranteed stock)
      </div>
    );
  }

  // P2P seller — show savings vs CTCG if spot exists
  if (spot_price != null && bestPrice < spot_price) {
    const savings = spot_price - bestPrice;
    return (
      <div className="text-xs px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300">
        Buy from seller at {formatPrice(bestPrice)} (save {formatPrice(savings)} vs CTCG spot)
      </div>
    );
  }

  return (
    <div className="text-xs px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700 text-neutral-300">
      Buy from seller at {formatPrice(bestPrice)}
    </div>
  );
}

export default function CardMarketPage() {
  const params = useParams();
  const sku = params.sku as string;

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
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [verified, setVerified] = useState<boolean | null>(null);

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

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((data) => {
        const isLoggedIn = !!data?.user?.email;
        setLoggedIn(isLoggedIn);
        if (!isLoggedIn) {
          setVerified(false);
          return;
        }
        // Verification status feeds the form gate so users see the CTA
        // before they fill in price/quantity, not on submit
        return fetch("/api/trust/verify")
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => setVerified(d?.verification?.status === "verified"))
          .catch(() => setVerified(false));
      })
      .catch(() => { setLoggedIn(false); setVerified(false); });
  }, []);

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
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 403 && data.code === "VERIFICATION_REQUIRED") {
          setResult({
            success: false,
            message: "__VERIFICATION_REQUIRED__",
          });
          return;
        }
        throw new Error(data.error || "Failed to place order");
      }
      const matchMsg = data.matched
        ? ` Matched ${data.trades?.length || 0} trade(s) immediately!`
        : "";
      setResult({ success: true, message: `Order placed.${matchMsg}` });
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
      <div className="min-h-screen bg-neutral-950">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-neutral-800 rounded w-64" />
            <div className="grid md:grid-cols-3 gap-6">
              <div className="aspect-[2.5/3.5] bg-neutral-800 rounded-xl" />
              <div className="bg-neutral-900 rounded-xl h-96" />
              <div className="bg-neutral-900 rounded-xl h-96" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !book) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-bold text-white mb-2">Order book not found</h2>
          <p className="text-neutral-400 mb-4">{error || "This card has no market activity."}</p>
          <Link href="/market" className="text-amber-400 hover:underline text-sm">
            Back to Market
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <div className="mb-6 text-sm">
          <Link href="/market" className="text-amber-400 hover:underline">Market</Link>
          <span className="text-neutral-600 mx-2">/</span>
          <span className="text-neutral-400">{book.card_name || sku}</span>
        </div>

        {/* Main layout */}
        <div className="grid md:grid-cols-[240px_1fr_320px] gap-6">
          {/* Left: Card image + spot info */}
          <div>
            {book.image_url ? (
              <img
                src={book.image_url}
                alt={book.card_name || sku}
                className="w-full rounded-xl border border-neutral-800"
              />
            ) : (
              <div className="aspect-[2.5/3.5] w-full bg-neutral-900 rounded-xl border border-neutral-800 flex items-center justify-center">
                <span className="text-neutral-600">No Image</span>
              </div>
            )}
            <div className="flex items-start justify-between gap-2 mt-4">
              <div className="min-w-0">
                <h1 className="text-lg font-bold text-white">{book.card_name || sku}</h1>
                <p className="text-xs text-neutral-500 font-mono">{sku}</p>
              </div>
              {loggedIn && watching !== null && (
                <button
                  onClick={toggleWatch}
                  disabled={watchToggling}
                  title={watching ? "Remove from watchlist" : "Add to watchlist"}
                  className={`text-xl transition shrink-0 ${watching ? "text-amber-400" : "text-neutral-600 hover:text-amber-400"}`}
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
                  className="text-xs text-neutral-400 hover:text-amber-400 transition"
                >
                  {alertOpen ? "− Hide alert" : "+ Set price alert"}
                </button>
                {alertOpen && (
                  <form onSubmit={submitAlert} className="mt-2 bg-neutral-900 border border-neutral-800 rounded-lg p-3 space-y-2">
                    <div className="flex gap-2">
                      <select
                        value={alertDirection}
                        onChange={(e) => setAlertDirection(e.target.value as "below" | "above")}
                        className="px-2 py-1.5 bg-neutral-800 border border-neutral-700 rounded text-white text-xs"
                      >
                        <option value="below">Notify when ask ≤</option>
                        <option value="above">Notify when sold ≥</option>
                      </select>
                      <div className="relative flex-1">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-neutral-500 text-xs">£</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          value={alertPrice}
                          onChange={(e) => setAlertPrice(e.target.value)}
                          required
                          placeholder="0.00"
                          className="w-full pl-6 pr-2 py-1.5 bg-neutral-800 border border-neutral-700 rounded text-white text-xs"
                        />
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={alertSubmitting}
                      className="w-full px-3 py-1.5 bg-amber-500 text-black text-xs font-bold rounded hover:bg-amber-400 transition disabled:opacity-50"
                    >
                      {alertSubmitting ? "..." : "Create alert"}
                    </button>
                    {alertResult && (
                      <p className={`text-xs ${alertResult.ok ? "text-emerald-400" : "text-red-400"}`}>
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
                <div className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-3 mb-4 space-y-1.5">
                  <p className="text-[10px] text-neutral-500 uppercase tracking-wide">Fair value (30d)</p>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-neutral-400">VWAP</span>
                    <span className="font-mono text-white">
                      {fairValue.vwap !== null ? formatPrice(fairValue.vwap) : "—"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-neutral-400">Median</span>
                    <span className="font-mono text-neutral-300">
                      {fairValue.median !== null ? formatPrice(fairValue.median) : "—"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-neutral-500">Range</span>
                    <span className="font-mono text-neutral-500">
                      {fairValue.priceRange.min !== null && fairValue.priceRange.max !== null
                        ? `${formatPrice(fairValue.priceRange.min)}–${formatPrice(fairValue.priceRange.max)}`
                        : "—"}
                    </span>
                  </div>
                  <p className="text-[10px] text-neutral-600 pt-1">
                    Based on {fairValue.tradeCount} trade{fairValue.tradeCount !== 1 ? "s" : ""} &middot; {fairValue.totalVolume} unit{fairValue.totalVolume !== 1 ? "s" : ""}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Center: Order book */}
          <div className="bg-neutral-900 rounded-xl p-4">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-sm font-bold text-white">Order Book</h2>
              {book.demand_pressure && book.demand_pressure.pressure > 0 && (
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/15 text-red-300 border border-red-500/30"
                  title={`${book.demand_pressure.watchCount} watchers, ${book.demand_pressure.alertCount} alerts, ${book.demand_pressure.askDepth} asks available`}
                >
                  🔥 Demand pressure{book.demand_pressure.tightenPct > 0
                    ? ` · CTCG tightened ${(book.demand_pressure.tightenPct * 100).toFixed(1)}%`
                    : ""}
                </span>
              )}
            </div>

            {/* Spread indicator */}
            <div className="flex items-center gap-3 mb-4 text-xs">
              <span className="text-emerald-400">
                Best Bid: {book.best_bid ? formatPrice(Number(book.best_bid)) : "—"}
              </span>
              {spread && (
                <span className="px-2 py-0.5 bg-neutral-800 rounded text-neutral-400">
                  Spread: {formatPrice(Number(spread))}
                </span>
              )}
              <span className="text-red-400">
                Best Ask: {book.best_ask ? formatPrice(Number(book.best_ask)) : "—"}
              </span>
            </div>

            {/* Buy routing info */}
            <div className="mb-4">
              <BuyRoutingInfo view={book} />
            </div>

            {book.bids.length === 0 && book.asks.length === 0 ? (
              <div className="text-center py-12 text-neutral-500 text-sm">
                No orders yet. Be the first to post!
              </div>
            ) : (
              <OrderBookViz
                bids={book.bids}
                asks={book.asks}
                onHouseAskClick={() => { window.location.href = `/product/${sku}`; }}
                onHouseBidClick={handleAddToSellCart}
              />
            )}
          </div>

          {/* Right: Order form + Sell for Credit */}
          <div className="space-y-4">
            {/* ========== CAMBRIDGE TCG BUYS THIS CARD ========== */}
            {book.tradein_credit != null && book.tradein_credit > 0 && (
              <div className="rounded-xl p-[1px] bg-gradient-to-r from-purple-500 to-blue-500">
                <div className="bg-neutral-950 rounded-[11px] p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-lg">&#127978;</span>
                    <h3 className="text-sm font-black text-white uppercase tracking-wide">Cambridge TCG Buys This Card</h3>
                  </div>

                  <div className="flex gap-4 items-start">
                    {/* Left: price + quantity + button */}
                    <div className="bg-purple-500/5 border border-purple-500/20 rounded-lg p-4 min-w-[180px]">
                      <p className="text-2xl font-bold text-purple-400 mb-0.5">
                        {formatPrice(book.tradein_credit)}
                        <span className="text-sm ml-1.5 bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded font-semibold">
                          Store Credit
                        </span>
                      </p>

                      {!creditAdded && (
                        <>
                          {/* Quantity selector */}
                          <div className="flex items-center gap-2 mt-3 mb-3">
                            <span className="text-xs text-neutral-400">Qty:</span>
                            <button
                              onClick={() => setCreditQty(Math.max(1, creditQty - 1))}
                              className="w-6 h-6 flex items-center justify-center bg-neutral-800 text-neutral-300 rounded hover:bg-neutral-700 transition text-xs font-bold"
                            >
                              -
                            </button>
                            <span className="text-sm font-mono text-white w-8 text-center">{creditQty}</span>
                            <button
                              onClick={() => setCreditQty(Math.min(99, creditQty + 1))}
                              className="w-6 h-6 flex items-center justify-center bg-neutral-800 text-neutral-300 rounded hover:bg-neutral-700 transition text-xs font-bold"
                            >
                              +
                            </button>
                          </div>

                          {loggedIn === false ? (
                            <Link
                              href="/login"
                              className="block w-full text-center py-2.5 rounded-lg font-bold text-sm bg-purple-600 text-white hover:bg-purple-500 transition"
                            >
                              Sign in to sell
                            </Link>
                          ) : (
                            <button
                              onClick={handleAddToSellCart}
                              disabled={loggedIn === null}
                              className="w-full py-2.5 rounded-lg font-bold text-sm bg-purple-600 text-white hover:bg-purple-500 transition disabled:opacity-50"
                            >
                              {`Sell for ${formatPrice(book.tradein_credit * creditQty)} Credit`}
                            </button>
                          )}
                        </>
                      )}

                      {/* Success state */}
                      {creditAdded && (
                        <div className="mt-3 space-y-2">
                          <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-3">
                            <p className="text-sm font-semibold text-purple-400">
                              Added to sell cart
                            </p>
                            <p className="text-[11px] text-neutral-400 mt-1">
                              Submit your cart to lock in this offer. We&rsquo;ll confirm credit after inspection.
                            </p>
                          </div>
                          <button
                            onClick={openDrawer}
                            className="w-full py-2 rounded-lg font-bold text-sm bg-purple-600/20 text-purple-400 border border-purple-500/30 hover:bg-purple-600/30 transition"
                          >
                            View Cart
                          </button>
                          <button
                            onClick={() => { setCreditAdded(false); setCreditQty(1); }}
                            className="text-xs text-purple-400 hover:text-purple-300 transition"
                          >
                            Add more
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Right: messaging */}
                    <div className="flex-1 space-y-1.5 pt-1">
                      <p className="text-sm text-neutral-300">Always available. Unlimited quantity.</p>
                      <p className="text-sm text-neutral-300">Submit, ship within 7 days, we&rsquo;ll inspect &amp; confirm.</p>
                      <p className="text-sm text-neutral-300">Credit issued after we receive &amp; verify your cards.</p>
                    </div>
                  </div>

                  <p className="text-[11px] text-neutral-500 mt-4 leading-relaxed">
                    Submission is reviewed before credit is issued; final amount may differ if condition does not match.
                    Store credit can only be used at Cambridge TCG. This is our standing bid &mdash; always available, unlimited quantity.
                  </p>
                </div>
              </div>
            )}

            {/* ========== P2P Order Form ========== */}
            <div className="bg-neutral-900 rounded-xl p-4">
            <div className="flex mb-4 bg-neutral-800 rounded-lg p-1">
              <button
                onClick={() => { setTab("buy"); setResult(null); }}
                className={`flex-1 py-2 text-sm font-bold rounded-md transition ${
                  tab === "buy"
                    ? "bg-emerald-500 text-black"
                    : "text-neutral-400 hover:text-white"
                }`}
              >
                Buy
              </button>
              <button
                onClick={() => { setTab("sell"); setResult(null); }}
                className={`flex-1 py-2 text-sm font-bold rounded-md transition ${
                  tab === "sell"
                    ? "bg-red-500 text-white"
                    : "text-neutral-400 hover:text-white"
                }`}
              >
                Sell
              </button>
            </div>

            {/* Reference price */}
            <div className="mb-4 text-xs text-neutral-400">
              {tab === "buy"
                ? `Best ask: ${book.best_ask ? formatPrice(Number(book.best_ask)) : "—"}`
                : `Best bid: ${book.best_bid ? formatPrice(Number(book.best_bid)) : "—"}`}
              {tab === "buy" && book.spot_price != null && (
                <span className="ml-2 text-amber-400/70">
                  (CTCG Spot: {formatPrice(book.spot_price)})
                </span>
              )}
            </div>

            {loggedIn === false ? (
              <div className="text-center py-8">
                <p className="text-neutral-400 text-sm mb-3">You need to be signed in to trade.</p>
                <Link
                  href="/login"
                  className="text-amber-400 hover:underline text-sm font-medium"
                >
                  Sign in to trade
                </Link>
              </div>
            ) : loggedIn && verified === false ? (
              <div className="text-center py-6 px-2">
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-amber-500/15 text-amber-400 mb-3 text-lg">!</div>
                <p className="text-white text-sm font-semibold mb-1">UK verification required</p>
                <p className="text-neutral-400 text-xs mb-4 leading-relaxed">
                  P2P trading requires UK address + age verification (one-time, ~2 minutes).
                </p>
                <Link
                  href="/account/verify"
                  className="inline-block px-4 py-2 bg-amber-500 text-black text-sm font-bold rounded-lg hover:bg-amber-400 transition"
                >
                  Verify Identity
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs text-neutral-500 mb-1">Price (GBP)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 text-sm">£</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      required
                      className="w-full pl-7 pr-3 py-2.5 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500/50 transition"
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-neutral-500 mb-1">Quantity</label>
                  <input
                    type="number"
                    min="1"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    required
                    className="w-full px-3 py-2.5 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500/50 transition"
                  />
                </div>

                <div>
                  <label className="block text-xs text-neutral-500 mb-1">Condition</label>
                  <select
                    value={condition}
                    onChange={(e) => setCondition(e.target.value as typeof condition)}
                    className="w-full px-3 py-2.5 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500/50 transition"
                  >
                    {CONDITIONS.map((c) => (
                      <option key={c.code} value={c.code}>{c.label}</option>
                    ))}
                  </select>
                </div>

                {/* Total preview */}
                {price && quantity && (
                  <div className="text-xs text-neutral-400 text-right">
                    Total: {formatPrice(parseFloat(price) * parseInt(quantity, 10) || 0)}
                  </div>
                )}

                {/* Fill probability — only meaningful for bids */}
                {tab === "buy" && bidAnalysis && bidAnalysis.fillProbabilityPct !== null && (
                  <div className={`text-xs rounded-lg px-3 py-2 border ${
                    bidAnalysis.fillProbabilityPct >= 50 ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
                    : bidAnalysis.fillProbabilityPct >= 20 ? "bg-amber-500/10 border-amber-500/20 text-amber-300"
                    : "bg-neutral-800 border-neutral-700 text-neutral-400"
                  }`}>
                    <div className="flex items-center justify-between">
                      <span>Historical fill odds</span>
                      <span className="font-mono font-bold">{bidAnalysis.fillProbabilityPct}%</span>
                    </div>
                    {bidAnalysis.expectedDaysToFill !== null && (
                      <div className="flex items-center justify-between mt-0.5 text-[10px] opacity-80">
                        <span>Expected time to fill</span>
                        <span className="font-mono">~{bidAnalysis.expectedDaysToFill}d</span>
                      </div>
                    )}
                    <p className="text-[10px] text-neutral-500 mt-1">
                      % of last 30d trades at or below this price.
                    </p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting || loggedIn === null}
                  className={`w-full py-3 rounded-lg font-bold text-sm transition disabled:opacity-50 ${
                    tab === "buy"
                      ? "bg-emerald-500 text-black hover:bg-emerald-400"
                      : "bg-red-500 text-white hover:bg-red-400"
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
                        ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                        : "bg-red-500/15 text-red-400 border border-red-500/30"
                    }`}
                  >
                    {result.message === "__VERIFICATION_REQUIRED__" ? (
                      <span>
                        UK verification required to trade.{" "}
                        <Link href="/account/verify" className="underline font-medium hover:text-amber-400">
                          Verify your identity
                        </Link>
                      </span>
                    ) : (
                      result.message
                    )}
                  </div>
                )}
              </form>
            )}

            {/* Escrow routing preview */}
            {loggedIn !== false && price && quantity && (
              <EscrowRoutingPreview orderValue={parseFloat(price) * parseInt(quantity, 10) || 0} />
            )}

          </div>
          </div>
        </div>

        {/* Recent trades */}
        <div className="mt-8 bg-neutral-900 rounded-xl p-4">
          <h2 className="text-sm font-bold text-white mb-4">Recent Trades</h2>
          {book.recent_trades.length === 0 ? (
            <p className="text-neutral-500 text-sm py-4 text-center">No trades yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-neutral-500 text-xs uppercase tracking-wide border-b border-neutral-800">
                    <th className="text-left py-2 font-medium">Price</th>
                    <th className="text-left py-2 font-medium">Quantity</th>
                    <th className="text-left py-2 font-medium">Seller</th>
                    <th className="text-right py-2 font-medium">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {book.recent_trades.map((trade) => (
                    <tr key={trade.id} className="border-b border-neutral-800/50">
                      <td className="py-2 text-white font-mono">
                        {formatPrice(Number(trade.price))}
                      </td>
                      <td className="py-2 text-neutral-300">{trade.quantity}</td>
                      <td className="py-2 text-neutral-400 text-xs">
                        {trade.seller_username ? (
                          <Link
                            href={`/u/${trade.seller_username}`}
                            className="text-amber-400 hover:underline"
                          >
                            {trade.seller_name || trade.seller_username}
                          </Link>
                        ) : (
                          <span className="text-neutral-500">—</span>
                        )}
                      </td>
                      <td className="py-2 text-neutral-500 text-right text-xs">
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
          <div className="mt-8 bg-neutral-900 rounded-xl p-4">
            <h2 className="text-sm font-bold text-white mb-4">
              Also watched by buyers of this card
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
              {related.map((r) => (
                <Link
                  key={r.sku}
                  href={`/market/${r.sku}`}
                  className="group block"
                >
                  <div className="aspect-[2.5/3.5] bg-neutral-800 rounded-lg overflow-hidden mb-2">
                    {r.imageUrl ? (
                      <img src={r.imageUrl} alt="" className="w-full h-full object-cover group-hover:scale-105 transition" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-neutral-600 text-xs">
                        No image
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-white truncate group-hover:text-amber-400 transition">
                    {r.cardName || r.sku}
                  </p>
                  <div className="flex items-center justify-between text-[10px] text-neutral-500 mt-0.5">
                    <span>{r.coWatchCount} watchers</span>
                    {r.bestAsk !== null && (
                      <span className="text-red-400">{formatPrice(r.bestAsk)}</span>
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
