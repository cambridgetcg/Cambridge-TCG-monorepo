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
 *   /cards/[sku]/market is the *reading* surface (current depth and condition
 *     breakdown). Public,
 *     no auth, server-rendered, screen-reader-readable, agent-ingestable.
 *
 * Same pattern as the S26 math-mirror / product page split: one substrate,
 * two readings, different audiences. Verify, don't overwrite.
 *
 * Four public-data sections render:
 *   1. Card meta (name + set + first-seen; legacy image withheld)
 *   2. Order book — top 10 bids + top 10 asks with per-row condition breakdown
 *   3. Historical-price publication status
 *   4. Condition breakdown — ask count + best price per condition
 *
 * Plus a <Provenance kind="live"> pill, <WhyLink> to /methodology/market,
 * and an <Audience kind="consumer"> declaration.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { loadCardMarket } from "@/lib/market/card-market";
import { Provenance, WhyLink, Audience, audienceMetadata, EmptyState } from "@/lib/ui";
import { MoneyDisplay } from "@/lib/ui";
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
      "Public read-only mirror of one card's deliberate order intent and non-person reference history. Completed-trade analytics are paused. No auth required.",
    other: audienceMetadata("consumer", ["market", "card", "public-read"]),
  };
}

function fmtCount(n: number | null): string {
  if (n === null) return "—";
  return n.toLocaleString("en-GB");
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
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
  const { meta, book, conditions } = market;

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
              {meta.card_name || sku}
              <WhyLink href="/methodology/market" />
            </h1>
            {meta.set_name && (
              <p className="text-sm text-ink-muted mt-1">
                {meta.set_name}
                {meta.set_code ? <span className="text-ink-faint ml-1">({meta.set_code})</span> : null}
              </p>
            )}
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
          {/* Left: image + condition breakdown */}
          <div className="space-y-6">
            {meta.image_url ? (
              <div className="wardrobe-mat rounded-lg p-2 mb-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={meta.image_url}
                  alt={meta.card_name || sku}
                  className="w-full rounded"
                />
              </div>
            ) : (
              <div className="aspect-[2.5/3.5] w-full wardrobe-mat rounded-lg flex items-center justify-center text-ink-faint">
                No image
              </div>
            )}

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
          </div>

          {/* Center: deliberate order intent + publication status */}
          <div className="md:col-span-2 space-y-6">
            {/* Open-order snapshot */}
            <section className="wardrobe-mat rounded-lg p-4">
              <h2 className="font-display tracking-tight text-sm font-bold text-ink mb-3 flex items-center gap-2">
                Open-order snapshot
                <WhyLink href="/methodology/market#orderbook" />
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

            {/* Completed-trade publication pause */}
            <section className="wardrobe-mat rounded-lg p-4">
              <h2 className="font-display tracking-tight text-sm font-bold text-ink mb-3 flex items-center gap-2">
                Completed-trade analytics paused
                <WhyLink href="/methodology/market#trade-history" />
              </h2>
              <p className="text-xs text-ink-muted leading-relaxed">
                Completed-trade statistics are not published on this page. A
                small-record threshold did not establish publication consent
                or prevent reconstruction. These values can return only with a
                separate publication choice and a delayed, coarse release
                process.
              </p>
            </section>

            {/* Historical reference prices */}
            <section className="wardrobe-mat rounded-lg p-4">
              <h2 className="font-display tracking-tight text-sm font-bold text-ink mb-3 flex items-center gap-2">
                Historical reference prices unavailable
                <WhyLink href="/methodology/market#history" />
              </h2>
              <p className="text-xs text-ink-muted leading-relaxed">
                The existing history table mixes legacy reference observations
                with order-book snapshots and has no row-level source receipt.
                This page does not query or summarize it. Current public bids and
                asks remain visible above because they are deliberate offers.
              </p>
            </section>
          </div>
        </div>

        {/* Footer — provenance + audience + methodology pointer */}
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
            <span className="text-ink-muted">Publication boundary.</span>{" "}
            Current bids and asks are deliberate public offers. Legacy catalog
            prices, images, source observations, and historical derivatives are
            withheld pending field-level source receipts.
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
