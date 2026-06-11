"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState, useCallback, useRef } from "react";
import { Money, Icon, EmptyState } from "@/lib/ui";
import { useVoice } from "@/lib/wardrobe/context";
import { useToast } from "@/components/ui/Toast";
import { useCreditSell } from "@/context/CreditSellContext";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface CatalogCard {
  sku: string;
  card_number: string;
  name: string;
  set_code: string;
  set_name: string;
  rarity: string | null;
  image_url: string | null;
  spot_price: number;
  market_price: number;
  stock: number;
  best_bid: number | null;
  best_ask: number | null;
  p2p_sellers: number;
  p2p_buyers: number;
  has_p2p: boolean;
  tradein_credit: number | null;
}

interface SetInfo {
  code: string;
  name: string;
  card_count: number;
  release_date: string | null;
}

type ViewMode = "table" | "grid";
type SortKey = "name_asc" | "name_desc" | "price_asc" | "price_desc" | "number_asc";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function rarityBadge(rarity: string | null) {
  if (!rarity) return null;
  const r = rarity.toUpperCase();
  let cls = "bg-surface-subtle text-ink-muted";
  if (r === "SR" || r === "SEC" || r === "SCR" || r === "L" || r === "SP")
    cls = "bg-accent-wash text-accent";
  else if (r === "R" || r === "RR" || r === "SSR")
    cls = "bg-surface-subtle text-ink";
  else if (r === "UC")
    cls = "bg-info/10 text-info";
  else if (r === "C")
    cls = "bg-surface-subtle text-ink-muted";
  return (
    <span className={`inline-block px-1.5 py-0.5 text-[10px] font-bold rounded ${cls}`}>
      {rarity.toUpperCase()}
    </span>
  );
}

function pctDiff(market: number, spot: number): number {
  if (!spot) return 0;
  return Math.round(((spot - market) / spot) * 100);
}

/* ------------------------------------------------------------------ */
/*  Skeleton loaders                                                   */
/* ------------------------------------------------------------------ */

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      {Array.from({ length: 11 }).map((_, i) => (
        <td key={i} className="px-3 py-3">
          <div className="h-4 bg-surface-subtle rounded w-full" />
        </td>
      ))}
    </tr>
  );
}

