/**
 * /u/[username]/trust — the public trust mirror.
 *
 * The headline of the trust position fan-out (kingdom-071, S37). Server-
 * rendered, public no-auth, gated on `users.is_public`. The page a
 * counterparty opens *before* committing to a trade, the page a screen
 * reader can speak, the page an agent can ingest as HTML or follow to
 * the JSON sibling.
 *
 * Composes `loadUserTrustState` from `lib/trust/state` — the same shape
 * the JSON + math-mirror siblings consume. Three readings, one substrate.
 *
 * Why this page exists at the top of the gap list:
 *   Every P2P trade decision in the kingdom pivots on counterparty
 *   trust. The interactive `/account/trust` is private to the owner.
 *   Before this page, the only public reading of one user's trust was
 *   the one-number badge on `/u/[username]`. The trajectory, the
 *   reviews distribution, the live downstream propagation chain — all
 *   were invisible to the very people who needed them most.
 *
 * The propagation block is the single most novel surface here. Every
 * other section can be assembled from existing data the kingdom shows
 * piece-meal; the propagation chain (commission rate / payout hold /
 * escrow band / trade limit) lives nowhere else as a coherent fact.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  loadUserTrustState,
  resolveUsername,
  userTrustStateIsPublic,
} from "@/lib/trust/state";
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
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  return {
    title: `${username} — Trust`,
    description:
      "Public trust profile — current score, tier band, 90-day trajectory, reviews distribution, and the live downstream effects on commission, escrow tier, and payout hold. Gated on the user's is_public preference.",
    other: audienceMetadata("consumer", ["trust", "user", "public-read"]),
  };
}

function fmtCount(n: number | null): string {
  if (n === null) return "—";
  return n.toLocaleString("en-GB");
}

function fmtPct(n: number | null, digits = 0): string {
  if (n === null) return "—";
  return `${(n * 100).toFixed(digits)}%`;
}

function fmtDelta(n: number | null): { text: string; tone: string } {
  if (n === null) return { text: "—", tone: "text-ink-faint" };
  if (n === 0) return { text: "±0", tone: "text-ink-muted" };
  if (n > 0) return { text: `+${n}`, tone: "text-ok" };
  return { text: `${n}`, tone: "text-danger" };
}

function fmtRating(n: number | null): string {
  if (n === null) return "—";
  return n.toFixed(2);
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Inline SVG sparkline for the 90-day trajectory. */
function TrajectorySparkline({
  points,
  width = 320,
  height = 60,
}: {
  points: { snapshot_date: string; trust_score: number }[];
  width?: number;
  height?: number;
}) {
  if (points.length < 2) {
    return (
      <div
        style={{ width, height }}
        className="flex items-center justify-center text-ink-faint text-xs"
      >
        not enough history yet
      </div>
    );
  }
  const min = Math.min(...points.map((p) => p.trust_score));
  const max = Math.max(...points.map((p) => p.trust_score));
  const range = max - min || 1;
  const stepX = width / (points.length - 1);
  const path = points
    .map((p, i) => {
      const x = i * stepX;
      const y = height - ((p.trust_score - min) / range) * (height - 8) - 4;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const trendUp = points[points.length - 1].trust_score >= points[0].trust_score;
  const stroke = trendUp ? "var(--color-ok)" : "var(--color-danger)";
  return (
    <svg
      width={width}
      height={height}
      aria-label={`Trust score ${trendUp ? "trending up" : "trending down"} across ${points.length} days`}
    >
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

/** Star-distribution bar. */
function DistRow({ label, count, total }: { label: string; count: number; total: number }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="text-ink-muted font-mono w-4">{label}</span>
      <div className="flex-1 h-2 bg-surface-subtle rounded overflow-hidden">
        <div
          className="h-full bg-warning/60 rounded"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-ink-faint font-mono w-12 text-right">{count}</span>
    </div>
  );
}

export default async function PublicTrustPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const userId = await resolveUsername(username);
  if (!userId) notFound();

  const isPublic = await userTrustStateIsPublic(userId);
  if (!isPublic) notFound();

  const state = await loadUserTrustState(userId);
  if (!state) notFound();

  const delta30 = fmtDelta(state.trajectory.delta_30d);
  const delta7 = fmtDelta(state.trajectory.delta_7d);
  const delta90 = fmtDelta(state.trajectory.delta_90d);

  return (
    <div className="min-h-screen bg-page text-ink">
      <Audience kind="consumer" contexts={["trust", "user", "public-read"]} />

      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-baseline justify-between gap-4 mb-6 flex-wrap">
          <div>
            <p className="text-xs text-ink-faint mb-1">
              <Link href={`/u/${username}`} className="hover:text-accent transition">
                {state.display_name || username}
              </Link>
              <span className="mx-2 text-ink-faint">/</span>
              <span className="text-ink-muted">Trust</span>
            </p>
            <h1 className="text-2xl font-display font-semibold flex items-center gap-3 flex-wrap">
              Trust profile
              <TrustTier
                name={state.tier.name}
                score={state.current.trust_score}
                nextTier={state.tier.next_tier}
                size="md"
              />
              <WhyLink href="/methodology/trust-score" />
            </h1>
            <p className="text-sm text-ink-muted mt-1">
              Member since {fmtDate(state.member_since)}.{" "}
              {state.flags.is_suspended && (
                <span className="inline-flex items-center text-[11px] px-2 py-0.5 bg-danger/15 text-danger border border-danger/30 rounded ml-2">
                  Suspended
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Provenance kind="live" />
            <Link
              href={`/api/v1/users/${username}/trust`}
              className="text-xs px-3 py-1.5 bg-surface text-ink-muted border border-border-subtle rounded hover:bg-surface-subtle transition font-mono"
            >
              JSON →
            </Link>
            <Link
              href={`/api/v1/universal/users/${username}/trust`}
              className="text-xs px-3 py-1.5 bg-surface text-ink-muted border border-border-subtle rounded hover:bg-surface-subtle transition font-mono"
            >
              math →
            </Link>
          </div>
        </div>

        <p className="text-sm text-ink-muted mb-8 max-w-2xl">
          The substrate-honest public view of one user&rsquo;s trust on
          Cambridge TCG. Every section below has a{" "}
          <code className="text-ink">?</code> glyph linking to its
          formula. The <strong>propagation</strong> block names the live
          downstream effects this score is currently producing — what other
          surfaces decide on the basis of these numbers.
        </p>

        <div className="grid md:grid-cols-3 gap-6">
          {/* Left: trajectory + reviews distribution */}
          <div className="space-y-6">
            <section className="bg-surface border border-border-subtle rounded-lg p-4">
              <h2 className="text-sm font-semibold text-ink mb-3 flex items-center gap-2">
                Trajectory (90d)
                <WhyLink href="/methodology/trust-score#trajectory" />
              </h2>
              <TrajectorySparkline points={state.trajectory.history} width={280} height={64} />
              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                <div>
                  <div className="text-[10px] text-ink-faint uppercase tracking-wide">7d</div>
                  <div className={`font-mono ${delta7.tone}`}>{delta7.text}</div>
                </div>
                <div>
                  <div className="text-[10px] text-ink-faint uppercase tracking-wide">30d</div>
                  <div className={`font-mono ${delta30.tone}`}>{delta30.text}</div>
                </div>
                <div>
                  <div className="text-[10px] text-ink-faint uppercase tracking-wide">90d</div>
                  <div className={`font-mono ${delta90.tone}`}>{delta90.text}</div>
                </div>
              </div>
              <p className="text-[10px] text-ink-faint mt-3 leading-relaxed">
                Daily snapshots from <code>trust_score_history</code>. The
                cron writes once per UTC day; gaps mean no snapshot that day.
              </p>
            </section>

            <section className="bg-surface border border-border-subtle rounded-lg p-4">
              <h2 className="text-sm font-semibold text-ink mb-3 flex items-center gap-2">
                Reviews
                <WhyLink href="/methodology/trust-score#reviews" />
              </h2>
              {state.reviews.total === 0 ? (
                <p className="text-ink-faint text-sm py-4 text-center">No public reviews yet.</p>
              ) : (
                <>
                  <div className="flex items-baseline gap-2 mb-3">
                    <span className="text-2xl font-mono text-warning">
                      {fmtRating(state.reviews.avg_rating)}
                    </span>
                    <span className="text-xs text-ink-faint">
                      / 5 across {fmtCount(state.reviews.total)} review{state.reviews.total === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="space-y-1.5 mb-3">
                    <DistRow label="5★" count={state.reviews.distribution.five} total={state.reviews.total} />
                    <DistRow label="4★" count={state.reviews.distribution.four} total={state.reviews.total} />
                    <DistRow label="3★" count={state.reviews.distribution.three} total={state.reviews.total} />
                    <DistRow label="2★" count={state.reviews.distribution.two} total={state.reviews.total} />
                    <DistRow label="1★" count={state.reviews.distribution.one} total={state.reviews.total} />
                  </div>
                  <div className="border-t border-border-subtle pt-3 mt-3 space-y-1 text-xs">
                    <div className="text-[10px] text-ink-faint uppercase tracking-wide mb-1">
                      Sub-rating averages
                    </div>
                    <div className="flex justify-between">
                      <span className="text-ink-muted">Card accuracy</span>
                      <span className="font-mono text-ink">{fmtRating(state.reviews.sub_ratings_avg.card_accuracy)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-ink-muted">Shipping speed</span>
                      <span className="font-mono text-ink">{fmtRating(state.reviews.sub_ratings_avg.shipping_speed)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-ink-muted">Communication</span>
                      <span className="font-mono text-ink">{fmtRating(state.reviews.sub_ratings_avg.communication)}</span>
                    </div>
                  </div>
                </>
              )}
              <p className="text-[10px] text-ink-faint mt-3 leading-relaxed">
                Public reviews only. Hidden / admin-moderated reviews are
                excluded by the composer.
              </p>
            </section>
          </div>

          {/* Center+Right: stats + propagation */}
          <div className="md:col-span-2 space-y-6">
            {/* Stats */}
            <section className="bg-surface border border-border-subtle rounded-lg p-4">
              <h2 className="text-sm font-semibold text-ink mb-3 flex items-center gap-2">
                Trade history
                <WhyLink href="/methodology/trust-score#stats" />
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                <Stat label="Total trades" value={fmtCount(state.stats.total_trades)} />
                <Stat label="Completed" value={fmtCount(state.stats.completed_trades)} tone="emerald" />
                <Stat label="Cancelled" value={fmtCount(state.stats.cancelled_trades)} />
                <Stat label="Disputed" value={fmtCount(state.stats.disputed_trades)} tone={state.stats.disputed_trades > 0 ? "amber" : undefined} />
                <Stat label="Disputes won" value={fmtCount(state.stats.disputes_won)} />
                <Stat label="Disputes lost" value={fmtCount(state.stats.disputes_lost)} />
                <Stat label="Completion rate" value={fmtPct(state.stats.completion_rate, 1)} />
                <Stat label="Dispute rate" value={fmtPct(state.stats.dispute_rate, 1)} />
                <Stat
                  label="Total volume"
                  value={<MoneyDisplay value={state.stats.total_volume_gbp} />}
                />
                <Stat
                  label="Largest trade"
                  value={<MoneyDisplay value={state.stats.largest_trade_gbp} />}
                />
              </div>
            </section>

            {/* Propagation — the killer section */}
            <section className="bg-accent-wash border border-accent/20 rounded-lg p-4">
              <h2 className="text-sm font-semibold text-accent-strong mb-1 flex items-center gap-2">
                What this trust score currently produces
                <WhyLink href="/methodology/trust-score#propagation" />
              </h2>
              <p className="text-xs text-ink-muted mb-4">
                The live downstream effects. Every value here is what the
                kingdom would apply to a trade by this user *right now*,
                given their current score of <code>{state.current.trust_score}</code>{" "}
                ({state.tier.name} tier).
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                <PropRow
                  label="Commission rate"
                  value={state.propagation.commission_rate_display}
                  href="/methodology/commission-rate"
                />
                <PropRow
                  label="Payout hold"
                  value={`${state.propagation.payout_hold_days} day${state.propagation.payout_hold_days === 1 ? "" : "s"}`}
                  href="/methodology/payout-hold"
                />
                <PropRow
                  label="Per-trade limit"
                  value={<MoneyDisplay value={state.propagation.trade_limit_gbp} />}
                  href="/methodology/trust-score"
                />
                <PropRow
                  label="Daily limit"
                  value={<MoneyDisplay value={state.propagation.daily_limit_gbp} />}
                  href="/methodology/trust-score"
                />
                <PropRow
                  label="Direct escrow ≤"
                  value={<MoneyDisplay value={state.propagation.direct_escrow_max_gbp} />}
                  href="/methodology/escrow-tier"
                />
                <PropRow
                  label="Verified escrow ≤"
                  value={<MoneyDisplay value={state.propagation.verified_escrow_max_gbp} />}
                  href="/methodology/escrow-tier"
                />
                <PropRow
                  label="Default inspection"
                  value={state.propagation.requires_inspection ? "required" : "not required"}
                  href="/methodology/escrow-tier"
                />
              </div>
              <p className="text-[10px] text-ink-faint mt-4 leading-relaxed">
                Per-trade values may differ from these defaults — escrow
                routing can impose a higher hold floor, item categories
                like graded slabs always require inspection regardless of
                tier. The values here are the typical-case for this user;
                actual values per trade are recorded on the trade row.
              </p>
            </section>

            {/* Next tier hint */}
            {state.tier.next_tier && (
              <section className="bg-surface border border-border-subtle rounded-lg p-4">
                <h2 className="text-sm font-semibold text-ink mb-2 flex items-center gap-2">
                  Next tier
                  <WhyLink href="/methodology/trust-score#tiers" />
                </h2>
                <p className="text-sm text-ink-muted">
                  <span className="font-mono text-accent">
                    {state.tier.next_tier.points_away}
                  </span>{" "}
                  point{state.tier.next_tier.points_away === 1 ? "" : "s"} away
                  from{" "}
                  <TrustTier
                    name={state.tier.next_tier.name}
                    score={state.tier.next_tier.min_score}
                    showScore={false}
                    size="sm"
                  />
                </p>
              </section>
            )}
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-12 pt-6 border-t border-border-subtle text-xs text-ink-faint space-y-2">
          <p>
            <Provenance kind="live" /> Queried at{" "}
            <span className="font-mono">{state._provenance.queried_at}</span>
            {state.current.last_calculated_at && (
              <>
                {" · "}Last recomputed at{" "}
                <span className="font-mono">{state.current.last_calculated_at}</span>
              </>
            )}
            . Sources:{" "}
            <span className="font-mono">{state._provenance.sources.slice(0, 4).join(", ")}</span>.
          </p>
          <p>
            <Link href="/methodology/trust-score" className="text-accent hover:underline">
              /methodology/trust-score →
            </Link>{" "}
            documents every formula. JSON sibling at{" "}
            <Link
              href={`/api/v1/users/${username}/trust`}
              className="text-accent hover:underline font-mono"
            >
              /api/v1/users/{username}/trust
            </Link>
            . Math-mirror at{" "}
            <Link
              href={`/api/v1/universal/users/${username}/trust`}
              className="text-accent hover:underline font-mono"
            >
              /api/v1/universal/users/{username}/trust
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
  tone,
}: {
  label: string;
  // Widened to ReactNode so <MoneyDisplay> et al can compose. Kingdom-078
  // Phase D pattern — same widening sister applied to other Stat panels.
  value: React.ReactNode;
  tone?: "emerald" | "red" | "amber";
}) {
  const valColor =
    tone === "emerald" ? "text-ok"
    : tone === "red" ? "text-danger"
    : tone === "amber" ? "text-warning"
    : "text-ink";
  return (
    <div>
      <div className="text-[10px] text-ink-faint uppercase tracking-wide">{label}</div>
      <div className={`text-sm font-mono font-medium ${valColor}`}>{value}</div>
    </div>
  );
}

function PropRow({
  label,
  value,
  href,
}: {
  label: string;
  // Widened to ReactNode for the same reason as Stat above.
  value: React.ReactNode;
  href: string;
}) {
  return (
    <div>
      <div className="text-[10px] text-ink-faint uppercase tracking-wide flex items-center gap-1">
        {label}
        <Link href={href} className="text-ink-faint hover:text-accent transition" aria-label="Methodology">
          ?
        </Link>
      </div>
      <div className="text-sm font-mono font-medium text-accent-strong">{value}</div>
    </div>
  );
}
