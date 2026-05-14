/**
 * /cards/[sku]/market — the substrate-honest pure-read mirror of one
 * card's market activity.
 *
 * kingdom-067. Story-as-wire: docs/connections/the-market-mirror.md (S35).
 * Data layer: apps/storefront/src/lib/market/card-market.ts.
 *
 * Why this page exists alongside /market/[sku]:
 *   /market/[sku] is the *interactive* surface (place bids, sell for
 *     credit, set alerts, watch). Logged-in users go there to act.
 *   /cards/[sku]/market is the *reading* surface (depth, tape, price
 *     history, condition breakdown, counterparty trust badges). Public,
 *     no auth, server-rendered, screen-reader-readable, agent-ingestable.
 *
 * Same pattern as the S26 math-mirror / product page split: one substrate,
 * two readings, different audiences. Verify, don't overwrite.
 *
 * Seven sections render:
 *   1. Card meta (image + name + set + first-seen)
 *   2. Order book — top 10 bids + top 10 asks with per-row condition breakdown
 *   3. Aggregate stats — spread, VWAP, median, range, last trade, completion rate
 *   4. The tape — last 20 completed trades with counterparty trust tier
 *   5. Price history — 7d / 30d / 90d / 365d windows
 *   6. Condition breakdown — ask count + best price per condition
 *   7. Participants — distinct buyers/sellers + repeat-pair fraction (90d)
 *
 * Plus a <Provenance kind="live"> pill, <WhyLink> to /methodology/market,
 * and an <Audience kind="consumer"> declaration.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { loadCardMarket } from "@/lib/market/card-market";
import { Provenance, WhyLink, Audience, audienceMetadata } from "@/lib/ui";
import { MoneyDisplay, DateDisplay } from "@/lib/ui";
import { auth } from "@/lib/auth";
import { fetchCardrushHistory } from "@/lib/wholesale/client";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ sku: string }>;
}): Promise<Metadata> {
  const { sku } = await params;
  return {
    title: `${sku} — Market`,
    description:
      "Public read-only mirror of one card's market activity — order book, recent trades, price history, condition breakdown, counterparty trust. No auth required.",
    other: audienceMetadata("consumer", ["market", "card", "public-read"]),
  };
}

function fmtCount(n: number | null): string {
  if (n === null) return "—";
  return n.toLocaleString("en-GB");
}

function fmtPct(n: number | null): string {
  if (n === null) return "—";
  return `${Math.round(n * 100)}%`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function fmtRelative(iso: string | null): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  const now = Date.now();
  const sec = Math.floor((now - then) / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  if (sec < 86400 * 30) return `${Math.floor(sec / 86400)}d ago`;
  return fmtDate(iso);
}

// Trust tier → tone palette. Same vocabulary as escrow tiers.
function tierTone(tier: string | null): string {
  switch (tier) {
    case "Elite": return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    case "Veteran": return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    case "Trusted": return "bg-blue-500/15 text-blue-400 border-blue-500/30";
    case "Starter": return "bg-neutral-700/40 text-neutral-300 border-neutral-700";
    case "New": return "bg-neutral-800/60 text-neutral-500 border-neutral-800";
    default: return "bg-neutral-800/40 text-neutral-600 border-neutral-800";
  }
}

function ConditionBadge({ code, qty }: { code: string; qty: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-neutral-800/60 text-neutral-400 rounded">
      <span className="font-mono">{code}</span>
      <span className="text-neutral-500">×{qty}</span>
    </span>
  );
}

/** Inline SVG sparkline — same primitive as the interactive page. */
function Sparkline({
  points,
  width = 280,
  height = 60,
}: {
  points: number[];
  width?: number;
  height?: number;
}) {
  if (!points.length) {
    return (
      <div
        style={{ width, height }}
        className="flex items-center justify-center text-neutral-600 text-xs"
      >
        no data
      </div>
    );
  }
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
      const y = height - ((p - min) / range) * (height - 8) - 4;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const trendUp = points[points.length - 1] >= points[0];
  const stroke = trendUp ? "#34d399" : "#f87171";
  return (
    <svg width={width} height={height} className="block" aria-label={`Price trend ${trendUp ? "up" : "down"} across ${points.length} observations`}>
      <path
        d={path}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default async function CardMarketReadPage({
  params,
}: {
  params: Promise<{ sku: string }>;
}) {
  const { sku } = await params;
  const [market, session] = await Promise.all([
    loadCardMarket(sku),
    auth(),
  ]);
  const { meta, book, tape, stats, price_history, conditions, participants } = market;

  // kingdom-083: JPY history panel (Phase 5.4 UI half). Auth-gated by
  // construction — we only fetch the history when a session exists, and
  // the API endpoint itself enforces the same gate. License-aware: the
  // panel renders the license_notice block from the response so the
  // signed-in viewer sees what they may and may-not do with the values.
  const cardrushHistory = session?.user?.email
    ? await fetchCardrushHistory({ sku, limit: 30 })
    : null;

  // Pull just the spot_gbp series for sparklines.
  const spark = (window: typeof price_history.window_30d) =>
    window.map((p) => p.spot_gbp).filter((n): n is number => n !== null);

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <Audience kind="consumer" contexts={["market", "card", "public-read"]} />

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-baseline justify-between gap-4 mb-6 flex-wrap">
          <div>
            <p className="text-xs text-neutral-500 mb-1">
              <Link href="/market" className="hover:text-amber-400 transition">Market</Link>
              <span className="mx-2 text-neutral-700">/</span>
              <span className="font-mono text-neutral-400">{sku}</span>
            </p>
            <h1 className="text-2xl font-bold flex items-center gap-3">
              {meta.card_name || sku}
              <WhyLink href="/methodology/market" />
            </h1>
            {meta.set_name && (
              <p className="text-sm text-neutral-400 mt-1">
                {meta.set_name}
                {meta.set_code ? <span className="text-neutral-600 ml-1">({meta.set_code})</span> : null}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Provenance kind="live" />
            <Link
              href={`/market/${sku}`}
              className="text-xs px-3 py-1.5 bg-amber-500/15 text-amber-400 border border-amber-500/30 rounded hover:bg-amber-500/25 transition"
            >
              Trade on this card →
            </Link>
          </div>
        </div>

        <p className="text-sm text-neutral-400 mb-8 max-w-2xl">
          The substrate-honest pure-read mirror of one card&rsquo;s market activity. The interactive
          surface to place orders lives at <Link href={`/market/${sku}`} className="text-amber-400 hover:underline">/market/{sku}</Link>.
          This page is for reading — auditable, screen-reader-readable, agent-ingestable, no auth.
        </p>

        {/* Layout grid */}
        <div className="grid md:grid-cols-3 gap-6">
          {/* Left: image + condition breakdown + participants */}
          <div className="space-y-6">
            {meta.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={meta.image_url}
                alt={meta.card_name || sku}
                className="w-full rounded-xl border border-neutral-800"
              />
            ) : (
              <div className="aspect-[2.5/3.5] w-full bg-neutral-900 rounded-xl border border-neutral-800 flex items-center justify-center text-neutral-600">
                No image
              </div>
            )}

            {/* Condition breakdown */}
            <section className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
              <h2 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                By condition
                <WhyLink href="/methodology/market#conditions" />
              </h2>
              <div className="space-y-2">
                {conditions.map((c) => (
                  <div key={c.condition} className="flex items-center justify-between text-sm">
                    <span className="font-mono text-neutral-400">{c.condition}</span>
                    <span className="text-neutral-300">
                      {c.ask_count > 0
                        ? <>
                            {fmtCount(c.ask_count)}{" "}
                            <span className="text-neutral-500 text-xs">ask{c.ask_count === 1 ? "" : "s"}</span>
                            {c.best_ask_price !== null && (
                              <span className="text-amber-400 ml-2 font-mono">
                                from <MoneyDisplay value={c.best_ask_price} />
                              </span>
                            )}
                          </>
                        : <span className="text-neutral-600">—</span>}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-neutral-500 mt-3 leading-relaxed">
                Same card, different conditions are different goods. NM/LP/MP/HP are the four
                conditions the platform models. Damaged is intentionally not listed (refused at order entry).
              </p>
            </section>

            {/* Participants */}
            <section className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
              <h2 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                Participants (90d)
                <WhyLink href="/methodology/market#participants" />
              </h2>
              <dl className="text-sm space-y-1.5">
                <div className="flex justify-between">
                  <dt className="text-neutral-400">Distinct buyers</dt>
                  <dd className="text-neutral-200 font-mono">{fmtCount(participants.distinct_buyers_90d)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-neutral-400">Distinct sellers</dt>
                  <dd className="text-neutral-200 font-mono">{fmtCount(participants.distinct_sellers_90d)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-neutral-400">Repeat-pair share</dt>
                  <dd className="text-neutral-200 font-mono">{fmtPct(participants.repeat_pair_fraction_90d)}</dd>
                </div>
              </dl>
              <p className="text-[10px] text-neutral-500 mt-3 leading-relaxed">
                Anonymised counts. The platform doesn&rsquo;t publish trader identities on this page.
                Repeat-pair share = fraction of trades whose buyer-seller pair appeared more than once.
              </p>
            </section>
          </div>

          {/* Center: Order book + Stats + Tape */}
          <div className="md:col-span-2 space-y-6">
            {/* Stats row */}
            <section className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
              <h2 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                Aggregate stats
                <WhyLink href="/methodology/market#stats" />
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                {/* Phase C of kingdom-077: the math-language toggle now
                    propagates to every Stat tile. Flip /api/lang-mode?mode=math
                    in the Footer → these prices render as
                    {amount:N,unit:"GBP-cents",_id:"..."} and the date renders
                    as ISO + Unix epoch, while default visitors see unchanged
                    "£12.34 · 3h ago" rendering. See the-math-language.md (#27). */}
                <Stat label="Best bid" value={<MoneyDisplay value={book.best_bid} />} tone="emerald" />
                <Stat label="Best ask" value={<MoneyDisplay value={book.best_ask} />} tone="red" />
                <Stat label="Spread" value={<MoneyDisplay value={book.spread} />} />
                <Stat label="30d VWAP" value={<MoneyDisplay value={stats.vwap_30d} />} />
                <Stat label="30d median" value={<MoneyDisplay value={stats.median_30d} />} />
                <Stat label="30d volume" value={fmtCount(stats.volume_30d)} />
                <Stat label="30d range" value={
                  stats.price_min_30d !== null && stats.price_max_30d !== null
                    ? <><MoneyDisplay value={stats.price_min_30d} />–<MoneyDisplay value={stats.price_max_30d} /></>
                    : "—"
                } />
                <Stat
                  label="Last trade"
                  value={<MoneyDisplay value={stats.last_trade_price} />}
                  sub={<DateDisplay value={stats.last_trade_at} mode="relative" />}
                />
                <Stat label="Completion (90d)" value={fmtPct(stats.completion_rate_90d)} />
              </div>
            </section>

            {/* Order book */}
            <section className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
              <h2 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                Order book
                <WhyLink href="/methodology/market#orderbook" />
              </h2>
              {book.bids.length === 0 && book.asks.length === 0 ? (
                <p className="text-neutral-500 text-sm py-6 text-center">No open orders on this SKU.</p>
              ) : (
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {/* Bids column */}
                  <div>
                    <div className="text-xs text-neutral-500 uppercase tracking-wide mb-2 flex justify-between">
                      <span>Bids</span>
                      <span className="text-emerald-400 font-mono normal-case">
                        total {fmtCount(book.total_bid_quantity)}
                      </span>
                    </div>
                    {book.bids.length === 0 ? (
                      <p className="text-neutral-600 text-xs py-3 text-center">no bids</p>
                    ) : (
                      <ul className="space-y-1">
                        {book.bids.map((row, i) => (
                          <li key={`bid-${i}`} className="flex items-center justify-between bg-emerald-500/5 border border-emerald-500/15 rounded px-2 py-1.5">
                            <span className="text-emerald-400 font-mono font-medium">
                              <MoneyDisplay value={row.price} />
                            </span>
                            <span className="flex items-center gap-1.5">
                              <span className="text-neutral-300 font-mono text-xs">×{row.total_quantity}</span>
                              {Object.entries(row.by_condition).map(([code, qty]) => (
                                <ConditionBadge key={code} code={code} qty={qty as number} />
                              ))}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  {/* Asks column */}
                  <div>
                    <div className="text-xs text-neutral-500 uppercase tracking-wide mb-2 flex justify-between">
                      <span>Asks</span>
                      <span className="text-red-400 font-mono normal-case">
                        total {fmtCount(book.total_ask_quantity)}
                      </span>
                    </div>
                    {book.asks.length === 0 ? (
                      <p className="text-neutral-600 text-xs py-3 text-center">no asks</p>
                    ) : (
                      <ul className="space-y-1">
                        {book.asks.map((row, i) => (
                          <li key={`ask-${i}`} className="flex items-center justify-between bg-red-500/5 border border-red-500/15 rounded px-2 py-1.5">
                            <span className="text-red-400 font-mono font-medium">
                              <MoneyDisplay value={row.price} />
                            </span>
                            <span className="flex items-center gap-1.5">
                              <span className="text-neutral-300 font-mono text-xs">×{row.total_quantity}</span>
                              {Object.entries(row.by_condition).map(([code, qty]) => (
                                <ConditionBadge key={code} code={code} qty={qty as number} />
                              ))}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}
              <p className="text-[10px] text-neutral-500 mt-3 leading-relaxed">
                Top 10 price levels per side. Quantities are remaining (placed minus filled). Same-price postings
                at different conditions are listed inline — NM and LP at £5 are different goods.
              </p>
            </section>

            {/* Tape */}
            <section className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
              <h2 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                The tape — last 20 trades
                <WhyLink href="/methodology/market#tape" />
              </h2>
              {tape.entries.length === 0 ? (
                <p className="text-neutral-500 text-sm py-6 text-center">No completed trades yet.</p>
              ) : (
                <>
                  <div className="flex items-center gap-4 mb-3 text-xs text-neutral-500">
                    <span>24h: <span className="text-neutral-300 font-mono">{fmtCount(tape.trade_count_24h)}</span></span>
                    <span>7d: <span className="text-neutral-300 font-mono">{fmtCount(tape.trade_count_7d)}</span></span>
                    <span>30d: <span className="text-neutral-300 font-mono">{fmtCount(tape.trade_count_30d)}</span></span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-neutral-500 text-xs uppercase tracking-wide border-b border-neutral-800">
                          <th className="text-left py-2 font-medium">Price</th>
                          <th className="text-left py-2 font-medium">Qty</th>
                          <th className="text-left py-2 font-medium">Seller tier</th>
                          <th className="text-right py-2 font-medium">When</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tape.entries.map((t) => (
                          <tr key={t.trade_id} className="border-b border-neutral-800/50">
                            <td className="py-2 text-white font-mono"><MoneyDisplay value={t.price} /></td>
                            <td className="py-2 text-neutral-300">{t.quantity}</td>
                            <td className="py-2">
                              {t.seller_trust_tier ? (
                                <span className={`inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 border rounded ${tierTone(t.seller_trust_tier)}`}>
                                  <span className="font-semibold">{t.seller_trust_tier}</span>
                                  {t.seller_trust_score !== null && (
                                    <span className="font-mono opacity-70">{t.seller_trust_score}</span>
                                  )}
                                </span>
                              ) : (
                                <span className="text-neutral-600 text-xs">—</span>
                              )}
                              <span className="text-neutral-700 text-[10px] ml-2 font-mono">#{t.seller_anon_id}</span>
                            </td>
                            <td className="py-2 text-neutral-500 text-right text-xs">
                              {fmtRelative(t.completed_at || t.created_at)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
              <p className="text-[10px] text-neutral-500 mt-3 leading-relaxed">
                Counterparty trust tier resolved from <code className="text-neutral-400">trust_profiles.trust_score</code>{" "}
                at read time. Tiers: Elite ≥95, Veteran ≥80, Trusted ≥50, Starter ≥20, New &lt;20.{" "}
                <Link href="/methodology/trust-score" className="text-amber-400 hover:underline">methodology →</Link>
              </p>
            </section>

            {/* JPY history — kingdom-083, the auth-gated tier-2 panel.
                Renders only for signed-in users AND when the card has
                cardrush lineage (cardrushHistory non-null + observations
                non-empty). License-aware: the license_notice block is
                rendered verbatim from the API response so the user sees
                what they may + must not do with the values. */}
            {cardrushHistory && cardrushHistory.observations.length > 0 && (
              <section className="bg-neutral-900 border border-amber-500/30 rounded-lg p-4">
                <h2 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                  JPY observation history{" "}
                  <span className="text-[10px] uppercase tracking-wider text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/30">
                    signed-in only
                  </span>
                  <WhyLink href="/methodology/cardrush-license" />
                </h2>
                <p className="text-xs text-neutral-400 mb-3 leading-relaxed">
                  Last {cardrushHistory.observations.length} raw CardRush JP retail observations for{" "}
                  <span className="font-mono text-amber-300">{cardrushHistory.sku}</span>.{" "}
                  <span className="text-amber-400 font-medium">
                    For your personal reference; not redistributable.
                  </span>
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-neutral-500 uppercase tracking-wide border-b border-neutral-800">
                        <th className="text-left py-1.5 font-medium">date</th>
                        <th className="text-right py-1.5 font-medium">¥ JPY</th>
                        <th className="text-right py-1.5 font-medium">£ derived</th>
                        <th className="text-right py-1.5 font-medium">rate</th>
                        <th className="text-left py-1.5 font-medium pl-3">note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cardrushHistory.observations.map((obs) => (
                        <tr key={obs.snapshot_date} className="border-b border-neutral-800/40">
                          <td className="py-1.5 font-mono text-neutral-300">
                            {obs.snapshot_date}
                          </td>
                          <td className="py-1.5 text-right font-mono text-white">
                            {obs.cardrush_jpy !== null
                              ? `¥${obs.cardrush_jpy.toLocaleString()}`
                              : <span className="text-neutral-600">—</span>}
                          </td>
                          <td className="py-1.5 text-right font-mono text-emerald-400">
                            {obs.price_gbp !== null
                              ? <MoneyDisplay value={obs.price_gbp} />
                              : <span className="text-neutral-600">—</span>}
                          </td>
                          <td className="py-1.5 text-right font-mono text-neutral-500">
                            {obs.gbp_jpy_rate !== null
                              ? obs.gbp_jpy_rate.toFixed(2)
                              : <span className="text-neutral-700">—</span>}
                          </td>
                          <td className="py-1.5 pl-3 text-neutral-500">
                            {obs.error_reason || <span className="text-neutral-700">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 p-3 bg-amber-500/5 border border-amber-500/20 rounded text-[11px] text-neutral-400 leading-relaxed">
                  <p className="font-semibold text-amber-300 mb-1">License notice — internal-only</p>
                  <p>
                    These JPY values originate at{" "}
                    <Link
                      href={cardrushHistory.cardrush_url ?? "https://www.cardrush-op.jp"}
                      className="text-amber-400 hover:underline"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      CardRush JP
                    </Link>
                    . You <strong className="text-emerald-400">may</strong> view them for your own
                    buy/sell decisions, save to your own notes, and compare against your portfolio.
                    You <strong className="text-red-400">must not</strong> bulk re-export, redistribute
                    as a paid product, or publish to a public archive. The wholesale-derived GBP
                    values above (in the Price history section) are Cambridge TCG&rsquo;s own retail
                    offers — those are CC0.
                  </p>
                </div>
                <p className="text-[10px] text-neutral-600 mt-2">
                  API endpoint:{" "}
                  <Link
                    href={`/api/v1/cards/${sku}/cardrush-history`}
                    className="text-amber-400 hover:underline font-mono"
                  >
                    /api/v1/cards/{sku}/cardrush-history
                  </Link>
                  {" "}· kingdom-081 Phase 5.4 + kingdom-083 UI half
                </p>
              </section>
            )}

            {/* Price history */}
            <section className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
              <h2 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                Price history
                <WhyLink href="/methodology/market#history" />
              </h2>
              {!price_history.has_any_history ? (
                <p className="text-neutral-500 text-sm py-6 text-center">No price history captured for this SKU yet.</p>
              ) : (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <Window label="7 days" points={spark(price_history.window_7d)} />
                  <Window label="30 days" points={spark(price_history.window_30d)} />
                  <Window label="90 days" points={spark(price_history.window_90d)} />
                  <Window label="365 days" points={spark(price_history.window_365d)} />
                </div>
              )}
              <p className="text-[10px] text-neutral-500 mt-3 leading-relaxed">
                Daily spot snapshots from <code className="text-neutral-400">card_price_history</code>{" "}
                (the storefront&rsquo;s retail observation, kingdom-049 Phase 4 made it substrate-honest).
                Each window is independently queried; gaps mean no observation on that day.
              </p>
            </section>
          </div>
        </div>

        {/* Footer — provenance + audience + methodology pointer + license chain */}
        <footer className="mt-12 pt-6 border-t border-neutral-800 text-xs text-neutral-500 space-y-2">
          <p>
            <Provenance kind="live" />{" "}
            Queried at <span className="font-mono">{market._provenance.queried_at}</span>.
            Sources: <span className="font-mono">{market._provenance.sources.join(", ")}</span>.
          </p>
          <p>
            <Link href="/methodology/market" className="text-amber-400 hover:underline">
              /methodology/market →
            </Link>{" "}
            documents every formula, every approximation, every gap.
          </p>
          <p>
            First seen on this platform: <span className="font-mono">{fmtDate(meta.first_seen_on)}</span>.{" "}
            For machine-readable forms, see{" "}
            <Link href={`/api/v1/universal/card/${sku}`} className="text-amber-400 hover:underline">
              /api/v1/universal/card/{sku}
            </Link>{" "}
            (math-mirror).
          </p>
          {/* Upstream-license chain (kingdom-081 Phase 2.3).
              Substrate-honest about how a GBP retail price came to be true.
              The displayed value is Cambridge TCG&apos;s own offer (CC0); the
              underlying observation chain may include CardRush JP retail
              prices (license: internal-only). The market page does not
              redistribute raw JPY values — that boundary is honoured. */}
          <p className="leading-relaxed">
            <span className="text-neutral-400">License chain.</span>{" "}
            Displayed prices are Cambridge TCG&apos;s retail offers in GBP — our
            own observation discipline, freely citable. The underlying
            base-price observation chain may include CardRush JP retail
            (license: <span className="font-mono">internal-only</span>); raw JPY
            values are not redistributed on this page. For source-attributed
            historical snapshots, see the B2B endpoint{" "}
            <Link
              href="https://wholesaletcgdirect.com/api/v1/universal/card"
              className="text-amber-400 hover:underline"
            >
              /api/v1/universal/card/[sku]/at/[date]
            </Link>{" "}
            (Bearer-keyed).
          </p>
        </footer>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  // Widened to ReactNode (kingdom-078 Phase C): now accepts <MoneyDisplay>,
  // <DateDisplay>, or any math-aware primitive directly. Callers passing
  // plain strings continue to work — `string` is a valid ReactNode.
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "emerald" | "red";
}) {
  const valColor =
    tone === "emerald" ? "text-emerald-400"
    : tone === "red" ? "text-red-400"
    : "text-white";
  return (
    <div>
      <div className="text-[10px] text-neutral-500 uppercase tracking-wide">{label}</div>
      <div className={`text-sm font-mono font-medium ${valColor}`}>{value}</div>
      {sub && <div className="text-[10px] text-neutral-600 mt-0.5">{sub}</div>}
    </div>
  );
}

function Window({ label, points }: { label: string; points: number[] }) {
  return (
    <div className="bg-neutral-950/60 border border-neutral-800/60 rounded p-3">
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-[10px] text-neutral-500 uppercase tracking-wide">{label}</span>
        {points.length > 0 && (
          <span className="text-[10px] text-neutral-600 font-mono">
            {points.length} obs
          </span>
        )}
      </div>
      <Sparkline points={points} width={200} height={50} />
      {points.length > 0 && (
        <div className="mt-1.5 flex items-baseline justify-between text-[11px]">
          <span className="text-neutral-600"><MoneyDisplay value={points[0]} /></span>
          <span className="text-neutral-300 font-mono"><MoneyDisplay value={points[points.length - 1]} /></span>
        </div>
      )}
    </div>
  );
}