function SkeletonCard() {
  return (
    <div className="wardrobe-mat rounded-lg p-3 animate-pulse">
      <div className="aspect-[2.5/3.5] bg-surface-subtle rounded-lg mb-3" />
      <div className="h-4 bg-surface-subtle rounded w-3/4 mb-2" />
      <div className="h-3 bg-surface-subtle rounded w-1/2 mb-3" />
      <div className="h-4 bg-surface-subtle rounded w-16" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main page                                                          */
/* ------------------------------------------------------------------ */

export default function MarketPage() {
  /* ---- state ---- */
  const [cards, setCards] = useState<CatalogCard[]>([]);
  const [total, setTotal] = useState(0);
  const [sets, setSets] = useState<SetInfo[]>([]);
  const [activeSet, setActiveSet] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("name_asc");
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [setsLoading, setSetsLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const limit = 48;

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { toast } = useToast();
  const { addItem, totalItems, totalCredit, openDrawer } = useCreditSell();
  const v = useVoice();

  /* ---- check auth ---- */
  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((data) => setLoggedIn(!!data?.user?.email))
      .catch(() => setLoggedIn(false));
  }, []);

  /* ---- add to credit sell cart ---- */
  function handleAddToSellCart(card: CatalogCard, e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    if (loggedIn === false) {
      window.location.href = "/login";
      return;
    }
    addItem({
      sku: card.sku,
      name: card.name,
      cardNumber: card.card_number,
      setCode: card.set_code,
      imageUrl: card.image_url,
      creditPrice: card.tradein_credit!,
    });
    toast("Added to sell cart", "success");
  }

  /* ---- debounced search ---- */
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(query);
      setOffset(0);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  /* ---- fetch sets ---- */
  useEffect(() => {
    (async () => {
      setSetsLoading(true);
      try {
        const res = await fetch("/api/market/catalog?view=sets&game=one-piece");
        if (!res.ok) throw new Error("Failed");
        const data = await res.json();
        // Sort: OP sets first (by number), then EB, then ST, then PRB, then P/PROMO
        const groupOrder: Record<string, number> = { OP: 0, EB: 1, ST: 2, PRB: 3, PCC: 4, P: 5, PROMO: 6, SEALED: 7 };
        const sorted = (data.sets ?? []).sort((a: SetInfo, b: SetInfo) => {
          const prefA = a.code.replace(/[0-9-].*/,"");
          const prefB = b.code.replace(/[0-9-].*/,"");
          const gA = groupOrder[prefA] ?? 8;
          const gB = groupOrder[prefB] ?? 8;
          if (gA !== gB) return gA - gB;
          return a.code.localeCompare(b.code, undefined, { numeric: true });
        });
        setSets(sorted);
      } catch {
        setSets([]);
      } finally {
        setSetsLoading(false);
      }
    })();
  }, []);

  /* ---- fetch cards ---- */
  const fetchCards = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        game: "one-piece",
        sort,
        limit: String(limit),
        offset: String(offset),
      });
      if (activeSet) params.set("set", activeSet);
      if (debouncedQuery) params.set("q", debouncedQuery);
      const res = await fetch(`/api/market/catalog?${params}`);
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setCards(data.cards ?? []);
      setTotal(data.total ?? 0);
    } catch {
      setCards([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery, sort, offset, activeSet]);

  useEffect(() => {
    fetchCards();
  }, [fetchCards]);

  /* ---- derived ---- */
  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;
  const p2pCardCount = cards.filter((c) => c.has_p2p).length;
  const totalP2PSellers = cards.reduce((sum, c) => sum + c.p2p_sellers, 0);
  const ctcgBuyingCount = cards.filter((c) => c.tradein_credit != null && c.tradein_credit > 0).length;

  /* ---- set click ---- */
  function selectSet(code: string | null) {
    setActiveSet(code);
    setOffset(0);
  }

  /* ---- render — wardrobe migration: Gallery tokens, icons, mats (spec §3.4) ---- */
  return (
    <div className="min-h-screen">
      <div className="max-w-[1400px] mx-auto px-4 py-8">
        {/* ========== HEADER ========== */}
        <div className="mb-8 flex items-end justify-between flex-wrap gap-3">
          <div>
            <h1 className="font-display text-3xl font-black tracking-tight text-ink mb-2">{v("market.title")}</h1>
            <p className="text-ink-muted">
              {v("market.subtitle")}
            </p>
          </div>
          <div className="flex gap-2">
            <a
              href="/market/pulse"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-surface hover:bg-surface-subtle border border-border-subtle rounded-lg text-sm text-ink font-medium transition"
            >
              <Icon name="pulse" className="text-accent" /> Market Pulse
            </a>
            <a
              href="/market/lots"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-surface hover:bg-surface-subtle border border-border-subtle rounded-lg text-sm text-ink font-medium transition"
            >
              <Icon name="lots" className="text-accent" /> Lots
            </a>
            <a
              href="/leaderboards"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-surface hover:bg-surface-subtle border border-border-subtle rounded-lg text-sm text-ink font-medium transition"
            >
              <Icon name="trophy" className="text-accent" /> Leaderboards
            </a>
          </div>
        </div>

        {/* ========== HERO BANNER — We Buy Every Card ========== */}
        <div className="mb-8 rounded-lg bg-accent-wash border border-border-subtle px-6 py-5">
          <h2 className="font-display text-lg font-bold tracking-tight text-ink mb-1">
            <Icon name="credit" size={18} className="inline-block align-[-3px] mr-2 text-accent" />
            We Buy Every Card &mdash; Unlimited &mdash; Instant Store Credit
          </h2>
          <p className="text-sm text-ink-muted leading-relaxed max-w-2xl">
            Sell any card to Cambridge TCG for store credit. No waiting for a buyer. No listing fees.
            Guaranteed price on every card. Credit is added to your account instantly.
          </p>
          <p className="text-xs text-ink-faint mt-2">
            Store credit can be used to buy any card in our shop.
          </p>
        </div>

        {/* ========== STATS BAR ========== */}
        <div className="flex flex-wrap gap-4 mb-6 text-sm">
          <div className="px-3 py-1.5 bg-surface border border-border-subtle rounded-lg text-ink-muted">
            <span className="text-ink font-semibold font-mono tabular-nums">{total.toLocaleString()}</span> total cards
          </div>
          <div className="px-3 py-1.5 bg-surface border border-border-subtle rounded-lg text-ink-muted">
            <span className="text-bid font-semibold font-mono tabular-nums">{p2pCardCount}</span> with P2P activity
          </div>
          <div className="px-3 py-1.5 bg-surface border border-border-subtle rounded-lg text-ink-muted">
            <span className="text-accent font-semibold font-mono tabular-nums">{totalP2PSellers}</span> P2P sellers
          </div>
          {ctcgBuyingCount > 0 && (
            <div className="px-3 py-1.5 bg-surface border border-border-subtle rounded-lg text-ink-muted">
              <span className="text-accent-strong font-semibold font-mono tabular-nums">{ctcgBuyingCount}</span> CTCG buying
            </div>
          )}
        </div>

        <div className="flex gap-6">
          {/* ========== SET SIDEBAR (desktop) ========== */}
          <aside className="hidden lg:block w-56 shrink-0">
            <h2 className="font-display text-xs font-bold text-ink-faint uppercase tracking-wider mb-3">
              Sets
            </h2>
            <nav className="flex flex-col gap-1">
              <button
                onClick={() => selectSet(null)}
                className={`text-left text-sm px-3 py-2 rounded-lg transition ${
                  activeSet === null
                    ? "bg-accent-wash text-accent font-semibold"
                    : "text-ink-muted hover:bg-surface-subtle hover:text-ink"
                }`}
              >
                All Cards
              </button>
              {setsLoading &&
                Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-8 bg-surface-subtle rounded-lg animate-pulse" />
                ))}
              {sets.map((s) => (
                <button
                  key={s.code}
                  onClick={() => selectSet(s.code)}
                  className={`text-left text-sm px-3 py-2 rounded-lg transition flex justify-between items-center ${
                    activeSet === s.code
                      ? "bg-accent-wash text-accent font-semibold"
                      : "text-ink-muted hover:bg-surface-subtle hover:text-ink"
                  }`}
                >
                  <span className="truncate">
                    <span className="text-ink-faint font-mono text-xs mr-1.5">{s.code}</span>
                    {s.name}
                  </span>
                  <span className="text-[10px] text-ink-faint font-mono tabular-nums ml-2 shrink-0">
                    {s.card_count}
                  </span>
                </button>
              ))}
            </nav>
          </aside>

          {/* ========== MAIN CONTENT ========== */}
          <div className="flex-1 min-w-0">
            {/* ---- Set scroll (mobile) ---- */}
            <div className="lg:hidden mb-4 -mx-4 px-4">
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                <button
                  onClick={() => selectSet(null)}
                  className={`shrink-0 text-xs px-3 py-1.5 rounded-full transition ${
                    activeSet === null
                      ? "bg-accent text-page font-bold"
                      : "bg-surface border border-border-subtle text-ink-muted"
                  }`}
                >
                  All
                </button>
                {sets.map((s) => (
                  <button
                    key={s.code}
                    onClick={() => selectSet(s.code)}
                    className={`shrink-0 text-xs px-3 py-1.5 rounded-full transition whitespace-nowrap ${
                      activeSet === s.code
                        ? "bg-accent text-page font-bold"
                        : "bg-surface border border-border-subtle text-ink-muted"
                    }`}
                  >
                    {s.code} — {s.name}
                  </button>
                ))}
              </div>
            </div>

            {/* ---- Search + Sort + View Toggle ---- */}
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              {/* Search */}
              <div className="relative flex-1">
                <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by name, card number, or SKU..."
                  className="w-full pl-9 pr-4 py-2.5 bg-surface border border-border-subtle rounded-lg text-ink placeholder:text-ink-faint focus:outline-none focus:border-accent/50 transition text-sm"
                />
                {query && (
                  <button
                    onClick={() => setQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink transition text-sm"
                  >
                    x
                  </button>
                )}
              </div>

              {/* Sort */}
              <select
                value={sort}
                onChange={(e) => {
                  setSort(e.target.value as SortKey);
                  setOffset(0);
                }}
                className="px-3 py-2.5 bg-surface border border-border-subtle rounded-lg text-ink text-sm focus:outline-none focus:border-accent/50 transition"
              >
                <option value="name_asc">Name A-Z</option>
                <option value="name_desc">Name Z-A</option>
                <option value="price_asc">Price Low → High</option>
                <option value="price_desc">Price High → Low</option>
                <option value="number_asc">Card Number</option>
              </select>

              {/* View toggle */}
              <div className="flex bg-surface border border-border-subtle rounded-lg overflow-hidden">
                <button
                  onClick={() => setViewMode("table")}
                  className={`px-3 py-2.5 text-sm transition ${
                    viewMode === "table"
                      ? "bg-accent text-page font-bold"
                      : "text-ink-muted hover:text-ink"
                  }`}
                  title="Table view"
                >
                  <Icon name="list" />
                </button>
                <button
                  onClick={() => setViewMode("grid")}
                  className={`px-3 py-2.5 text-sm transition ${
                    viewMode === "grid"
                      ? "bg-accent text-page font-bold"
                      : "text-ink-muted hover:text-ink"
                  }`}
                  title="Grid view"
                >
                  <Icon name="grid" />
                </button>
              </div>
            </div>

            {/* ---- Results count ---- */}
            {!loading && (
              <p className="text-xs text-ink-faint mb-3">
                Showing <span className="font-mono tabular-nums">{cards.length}</span> of{" "}
                <span className="font-mono tabular-nums">{total.toLocaleString()}</span> cards
              </p>
            )}

            {/* ---- Loading ---- */}
            {loading && viewMode === "table" && (
              <div className="wardrobe-mat overflow-x-auto rounded-lg">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-surface-elevated border-b border-border-subtle text-ink-muted text-xs uppercase tracking-wider">
                      <th className="px-3 py-2.5 text-left w-12" />
                      <th className="px-3 py-2.5 text-left">#</th>
                      <th className="px-3 py-2.5 text-left">Name</th>
                      <th className="px-3 py-2.5 text-left">Rarity</th>
                      <th className="px-3 py-2.5 text-left">Set</th>
                      <th className="px-3 py-2.5 text-right">CTCG Price</th>
                      <th className="px-3 py-2.5 text-right text-accent">We Buy</th>
                      <th className="px-3 py-2.5 text-right">Market</th>
                      <th className="px-3 py-2.5 text-center">P2P Sellers</th>
                      <th className="px-3 py-2.5 text-center">P2P Buyers</th>
                      <th className="px-3 py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: 12 }).map((_, i) => (
                      <SkeletonRow key={i} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {loading && viewMode === "grid" && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-4">
                {Array.from({ length: 12 }).map((_, i) => (
                  <SkeletonCard key={i} />
                ))}
              </div>
            )}

            {/* ---- Empty state ---- */}
            {!loading && cards.length === 0 && (
              <EmptyState
                title={v("market.empty.catalog.title")}
                description={v("market.empty.catalog.description")}
                action={
                  query || activeSet ? (
                    <button
                      onClick={() => {
                        setQuery("");
                        setActiveSet(null);
                      }}
                      className="px-4 py-2 bg-accent text-page font-bold rounded-lg hover:bg-accent-strong transition text-sm"
                    >
                      Clear filters
                    </button>
                  ) : undefined
                }
              />
            )}

            {/* ---- TABLE VIEW ---- */}
            {!loading && cards.length > 0 && viewMode === "table" && (
              <div className="wardrobe-mat overflow-x-auto rounded-lg">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-surface-elevated border-b border-border-subtle text-ink-muted text-xs uppercase tracking-wider">
                      <th className="px-3 py-2.5 text-left w-12" />
                      <th className="px-3 py-2.5 text-left">#</th>
                      <th className="px-3 py-2.5 text-left">Name</th>
                      <th className="px-3 py-2.5 text-left">Rarity</th>
                      <th className="px-3 py-2.5 text-left">Set</th>
                      <th className="px-3 py-2.5 text-right">CTCG Price</th>
                      <th className="px-3 py-2.5 text-right text-accent">We Buy</th>
                      <th className="px-3 py-2.5 text-right">Market</th>
                      <th className="px-3 py-2.5 text-center">P2P Sellers</th>
                      <th className="px-3 py-2.5 text-center">P2P Buyers</th>
                      <th className="px-3 py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle">
                    {cards.map((card) => {
                      const diff = pctDiff(card.market_price, card.spot_price);
                      const isCheaper = diff > 0 && card.market_price < card.spot_price;

                      return (
                        <tr
                          key={card.sku}
                          onClick={() => (window.location.href = `/market/${card.sku}`)}
                          className="bg-surface hover:bg-surface-subtle transition cursor-pointer"
                        >
                          {/* Thumb — Next/Image so the full card art (~200KB
                              per source) gets resized server-side to a 56-wide
                              thumb. Plain HTML img with lazy loading downloaded
                              each full image and made the table look unloaded
                              until you scrolled into every row. */}
                          <td className="px-3 py-2">
                            {card.image_url ? (
                              <Image
                                src={card.image_url}
                                alt={card.name}
                                width={40}
                                height={56}
                                className="w-10 h-14 object-cover rounded border border-border-subtle shadow-mat"
                                unoptimized={false}
                              />
                            ) : (
                              <div className="w-10 h-14 bg-surface-subtle border border-border-subtle rounded flex items-center justify-center">
                                <span className="text-ink-faint text-[8px]">N/A</span>
                              </div>
                            )}
                          </td>

                          {/* Card Number */}
                          <td className="px-3 py-2 text-ink-muted font-mono text-xs whitespace-nowrap">
                            {card.card_number}
                          </td>

                          {/* Name */}
                          <td className="px-3 py-2 text-ink font-medium max-w-[200px] truncate">
                            {card.name}
                          </td>

                          {/* Rarity */}
                          <td className="px-3 py-2">{rarityBadge(card.rarity)}</td>

                          {/* Set */}
                          <td className="px-3 py-2 text-ink-muted font-mono text-xs whitespace-nowrap">
                            {card.set_code}
                          </td>

                          {/* CTCG Price */}
                          <td className="px-3 py-2 text-right text-accent font-semibold font-mono tabular-nums whitespace-nowrap">
                            <Money value={card.spot_price} />
                          </td>

                          {/* We Buy (store credit) */}
                          <td className="px-3 py-2 text-right whitespace-nowrap">
                            {card.tradein_credit != null && card.tradein_credit > 0 ? (
                              <span className="inline-flex items-center gap-1.5" title="Instant store credit — we buy unlimited quantity">
                                <span className="text-accent-strong font-bold font-mono tabular-nums">
                                  <Money value={card.tradein_credit} />
                                </span>
                                <button
                                  onClick={(e) => handleAddToSellCart(card, e)}
                                  className="px-2 py-0.5 text-[10px] font-bold bg-accent text-page rounded hover:bg-accent-strong transition"
                                >
                                  Sell
                                </button>
                              </span>
                            ) : (
                              <span className="text-ink-faint text-xs">&mdash;</span>
                            )}
                          </td>

                          {/* Market Price */}
                          <td className="px-3 py-2 text-right whitespace-nowrap">
                            {isCheaper ? (
                              <span className="text-bid font-semibold font-mono tabular-nums">
                                <Money value={card.market_price} />
                                <span className="ml-1 text-[10px] bg-bid/10 text-bid px-1 py-0.5 rounded">
                                  ↓{diff}%
                                </span>
                              </span>
                            ) : (
                              <span className="text-ink-muted font-mono tabular-nums">
                                <Money value={card.market_price} />
                              </span>
                            )}
                          </td>

                          {/* P2P Sellers */}
                          <td className="px-3 py-2 text-center">
                            {card.p2p_sellers > 0 ? (
                              <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold font-mono tabular-nums bg-bid/10 text-bid">
                                {card.p2p_sellers} seller{card.p2p_sellers !== 1 ? "s" : ""}
                              </span>
                            ) : (
                              <span className="text-ink-faint text-xs">--</span>
                            )}
                          </td>

                          {/* P2P Buyers */}
                          <td className="px-3 py-2 text-center">
                            {card.p2p_buyers > 0 ? (
                              <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold font-mono tabular-nums bg-info/10 text-info">
                                {card.p2p_buyers} buyer{card.p2p_buyers !== 1 ? "s" : ""}
                              </span>
                            ) : (
                              <span className="text-ink-faint text-xs">--</span>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="px-3 py-2 text-right">
                            <Link
                              href={`/market/${card.sku}`}
                              onClick={(e) => e.stopPropagation()}
                              className="inline-block px-3 py-1 text-xs font-bold bg-accent text-page rounded hover:bg-accent-strong transition"
                            >
                              View
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* ---- GRID VIEW ---- */}
            {!loading && cards.length > 0 && viewMode === "grid" && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-4">
                {cards.map((card) => {
                  const diff = pctDiff(card.market_price, card.spot_price);
                  const isCheaper = diff > 0 && card.market_price < card.spot_price;

                  return (
                    <Link
                      key={card.sku}
                      href={`/market/${card.sku}`}
                      className="wardrobe-mat rounded-lg p-3 hover:bg-surface-subtle transition group"
                    >
                      {/* Image */}
                      {card.image_url ? (
                        <Image
                          src={card.image_url}
                          alt={card.name}
                          width={240}
                          height={336}
                          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 240px"
                          className="aspect-[2.5/3.5] w-full object-cover rounded-lg border border-border-subtle mb-3 group-hover:scale-[1.02] transition"
                        />
                      ) : (
                        <div className="aspect-[2.5/3.5] w-full bg-surface-subtle border border-border-subtle rounded-lg mb-3 flex items-center justify-center">
                          <span className="text-ink-faint text-xs">No Image</span>
                        </div>
                      )}

                      {/* Name + number */}
                      <h3 className="text-sm font-semibold text-ink truncate">
                        {card.name}
                      </h3>
                      <p className="text-xs text-ink-faint font-mono mb-2 truncate">
                        {card.card_number} - {card.set_code}
                      </p>

                      {/* Price */}
                      <p className="text-sm font-bold text-accent font-mono tabular-nums">
                        <Money value={card.spot_price} />
                      </p>

                      {/* We buy — store credit */}
                      {card.tradein_credit != null && card.tradein_credit > 0 && (
                        <div className="flex items-center gap-1.5 mt-1" title="Instant store credit — we buy unlimited quantity">
                          <span className="text-[11px] text-accent-strong font-semibold">
                            We buy: <Money value={card.tradein_credit} className="font-mono tabular-nums" />
                          </span>
                          <button
                            onClick={(e) => handleAddToSellCart(card, e)}
                            className="text-[10px] font-bold text-accent hover:text-accent-strong underline transition"
                          >
                            Sell
                          </button>
                        </div>
                      )}

                      {/* P2P indicator */}
                      {card.has_p2p && (
                        <div className="flex items-center gap-1 mt-1.5">
                          {isCheaper && (
                            <span className="text-[10px] bg-bid/10 text-bid font-mono tabular-nums px-1.5 py-0.5 rounded font-semibold">
                              P2P ↓{diff}%
                            </span>
                          )}
                          {card.p2p_sellers > 0 && !isCheaper && (
                            <span className="text-[10px] bg-bid/10 text-bid font-mono tabular-nums px-1.5 py-0.5 rounded">
                              {card.p2p_sellers} seller{card.p2p_sellers !== 1 ? "s" : ""}
                            </span>
                          )}
                          {card.p2p_buyers > 0 && (
                            <span className="text-[10px] bg-info/10 text-info font-mono tabular-nums px-1.5 py-0.5 rounded">
                              {card.p2p_buyers} buyer{card.p2p_buyers !== 1 ? "s" : ""}
                            </span>
                          )}
                        </div>
                      )}
                    </Link>
                  );
                })}
              </div>
            )}

            {/* ---- PAGINATION ---- */}
            {!loading && totalPages > 1 && (
              <div className="flex justify-center items-center gap-2 mt-8">
                <button
                  onClick={() => setOffset(Math.max(0, offset - limit))}
                  disabled={offset === 0}
                  className="px-3 py-2 bg-surface border border-border-subtle text-ink-muted rounded-lg hover:bg-surface-subtle disabled:opacity-40 disabled:cursor-not-allowed transition text-sm"
                >
                  Previous
                </button>

                {/* Page numbers - show up to 5 around current */}
                {(() => {
                  const pages: number[] = [];
                  let start = Math.max(1, currentPage - 2);
                  let end = Math.min(totalPages, start + 4);
                  start = Math.max(1, end - 4);
                  for (let p = start; p <= end; p++) pages.push(p);
                  return pages.map((p) => (
                    <button
                      key={p}
                      onClick={() => setOffset((p - 1) * limit)}
                      className={`w-9 h-9 rounded-lg text-sm font-mono tabular-nums transition ${
                        p === currentPage
                          ? "bg-accent text-page font-bold"
                          : "bg-surface border border-border-subtle text-ink-muted hover:bg-surface-subtle"
                      }`}
                    >
                      {p}
                    </button>
                  ));
                })()}

                <button
                  onClick={() => setOffset(offset + limit)}
                  disabled={currentPage >= totalPages}
                  className="px-3 py-2 bg-surface border border-border-subtle text-ink-muted rounded-lg hover:bg-surface-subtle disabled:opacity-40 disabled:cursor-not-allowed transition text-sm"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ========== Floating Credit Sell Cart Bar ========== */}
      {totalItems > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-accent/30">
          <div className="bg-surface/95 backdrop-blur">
            <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 sm:gap-4 min-w-0 overflow-hidden">
                <span className="text-sm font-bold text-ink shrink-0">
                  <span className="font-mono tabular-nums">{totalItems}</span> card{totalItems !== 1 ? "s" : ""} to sell
                </span>
                <span className="text-xs sm:text-sm text-ink-muted truncate">
                  <span className="text-accent font-medium font-mono tabular-nums"><Money value={totalCredit} /></span>
                  <span className="ml-1 text-ink-faint">credit</span>
                </span>
              </div>
              <button
                onClick={openDrawer}
                className="px-4 sm:px-5 py-2.5 bg-accent text-page text-sm font-bold rounded-lg hover:bg-accent-strong transition shrink-0"
              >
                Review Sell Cart
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
