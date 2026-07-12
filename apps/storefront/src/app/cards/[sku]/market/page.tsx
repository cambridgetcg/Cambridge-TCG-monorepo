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
 *   1. Canonical SKU + first-party first-seen time (imported meta withheld)
 *   2. Order book — top 10 bids + top 10 asks with per-row condition breakdown
 *   3. Aggregate stats — spread, VWAP, median, range, last trade
 *   4. The tape — last 20 completed first-party trades
 *   5. An explicit upstream price-history rights gap
 *   6. Condition breakdown — ask count + best price per condition
 *   7. Participants — distinct buyers/sellers + repeat-pair fraction (90d)
 *
 * Plus a <Provenance kind="live"> pill, <WhyLink> to /methodology/market,
 * and an <Audience kind="consumer"> declaration.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { loadCardMarket } from "@/lib/market/card-market";
import { Provenance, WhyLink, Audience, audienceMetadata, EmptyState } from "@/lib/ui";
import { MoneyDisplay, DateDisplay } from "@/lib/ui";
import { appearanceFromCookies } from "@/lib/wardrobe/server";
import { themeAttr } from "@/lib/wardrobe/themes";
import { voiceFor } from "@/lib/wardrobe/voice";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ sku: string }>;
}): Promise<Metadata> {
  const { sku } = await params;
  return {
    title: `${sku} — Market`,
    description:
      "Read-only first-party collector order book and completed-trade activity for a canonical SKU. Imported card metadata and upstream price history are withheld.",
    robots: { index: false, follow: true },
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

function ConditionBadge({ code, qty }: { code: string; qty: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-surface-elevated text-ink-muted rounded">
      <span className="font-mono">{code}</span>
      <span className="text-ink-faint font-mono tabular-nums">×{qty}</span>
    </span>
  );
}

export default async function CardMarketReadPage({
  params,
}: {
  params: Promise<{ sku: string }>;
}) {
  const { sku } = await params;
  const market = await loadCardMarket(sku);
  const { meta, book, tape, stats, conditions, participants } = market;

  // Wardrobe migration (spec §3.3): this page lives outside the /market
  // route group, so it dresses itself — cookie-read appearance on its own
  // wrapper (system-follow when unchosen), semantic tokens throughout below.
  const appearance = appearanceFromCookies(await cookies());
  const v = voiceFor(appearance.tone);

  return (
    <div data-theme={themeAttr(appearance.theme)} className="wardrobe-ground min-h-screen text-ink">
      <Audience kind="consumer" contexts={["market", "card", "public-read"]} />

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-baseline justify-between gap-4 mb-6 flex-wrap">
          <div>
            <p className="text-xs text-ink-faint mb-1">
              <Link href="/market" className="hover:text-accent transition">Market</Link>
              <span className="mx-2 text-ink-faint">/</span>
              <span className="font-mono text-ink-muted">{sku}</span>
            </p>
            <h1 className="font-display tracking-tight text-2xl font-bold flex items-center gap-3">
              {sku}
              <WhyLink href="/methodology/market" />
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Provenance kind="live" />
            <Link
              href={`/market/${sku}`}
              className="text-xs px-3 py-1.5 bg-accent-wash text-accent border border-accent/30 rounded hover:border-accent transition"
            >
              Trade on this card →
            </Link>
          </div>
        </div>

        <p className="text-sm text-ink-muted mb-8 max-w-2xl">
          The substrate-honest pure-read mirror of one card&rsquo;s market activity. The interactive
          surface to place orders lives at <Link href={`/market/${sku}`} className="text-accent hover:underline">/market/{sku}</Link>.
          This page is for reading — auditable, screen-reader-readable, agent-ingestable, no auth.
        </p>

        {/* Layout grid */}
        <div className="grid md:grid-cols-3 gap-6">
          {/* Left: image + condition breakdown + participants */}
          <div className="space-y-6">
            <div className="aspect-[2.5/3.5] w-full wardrobe-mat rounded-lg flex items-center justify-center p-6 text-center text-ink-faint text-xs">
              Upstream image and display metadata withheld pending affirmative public reuse rights.
            </div>

            {/* Condition breakdown */}
            <section className="wardrobe-mat rounded-lg p-4">
              <h2 className="font-display tracking-tight text-sm font-bold text-ink mb-3 flex items-center gap-2">
                By condition
                <WhyLink href="/methodology/market#conditions" />
              </h2>
              <div className="space-y-2">
                {conditions.map((c) => (
                  <div key={c.condition} className="flex items-center justify-between text-sm">
                    <span className="font-mono text-ink-muted">{c.condition}</span>
                    <span className="text-ink-muted">
                      {c.ask_count > 0
                        ? <>
                            <span className="font-mono tabular-nums text-ink">{fmtCount(c.ask_count)}</span>{" "}
                            <span className="text-ink-faint text-xs">ask{c.ask_count === 1 ? "" : "s"}</span>
                            {c.best_ask_price !== null && (
                              <span className="text-accent ml-2 font-mono tabular-nums">
                                from <MoneyDisplay value={c.best_ask_price} />
                              </span>
                            )}
                          </>
                        : <span className="text-ink-faint">—</span>}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-ink-faint mt-3 leading-relaxed">
                Same card, different conditions are different goods. NM/LP/MP/HP are the four
                conditions the platform models. Damaged is intentionally not listed (refused at order entry).
              </p>
            </section>

            {/* Participants */}
            <section className="wardrobe-mat rounded-lg p-4">
              <h2 className="font-display tracking-tight text-sm font-bold text-ink mb-3 flex items-center gap-2">
                Participants (90d)
                <WhyLink href="/methodology/market#participants" />
              </h2>
              <dl className="text-sm space-y-1.5">
                <div className="flex justify-between">
                  <dt className="text-ink-muted">Distinct buyers</dt>
                  <dd className="text-ink font-mono tabular-nums">{fmtCount(participants.distinct_buyers_90d)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-muted">Distinct sellers</dt>
                  <dd className="text-ink font-mono tabular-nums">{fmtCount(participants.distinct_sellers_90d)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-muted">Repeat-pair share</dt>
                  <dd className="text-ink font-mono tabular-nums">{fmtPct(participants.repeat_pair_fraction_90d)}</dd>
                </div>
              </dl>
              <p className="text-[10px] text-ink-faint mt-3 leading-relaxed">
                {participants.reason}
              </p>
            </section>
          </div>

          {/* Center: Order book + Stats + Tape */}
          <div className="md:col-span-2 space-y-6">
            {/* Stats row */}
            <section className="wardrobe-mat rounded-lg p-4">
              <h2 className="font-display tracking-tight text-sm font-bold text-ink mb-3 flex items-center gap-2">
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
              </div>
            </section>

            {/* Order book */}
            <section className="wardrobe-mat rounded-lg p-4">
              <h2 className="font-display tracking-tight text-sm font-bold text-ink mb-3 flex items-center gap-2">
                Order book
                <WhyLink href="/methodology/market#orderbook" />
              </h2>
              {book.bids.length === 0 && book.asks.length === 0 ? (
                <EmptyState
                  title={v("market.empty.book.title")}
                  description={v("market.empty.book.description")}
                />
              ) : (
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {/* Bids column */}
                  <div>
                    <div className="text-xs text-ink-faint uppercase tracking-wide mb-2 flex justify-between">
                      <span>Bids</span>
                      <span className="text-bid font-mono tabular-nums normal-case">
                        total {fmtCount(book.total_bid_quantity)}
                      </span>
                    </div>
                    {book.bids.length === 0 ? (
                      <p className="text-ink-faint text-xs py-3 text-center">no bids</p>
                    ) : (
                      <ul className="space-y-1">
                        {book.bids.map((row, i) => (
                          <li key={`bid-${i}`} className="flex items-center justify-between bg-bid/5 border border-bid/15 rounded px-2 py-1.5">
                            <span className="text-bid font-mono tabular-nums font-medium">
                              <MoneyDisplay value={row.price} />
                            </span>
                            <span className="flex items-center gap-1.5">
                              <span className="text-ink-muted font-mono tabular-nums text-xs">×{row.total_quantity}</span>
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
                    <div className="text-xs text-ink-faint uppercase tracking-wide mb-2 flex justify-between">
                      <span>Asks</span>
                      <span className="text-ask font-mono tabular-nums normal-case">
                        total {fmtCount(book.total_ask_quantity)}
                      </span>
                    </div>
                    {book.asks.length === 0 ? (
                      <p className="text-ink-faint text-xs py-3 text-center">no asks</p>
                    ) : (
                      <ul className="space-y-1">
                        {book.asks.map((row, i) => (
                          <li key={`ask-${i}`} className="flex items-center justify-between bg-ask/5 border border-ask/15 rounded px-2 py-1.5">
                            <span className="text-ask font-mono tabular-nums font-medium">
                              <MoneyDisplay value={row.price} />
                            </span>
                            <span className="flex items-center gap-1.5">
                              <span className="text-ink-muted font-mono tabular-nums text-xs">×{row.total_quantity}</span>
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
              <p className="text-[10px] text-ink-faint mt-3 leading-relaxed">
                Top 10 price levels per side. Quantities are remaining (placed minus filled). Same-price postings
                at different conditions are listed inline — NM and LP at £5 are different goods.
              </p>
            </section>

            {/* Tape */}
            <section className="wardrobe-mat rounded-lg p-4">
              <h2 className="font-display tracking-tight text-sm font-bold text-ink mb-3 flex items-center gap-2">
                The tape — last 20 trades
                <WhyLink href="/methodology/market#tape" />
              </h2>
              {tape.entries.length === 0 ? (
                <EmptyState title="No completed trades yet." />
              ) : (
                <>
                  <div className="flex items-center gap-4 mb-3 text-xs text-ink-faint">
                    <span>24h: <span className="text-ink-muted font-mono tabular-nums">{fmtCount(tape.trade_count_24h)}</span></span>
                    <span>7d: <span className="text-ink-muted font-mono tabular-nums">{fmtCount(tape.trade_count_7d)}</span></span>
                    <span>30d: <span className="text-ink-muted font-mono tabular-nums">{fmtCount(tape.trade_count_30d)}</span></span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-ink-faint text-xs uppercase tracking-wide border-b border-border-subtle">
                          <th className="text-left py-2 font-medium">Price</th>
                          <th className="text-left py-2 font-medium">Qty</th>
                          <th className="text-right py-2 font-medium">When</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tape.entries.map((t) => (
                          <tr key={t.public_ref} className="border-b border-border-subtle/50">
                            <td className="py-2 text-ink font-mono tabular-nums"><MoneyDisplay value={t.price} /></td>
                            <td className="py-2 text-ink-muted font-mono tabular-nums">{t.quantity}</td>
                            <td className="py-2 text-ink-faint text-right text-xs font-mono tabular-nums">
                              {fmtRelative(t.completed_at || t.created_at)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
              <p className="text-[10px] text-ink-faint mt-3 leading-relaxed">
                Public tape rows contain trade facts only. Seller identity,
                stable pseudonyms, profile data, and trust attributes are not selected.
              </p>
            </section>

            {/* Upstream price-history rights gap */}
            <section className="wardrobe-mat rounded-lg p-4">
              <h2 className="font-display tracking-tight text-sm font-bold text-ink mb-3 flex items-center gap-2">
                Upstream price history
                <WhyLink href="/methodology/market#history" />
              </h2>
              <p className="text-sm text-ink-muted leading-relaxed">
                Withheld. The legacy <code className="text-ink-muted">card_price_history</code>{" "}
                rows do not retain affirmative field-level source rights lineage.
                First-party bids, asks, and completed trade prices remain visible
                in the live book, tape, and aggregate sections above.
              </p>
            </section>
          </div>
        </div>

        {/* Footer — provenance + audience + methodology pointer + license chain */}
        <footer className="mt-12 pt-6 border-t border-border-subtle text-xs text-ink-faint space-y-2">
          <p>
            <Provenance kind="live" />{" "}
            Queried at <span className="font-mono tabular-nums">{market._provenance.queried_at}</span>.
            Sources: <span className="font-mono">{market._provenance.sources.join(", ")}</span>.
          </p>
          <p>
            <Link href="/methodology/market" className="text-accent hover:underline">
              /methodology/market →
            </Link>{" "}
            documents every formula, every approximation, every gap.
          </p>
          <p>
            First seen on this platform: <span className="font-mono tabular-nums">{fmtDate(meta.first_seen_on)}</span>.{" "}
            For machine-readable forms, see{" "}
            <Link href={`/api/v1/universal/card/${sku}`} className="text-accent hover:underline">
              /api/v1/universal/card/{sku}
            </Link>{" "}
            (math-mirror).
          </p>
          <p className="leading-relaxed">
            <span className="text-ink-muted">License chain.</span>{" "}
            Displayed book and trade values come from first-party collector
            orders and completed trades. Imported names, images, and upstream
            price-history values are withheld rather than relabelled as open.
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
    tone === "emerald" ? "text-bid"
    : tone === "red" ? "text-ask"
    : "text-ink";
  return (
    <div className="wardrobe-mat rounded-lg p-3">
      <div className="text-[10px] text-ink-faint uppercase tracking-wide">{label}</div>
      <div className={`text-sm font-mono tabular-nums font-medium ${valColor}`}>{value}</div>
      {sub && <div className="text-[10px] text-ink-faint mt-0.5">{sub}</div>}
    </div>
  );
}
