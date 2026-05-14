/**
 * /auctions/[id]/read — the public calm-read mirror of one auction.
 *
 * Server-rendered, no client JS, public no-auth, gated on
 * `auctionStateIsPublic` (drafts + pending-review consignments stay
 * hidden until approved).
 *
 * kingdom-074. Story-as-wire: docs/connections/the-auction-fanout.md (S39).
 *
 * The reading-position sibling to `/auctions/[id]` (interactive, polling,
 * bidding form). Same substrate, different audience: archivists, screen
 * readers, agents ingesting structure, link-share recipients, logged-out
 * collectors deciding whether to sign up to bid.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  loadAuctionState,
  auctionStateIsPublic,
} from "@/lib/auction/state";
import {
  Provenance,
  WhyLink,
  Audience,
  audienceMetadata,
  TrustTier,
  MoneyDisplay,
} from "@/lib/ui";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const isPublic = await auctionStateIsPublic(id);
  if (!isPublic) {
    return { title: "Auction not found — Cambridge TCG" };
  }
  const state = await loadAuctionState(id);
  if (!state) return { title: "Auction not found — Cambridge TCG" };
  return {
    title: `${state.meta.title} — Auction`,
    description: state.meta.description ?? `Public read-only mirror of one Cambridge TCG auction.`,
    other: audienceMetadata("consumer", ["auction", "public-read"]),
  };
}

const TYPE_LABELS: Record<string, string> = {
  english: "English (ascending)",
  dutch: "Dutch (descending)",
  buy_now: "Buy Now",
};

const STATUS_TONE: Record<string, string> = {
  scheduled: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  live:      "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  ended:     "bg-neutral-700/40 text-neutral-300 border-neutral-700",
  paid:      "bg-purple-500/15 text-purple-400 border-purple-500/30",
  cancelled: "bg-red-500/15 text-red-400 border-red-500/30",
  draft:     "bg-amber-500/15 text-amber-400 border-amber-500/30",
};

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_TONE[status] ?? STATUS_TONE.ended;
  return (
    <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 border rounded uppercase tracking-wide ${cls}`}>
      {status}
    </span>
  );
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fmtRel(iso: string | null): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  const now = Date.now();
  const sec = Math.floor((now - then) / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

function fmtRemaining(t: { days: number; hours: number; minutes: number; seconds: number } | null): string {
  if (!t) return "—";
  if (t.days > 0) return `${t.days}d ${t.hours}h ${t.minutes}m`;
  if (t.hours > 0) return `${t.hours}h ${t.minutes}m`;
  if (t.minutes > 0) return `${t.minutes}m ${t.seconds}s`;
  return `${t.seconds}s`;
}

export default async function AuctionReadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const isPublic = await auctionStateIsPublic(id);
  if (!isPublic) notFound();
  const state = await loadAuctionState(id);
  if (!state) notFound();

  const { meta, images, pricing, timing, reserve, bids, winner, seller, propagation } = state;
  const primaryImage = images[0]?.url;
  const isDutch = meta.auction_type === "dutch";

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <Audience kind="consumer" contexts={["auction", "public-read"]} />

      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-baseline justify-between gap-4 mb-6 flex-wrap">
          <div>
            <p className="text-xs text-neutral-500 mb-1">
              <Link href="/auctions" className="hover:text-amber-400 transition">Auctions</Link>
              <span className="mx-2 text-neutral-700">/</span>
              <span className="font-mono text-neutral-400 text-[10px]">{meta.id.slice(0, 8)}</span>
            </p>
            <h1 className="text-2xl font-bold flex items-center gap-3 flex-wrap">
              {meta.title}
              <StatusBadge status={meta.status} />
              <WhyLink href="/methodology/commission-rate" />
            </h1>
            <p className="text-sm text-neutral-400 mt-1">
              {TYPE_LABELS[meta.auction_type] ?? meta.auction_type}
              {meta.is_consignment && (
                <span className="ml-2 text-[11px] px-2 py-0.5 bg-blue-500/15 text-blue-400 border border-blue-500/30 rounded">
                  Consignment
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Provenance kind="live" />
            <Link
              href={`/auctions/${meta.id}`}
              className="text-xs px-3 py-1.5 bg-amber-500/15 text-amber-400 border border-amber-500/30 rounded hover:bg-amber-500/25 transition"
            >
              Bid on this →
            </Link>
            <Link
              href={`/api/v1/auctions/${meta.id}`}
              className="text-xs px-3 py-1.5 bg-neutral-800 text-neutral-300 border border-neutral-700 rounded hover:bg-neutral-700 transition font-mono"
            >
              JSON →
            </Link>
            <Link
              href={`/api/v1/universal/auctions/${meta.id}`}
              className="text-xs px-3 py-1.5 bg-neutral-800 text-neutral-300 border border-neutral-700 rounded hover:bg-neutral-700 transition font-mono"
            >
              math →
            </Link>
          </div>
        </div>

        <p className="text-sm text-neutral-400 mb-8 max-w-2xl">
          The substrate-honest pure-read mirror of one auction. Bidder identities are
          anonymised behind opaque ids; the reserve value is hidden until met;
          counterparty trust tiers are shown so the reader can judge the auction&rsquo;s
          shape without learning who anyone is. The interactive surface for placing
          bids is at <Link href={`/auctions/${meta.id}`} className="text-amber-400 hover:underline">/auctions/{meta.id.slice(0, 8)}</Link>.
        </p>

        <div className="grid md:grid-cols-3 gap-6">
          {/* Left: image + seller */}
          <div className="space-y-6">
            {primaryImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={primaryImage} alt={meta.title} className="w-full rounded-xl border border-neutral-800" />
            ) : (
              <div className="aspect-square w-full bg-neutral-900 rounded-xl border border-neutral-800 flex items-center justify-center text-neutral-600">
                No image
              </div>
            )}

            {images.length > 1 && (
              <div className="grid grid-cols-4 gap-2">
                {images.slice(1, 9).map((img) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={img.display_order}
                    src={img.url}
                    alt=""
                    className="aspect-square object-cover rounded border border-neutral-800"
                  />
                ))}
              </div>
            )}

            {/* Seller */}
            <section className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
              <h2 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                Seller
                <WhyLink href="/methodology/trust-score" />
              </h2>
              {!seller ? (
                <p className="text-neutral-500 text-sm">—</p>
              ) : (
                <div className="space-y-2 text-sm">
                  <div>
                    {seller.username ? (
                      <Link
                        href={`/u/${seller.username}/trust`}
                        className="text-amber-400 hover:underline font-medium"
                      >
                        {seller.display_name || seller.username}
                      </Link>
                    ) : (
                      <span className="text-neutral-300">{seller.display_name || "—"}</span>
                    )}
                    <span className="block text-[10px] text-neutral-500 mt-0.5">
                      {seller.is_consignment ? "Consignment seller" : "Platform-owned auction"}
                    </span>
                  </div>
                  {seller.trust_tier && (
                    <TrustTier
                      name={seller.trust_tier}
                      score={seller.trust_score}
                      size="sm"
                    />
                  )}
                </div>
              )}
            </section>

            {/* Description */}
            {meta.description && (
              <section className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
                <h2 className="text-sm font-bold text-white mb-3">Description</h2>
                <p className="text-sm text-neutral-300 whitespace-pre-wrap">{meta.description}</p>
              </section>
            )}
          </div>

          {/* Center+Right: pricing, timing, propagation, bids */}
          <div className="md:col-span-2 space-y-6">
            {/* Pricing */}
            <section className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
              <h2 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                Pricing
                <WhyLink href="/methodology/commission-rate" />
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                <Stat label="Current price" value={<MoneyDisplay value={pricing.current_price} />} tone="amber" />
                <Stat label="Starting price" value={<MoneyDisplay value={pricing.starting_price} />} />
                <Stat label="Bid increment" value={<MoneyDisplay value={pricing.bid_increment} />} />
                {pricing.buy_now_price !== null && (
                  <Stat label="Buy now" value={<MoneyDisplay value={pricing.buy_now_price} />} tone="emerald" />
                )}
                {meta.status === "live" && !timing.has_ended && (
                  <Stat label="Min next bid" value={<MoneyDisplay value={pricing.min_next_bid} />} />
                )}
                {isDutch && pricing.dutch_computed_price !== null && (
                  <Stat
                    label="Live computed"
                    value={<MoneyDisplay value={pricing.dutch_computed_price} />}
                    sub="dutch live"
                  />
                )}
                {reserve.reserve_met !== null && (
                  <Stat
                    label="Reserve"
                    value={reserve.reserve_met ? "met" : "not met"}
                    tone={reserve.reserve_met ? "emerald" : "amber"}
                  />
                )}
                {pricing.allow_best_offer && (
                  <Stat label="Best offer" value="accepted" />
                )}
              </div>
              {isDutch && pricing.dutch && (
                <p className="text-[10px] text-neutral-500 mt-3 leading-relaxed">
                  Dutch auction — drops <MoneyDisplay value={pricing.dutch.drop_amount} /> every{" "}
                  {pricing.dutch.drop_interval_seconds}s from <MoneyDisplay value={pricing.dutch.start_price} />{" "}
                  toward <MoneyDisplay value={pricing.dutch.end_price} />.
                </p>
              )}
            </section>

            {/* Timing */}
            <section className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
              <h2 className="text-sm font-bold text-white mb-3">Timing</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                <Stat label="Starts" value={fmtDate(timing.starts_at)} />
                <Stat label="Ends" value={fmtDate(timing.ends_at)} />
                {timing.actual_end_at && (
                  <Stat label="Actually ended" value={fmtDate(timing.actual_end_at)} />
                )}
                {!timing.has_ended && (
                  <Stat label="Time remaining" value={fmtRemaining(timing.time_remaining)} tone="amber" />
                )}
                {timing.has_ended && (
                  <Stat label="Status" value="Ended" tone="neutral" />
                )}
              </div>
            </section>

            {/* Propagation */}
            <section className="bg-amber-500/[0.03] border border-amber-500/20 rounded-lg p-4">
              <h2 className="text-sm font-bold text-amber-400 mb-1 flex items-center gap-2">
                What this auction state currently produces
                <WhyLink href="/methodology/commission-rate" />
              </h2>
              <p className="text-xs text-neutral-400 mb-4">
                The kingdom&rsquo;s live downstream effects if the auction settled at the current price.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                <PropRow
                  label="Commission rate"
                  value={propagation.commission_rate_display}
                  href="/methodology/commission-rate"
                />
                <PropRow
                  label="Payout hold"
                  value={`${propagation.payout_hold_days} day${propagation.payout_hold_days === 1 ? "" : "s"}`}
                  href="/methodology/payout-hold"
                />
                <PropRow
                  label="Escrow flow"
                  value="CTCG-mediated"
                  href="/methodology/escrow-tier"
                />
                <PropRow
                  label="Estimated seller payout"
                  value={<MoneyDisplay value={propagation.estimated_seller_payout_gbp} />}
                  href="/methodology/commission-rate"
                />
                <PropRow
                  label="Estimated commission"
                  value={<MoneyDisplay value={propagation.estimated_commission_gbp} />}
                  href="/methodology/commission-rate"
                />
              </div>
              <p className="text-[10px] text-neutral-500 mt-4 leading-relaxed">
                Estimated values use the current price; actual settlement may include
                shipping, dispute outcomes, or refunds. Auctions always route through
                CTCG-mediated escrow — different from P2P trades, which choose between
                direct / verified / full based on value and counterparty trust.
              </p>
            </section>

            {/* Winner (when ended) */}
            {winner && (
              <section className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
                <h2 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                  Winner
                  <WhyLink href="/methodology/trust-score" />
                </h2>
                <div className="flex items-center justify-between gap-4 flex-wrap text-sm">
                  <div>
                    <span className="text-neutral-300 font-mono">#{winner.anonymous_winner_id}</span>
                    {winner.trust_tier && (
                      <span className="ml-3">
                        <TrustTier name={winner.trust_tier} score={winner.trust_score} size="sm" />
                      </span>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-neutral-500 uppercase tracking-wide">Winning bid</div>
                    <div className="text-amber-400 font-mono font-medium"><MoneyDisplay value={winner.winning_bid} /></div>
                    {winner.paid_at && (
                      <div className="text-[10px] text-emerald-400 mt-1">Paid {fmtRel(winner.paid_at)}</div>
                    )}
                  </div>
                </div>
              </section>
            )}

            {/* Bids */}
            <section className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
              <h2 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                Recent bids
                <WhyLink href="/methodology/trust-score" />
              </h2>
              {bids.recent.length === 0 ? (
                <p className="text-neutral-500 text-sm py-4 text-center">No bids yet.</p>
              ) : (
                <>
                  <div className="flex items-center gap-4 mb-3 text-xs text-neutral-500">
                    <span>Total: <span className="text-neutral-300 font-mono">{bids.bid_count}</span></span>
                    <span>Unique bidders: <span className="text-neutral-300 font-mono">{bids.unique_bidders_count}</span></span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-neutral-500 text-xs uppercase tracking-wide border-b border-neutral-800">
                          <th className="text-left py-2 font-medium">Amount</th>
                          <th className="text-left py-2 font-medium">Bidder</th>
                          <th className="text-left py-2 font-medium">Tier</th>
                          <th className="text-right py-2 font-medium">When</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bids.recent.map((b, i) => (
                          <tr key={i} className="border-b border-neutral-800/50">
                            <td className="py-2 text-white font-mono">
                              <MoneyDisplay value={b.amount} />
                              {b.is_best_offer && (
                                <span className="ml-2 text-[10px] text-blue-400">offer</span>
                              )}
                            </td>
                            <td className="py-2 text-neutral-400 text-xs font-mono">#{b.anonymous_bidder_id}</td>
                            <td className="py-2">
                              {b.trust_tier ? (
                                <TrustTier name={b.trust_tier} score={b.trust_score} size="sm" />
                              ) : (
                                <span className="text-neutral-600 text-xs">—</span>
                              )}
                            </td>
                            <td className="py-2 text-neutral-500 text-right text-xs">{fmtRel(b.created_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
              <p className="text-[10px] text-neutral-500 mt-3 leading-relaxed">
                Last 50 bids, descending by time. Bidder identities are anonymised behind
                opaque ids; trust tiers come from <code>trust_profiles</code> joined at read time.
                {" "}<Link href="/methodology/trust-score" className="text-amber-400 hover:underline">methodology →</Link>
              </p>
            </section>
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-12 pt-6 border-t border-neutral-800 text-xs text-neutral-500 space-y-2">
          <p>
            <Provenance kind="live" /> Queried at{" "}
            <span className="font-mono">{state._provenance.queried_at}</span>. Sources:{" "}
            <span className="font-mono">{state._provenance.sources.slice(0, 5).join(", ")}</span>.
          </p>
          <p>
            JSON sibling at{" "}
            <Link href={`/api/v1/auctions/${meta.id}`} className="text-amber-400 hover:underline font-mono">
              /api/v1/auctions/{meta.id}
            </Link>
            . Math-mirror at{" "}
            <Link href={`/api/v1/universal/auctions/${meta.id}`} className="text-amber-400 hover:underline font-mono">
              /api/v1/universal/auctions/{meta.id}
            </Link>
            .
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
  // Widened to ReactNode (kingdom-078 Phase D pattern): now accepts
  // <MoneyDisplay> and other math-aware primitives directly.
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "emerald" | "red" | "amber" | "neutral";
}) {
  const valColor =
    tone === "emerald" ? "text-emerald-400"
    : tone === "red" ? "text-red-400"
    : tone === "amber" ? "text-amber-400"
    : tone === "neutral" ? "text-neutral-300"
    : "text-white";
  return (
    <div>
      <div className="text-[10px] text-neutral-500 uppercase tracking-wide">{label}</div>
      <div className={`text-sm font-mono font-medium ${valColor}`}>{value}</div>
      {sub && <div className="text-[10px] text-neutral-600 mt-0.5">{sub}</div>}
    </div>
  );
}

function PropRow({
  label,
  value,
  href,
}: {
  label: string;
  // Widened to ReactNode for <MoneyDisplay> et al — kingdom-078 Phase D.
  value: React.ReactNode;
  href: string;
}) {
  return (
    <div>
      <div className="text-[10px] text-neutral-500 uppercase tracking-wide flex items-center gap-1">
        {label}
        <Link href={href} className="text-neutral-700 hover:text-amber-400 transition" aria-label="Methodology">
          ?
        </Link>
      </div>
      <div className="text-sm font-mono font-medium text-amber-400">{value}</div>
    </div>
  );
}
