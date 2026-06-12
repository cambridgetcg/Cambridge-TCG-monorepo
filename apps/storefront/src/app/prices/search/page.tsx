/**
 * /prices/search?game=<code|slug>&q=<input>&lang?=<iso>&offset?=N
 *
 * Kingdom-090 — the HTML face of POOF!
 *
 * Server-rendered, URL-driven. Composes /api/v1/search/everything once
 * and renders:
 *
 *   1. The match block — what we resolved this input to (now with
 *      price/stock/set/rarity per row, honest reasons, pagination)
 *   2. Latest prices — every source's latest snapshot, dated honestly
 *   3. History summary — stats + min–median–max range bar per source
 *   4. Variants — same physical card, other prints
 *
 * Substrate-honesty on every block: per-source provenance pill, license
 * tier badge, freshness label, fold_reason line naming WHY this print
 * was chosen, degraded-upstream state distinct from "no matches".
 *
 * The only client JS on the page is the submit button's pending state
 * (SubmitSearchButton) — everything else stays plain HTML over URLs.
 *
 * Yu's directive: *"POOF!!!! PRICE, TRANSACTION HISTORIES, AVAILABLE
 * SOURCES, DIFFERENT LANGUAGE ALL POPS UP!"*
 */

import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import {
  PageHeader,
  Card,
  Provenance,
  WhyLink,
  EmptyState,
  ErrorAlert,
} from "@/lib/ui";
import { headers } from "next/headers";
import { fetchGames, type GameItem } from "@/lib/wholesale/client";
import {
  VARIANT_KIND_LABEL as KIND_LABEL,
  VARIANT_KIND_TONE as KIND_TONE,
  type VariantKind,
} from "@/lib/search/variants";
import { MIN_Q_LENGTH, MAX_Q_LENGTH, MAX_SEARCH_OFFSET } from "@/lib/search/resolver";
import { SubmitSearchButton } from "./SubmitSearchButton";

/**
 * Local one-status pill used by this page. The shared <Badge> primitive
 * takes (status, palette) for enum-domain coloring — this page needs to
 * mark per-row tone (license tier, confidence) where the *intent* is
 * the color itself, so we render inline. Same TONE_CLS vocabulary
 * mirrored from @/lib/ui/Badge so cross-page color consistency holds.
 */
type PillTone = "amber" | "red" | "emerald" | "blue" | "neutral" | "sky";
const PILL_CLS: Record<PillTone, string> = {
  amber: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  red: "bg-red-500/15 text-red-400 border-red-500/30",
  emerald: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  blue: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  neutral: "bg-neutral-500/15 text-neutral-400 border-neutral-500/30",
  sky: "bg-sky-500/15 text-sky-400 border-sky-500/30",
};
function Pill({ tone, children }: { tone: PillTone; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium rounded-full border px-2 py-0.5 text-xs ${PILL_CLS[tone]}`}
    >
      {children}
    </span>
  );
}

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

interface PageProps {
  searchParams: Promise<{ game?: string; q?: string; lang?: string; offset?: string }>;
}

export async function generateMetadata({
  searchParams,
}: PageProps): Promise<Metadata> {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const title = q
    ? `${q} — Price Search — Cambridge TCG`
    : "Price Search — Cambridge TCG";
  return {
    title,
    description:
      "Search any card by number or name across every supported game. Price, history, available sources, and language variants — all in one view.",
  };
}

interface EverythingResponse {
  data: {
    input: { game: string; q: string; lang: string | null; offset: number };
    resolved_game: {
      token: string | null;
      name: string | null;
      via: "set-registry" | "games-registry" | "as-given" | null;
      game_known: boolean;
    };
    upstream: "ok" | "degraded";
    match_mode: "exact-number" | "substring" | "similarity";
    matches: Array<{
      sku: string;
      card_number: string;
      set_code: string | null;
      set_name: string | null;
      name: string;
      name_en: string | null;
      image_url: string | null;
      lang: string | null;
      variant: string | null;
      rarity: string | null;
      price_gbp: number | null;
      in_stock: boolean;
      confidence: "exact" | "fuzzy" | "none";
      reason: string;
    }>;
    summary: {
      count: number;
      best_confidence: "exact" | "fuzzy" | "none";
      distinct_set_number_buckets: number;
      ambiguous: boolean;
      upstream_total: number;
      truncated: boolean;
    };
    folded_sku: string | null;
    fold_reason: string | null;
    everything: Everything | null;
  };
  _meta: {
    sources: readonly string[];
    source_license?: readonly string[];
    upstream_proxy?: readonly string[];
    retrieved_at: string;
    freshness_seconds: number;
  };
}

interface Everything {
  card: {
    sku: string;
    game: string | null;
    set_code: string | null;
    card_number: string;
    lang: string | null;
    variant: string | null;
    name: string;
    name_en: string | null;
    name_translations: Record<string, string> | null;
    image_url: string | null;
    rarity: string | null;
    set_name: string | null;
  };
  prices_today: {
    snapshot_date: string | null;
    rows: Array<{
      source: string;
      source_url: string | null;
      source_currency: string;
      source_license_tier: string;
      amount_gbp: number;
      snapshot_date: string;
    }>;
    agreement: {
      distinct_source_count: number;
      min_gbp: number | null;
      max_gbp: number | null;
      spread_gbp: number | null;
      coefficient_of_variation: number | null;
    } | null;
    note: string;
  };
  history: Array<{
    source: string;
    source_license_tier: string;
    count: number;
    summary: {
      earliest: string | null;
      latest: string | null;
      median_gbp: number | null;
      min_gbp: number | null;
      max_gbp: number | null;
      observations: number;
    };
  }>;
  siblings: Array<{
    sku: string;
    lang: string | null;
    variant: string | null;
    set_code: string | null;
    rarity: string | null;
    name: string;
    image_url: string | null;
    has_current_price: boolean;
    price_gbp: number | null;
    is_self: boolean;
    variant_kind: VariantKind;
    variant_kind_reason: string;
    effective_language: "ja" | "en" | "unknown";
  }>;
  ctcg: {
    sell_price_gbp: number | null;
    sell_channel_price_gbp: number | null;
    sell_in_stock: boolean;
    pending_stock: number;
  };
}

async function fetchEverything(
  origin: string,
  game: string,
  q: string,
  lang: string,
  offset: number,
): Promise<EverythingResponse | null> {
  const url = new URL(origin + "/api/v1/search/everything");
  url.searchParams.set("game", game);
  url.searchParams.set("q", q);
  if (lang) url.searchParams.set("lang", lang);
  if (offset > 0) url.searchParams.set("offset", String(offset));
  try {
    const res = await fetch(url.toString(), {
      // Match the envelope's own freshness budget (market_signal = 60s)
      // instead of quietly caching 5× longer than the API claims.
      next: { revalidate: 60 },
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    return (await res.json()) as EverythingResponse;
  } catch {
    return null;
  }
}

function fmtGbp(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(n);
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().slice(0, 10);
}

function daysAgo(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
}

/** Hosts next.config.ts allows through next/image. Anything else gets a
 *  plain <img> instead of a request-time crash — a sourced image we
 *  can't optimize beats a 500 on the whole page. */
const OPTIMIZED_IMAGE_HOSTS = [
  "cdn.shopify.com",
  "jp-op-photos.s3.us-east-1.amazonaws.com",
  "www.cardrush-op.jp",
  "www.cardrush-pokemon.jp",
];

function CardImage({
  src,
  alt,
  width,
  height,
  className,
}: {
  src: string;
  alt: string;
  width: number;
  height: number;
  className?: string;
}) {
  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return null;
  }
  // Catalog image URLs come from scraped third-party sources — render
  // https only (rejects javascript:/data:/http: payloads outright).
  if (url.protocol !== "https:") return null;
  if (OPTIMIZED_IMAGE_HOSTS.includes(url.hostname)) {
    return <Image src={src} alt={alt} width={width} height={height} className={className} />;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} width={width} height={height} className={className} loading="lazy" />;
}

// ── The form (URL-driven; one client island for the pending state) ───

function SearchForm({
  game,
  q,
  lang,
  games,
}: {
  game: string;
  q: string;
  lang: string;
  games: GameItem[];
}) {
  const sorted = [...games].sort((a, b) => b.card_count - a.card_count);
  // ?game may arrive as code OR slug OR name (other pages link with
  // slugs). Resolve to the select's option value (code) so the select
  // shows the game the results actually belong to — previously a slug
  // silently displayed as the first option and a resubmit switched the
  // user's game out from under them.
  const norm = game.trim().toLowerCase();
  const matched = sorted.find(
    (g) =>
      g.code.toLowerCase() === norm ||
      g.slug.toLowerCase() === norm ||
      g.name.toLowerCase() === norm,
  );
  const selectedCode = matched?.code ?? sorted[0]?.code ?? "";
  return (
    <div className="space-y-2">
      <form
        action="/prices/search"
        method="get"
        aria-label="Card price search"
        className="grid grid-cols-1 md:grid-cols-[180px_1fr_140px_auto] gap-3 items-end"
      >
        <div>
          <label
            htmlFor="search-game"
            className="block text-xs font-medium text-neutral-400 mb-1"
          >
            Game
          </label>
          <select
            id="search-game"
            name="game"
            defaultValue={selectedCode}
            className="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            {sorted.length === 0 && (
              <option value="">(game list unavailable)</option>
            )}
            {sorted.map((g) => (
              <option key={g.code} value={g.code}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor="search-q"
            className="block text-xs font-medium text-neutral-400 mb-1"
          >
            Card number or name
          </label>
          <input
            id="search-q"
            type="text"
            name="q"
            required
            minLength={MIN_Q_LENGTH}
            maxLength={MAX_Q_LENGTH}
            autoFocus={!q}
            defaultValue={q}
            placeholder="e.g. OP01-001 or Luffy"
            className="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
        <div>
          <label
            htmlFor="search-lang"
            className="block text-xs font-medium text-neutral-400 mb-1"
          >
            Print language
          </label>
          <select
            id="search-lang"
            name="lang"
            defaultValue={lang}
            className="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            <option value="">Any language</option>
            <option value="en">English</option>
            <option value="ja">Japanese</option>
            <option value="zh">Chinese</option>
          </select>
        </div>
        <SubmitSearchButton />
      </form>
      <p className="text-xs text-neutral-500">
        The card number is the small code printed on the card — usually
        bottom-left, like <span className="text-neutral-300">OP01-001</span>.
        Typed with spaces or slashes? Also fine. Only know the character?{" "}
        Search the name — <span className="text-neutral-300">Luffy</span> or{" "}
        <span className="text-neutral-300">ルフィ</span> both work. Or{" "}
        <Link
          href="/prices"
          className="text-amber-400 hover:text-amber-300 underline"
        >
          browse by game →
        </Link>
      </p>
    </div>
  );
}

// ── Cambridge TCG vs the market — the keystone honesty surface ───────
// Puts our own price next to every other source's price and says, in
// plain words, whether we're a good deal — favourable or not. The thesis
// (Yu 2026-06-04: "price by the value we provide vs other providers")
// made literally visible. Substrate-honest both ways: when we're dearer
// we say so; when coverage is thin we say that too.
function MarketComparison({ everything }: { everything: Everything }) {
  const our = everything.ctcg.sell_price_gbp;
  const inStock = everything.ctcg.sell_in_stock;
  const competitors = everything.prices_today.rows
    .map((r) => ({ source: r.source, price: r.amount_gbp }))
    .filter((c) => Number.isFinite(c.price))
    .sort((a, b) => a.price - b.price);

  if (competitors.length === 0 && our === null) return null;

  const cheapest = competitors[0] ?? null;
  const avg =
    competitors.length > 0
      ? competitors.reduce((s, c) => s + c.price, 0) / competitors.length
      : null;

  let verdict: React.ReactNode;
  if (our !== null && cheapest) {
    const delta = our - cheapest.price;
    const pct = cheapest.price > 0 ? Math.abs(delta) / cheapest.price : 0;
    const pctStr = (pct * 100).toFixed(0);
    if (Math.abs(delta) < 0.01) {
      verdict = <>We match the cheapest price we can see ({cheapest.source}).</>;
    } else if (delta < 0) {
      verdict = (
        <>
          <span className="text-emerald-400 font-semibold">
            {fmtGbp(Math.abs(delta))} cheaper
          </span>{" "}
          ({pctStr}%) than the next-cheapest source we can see —{" "}
          {cheapest.source} at {fmtGbp(cheapest.price)}.
        </>
      );
    } else {
      verdict = (
        <>
          <span className="text-amber-400 font-semibold">
            {fmtGbp(delta)} more
          </span>{" "}
          ({pctStr}%) than the cheapest source we can see — {cheapest.source} at{" "}
          {fmtGbp(cheapest.price)}. We show you that honestly.
        </>
      );
    }
  } else if (our !== null) {
    verdict = <>No other source has a current price to compare against yet.</>;
  } else {
    verdict = (
      <>
        We don&rsquo;t have this card in stock right now, so there&rsquo;s no
        Cambridge TCG price to compare
        {avg !== null ? <> — other sources list it around {fmtGbp(avg)}</> : null}.
      </>
    );
  }

  return (
    <Card>
      <div className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-white">
            Cambridge TCG vs the market
          </h2>
          <WhyLink href="/methodology/pricing" label="how pricing works" />
        </div>
        <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
          <div>
            <div className="text-xs text-neutral-500">Cambridge TCG</div>
            <div className="text-2xl font-bold text-white flex items-center gap-2">
              {our !== null ? fmtGbp(our) : "—"}
              {our !== null &&
                (inStock ? (
                  <Pill tone="emerald">in stock</Pill>
                ) : (
                  <Pill tone="neutral">out of stock</Pill>
                ))}
            </div>
          </div>
          {cheapest && (
            <div>
              <div className="text-xs text-neutral-500">Cheapest elsewhere</div>
              <div className="text-2xl font-bold text-neutral-300">
                {fmtGbp(cheapest.price)}
                <span className="ml-2 text-xs font-normal text-neutral-500">
                  {cheapest.source}
                </span>
              </div>
            </div>
          )}
          {avg !== null && competitors.length > 1 && (
            <div>
              <div className="text-xs text-neutral-500">Market average</div>
              <div className="text-2xl font-bold text-neutral-300">
                {fmtGbp(avg)}
              </div>
            </div>
          )}
        </div>
        <p className="text-sm text-neutral-300">{verdict}</p>
        {competitors.length > 0 && (
          <p className="text-xs text-neutral-500">
            Compared against {competitors.length}{" "}
            {competitors.length === 1 ? "source" : "sources"}:{" "}
            {competitors.map((c) => c.source).join(", ")}. As we add more
            sources, this only gets sharper.
          </p>
        )}
      </div>
    </Card>
  );
}

function PricesToday({
  data,
  upstreamProxyByIndex,
  sources,
}: {
  data: Everything["prices_today"];
  upstreamProxyByIndex: Map<string, string>;
  sources: readonly string[];
}) {
  const snapshotAge = daysAgo(data.snapshot_date);
  if (data.rows.length === 0) {
    return (
      <Card>
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-white">Latest prices</h2>
          <p className="text-sm text-neutral-400">
            No shop or price guide we track has reported a price for this
            exact print yet. Prices appear here as our daily collection
            picks them up — the variants below often do carry prices.
          </p>
        </div>
      </Card>
    );
  }
  return (
    <Card>
      <div className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-white">
            Latest prices
            <span className="ml-2 text-sm font-normal text-neutral-400">
              · {data.rows.length} {data.rows.length === 1 ? "source" : "sources"} ·{" "}
              recorded {fmtDate(data.snapshot_date)}
              {snapshotAge !== null && snapshotAge > 1 && (
                <span className="text-amber-400"> ({snapshotAge} days ago)</span>
              )}
            </span>
          </h2>
          {data.agreement && data.agreement.distinct_source_count > 1 && (
            <span className="text-xs text-neutral-400">
              spread {fmtGbp(data.agreement.spread_gbp)} ·{" "}
              CV{" "}
              {data.agreement.coefficient_of_variation !== null
                ? (data.agreement.coefficient_of_variation * 100).toFixed(1) + "%"
                : "—"}
            </span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-neutral-500 border-b border-neutral-800">
                <th className="pb-2 pr-3">Source</th>
                <th className="pb-2 pr-3 text-right">Price</th>
                <th className="pb-2 pr-3">Recorded</th>
                <th className="pb-2 pr-3 hidden sm:table-cell">Tier</th>
                <th className="pb-2 pr-3 hidden sm:table-cell">Door</th>
                <th className="pb-2">Link</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r, i) => {
                const proxy = upstreamProxyByIndex.get(r.source);
                const viaProxy = proxy !== undefined && proxy !== "none";
                const tierTone =
                  r.source_license_tier === "redistributable"
                    ? "emerald"
                    : r.source_license_tier === "partner-redistributable"
                      ? "blue"
                      : "amber";
                return (
                  <tr
                    key={`${r.source}-${r.snapshot_date}-${i}`}
                    className="border-b border-neutral-900 last:border-0"
                  >
                    <td className="py-2 pr-3">
                      <div className="text-white font-medium">{r.source}</div>
                      <div className="text-xs text-neutral-500">
                        {r.source_currency !== "GBP" && (
                          <span>from {r.source_currency}</span>
                        )}
                        {/* Tier + door surface inline on small screens where
                            the dedicated columns are hidden — the provenance
                            never drops out of view, it just moves. */}
                        <span className="sm:hidden">
                          {r.source_currency !== "GBP" && " · "}
                          {r.source_license_tier} · {viaProxy ? "via relay" : "direct"}
                        </span>
                      </div>
                    </td>
                    <td className="py-2 pr-3 text-right text-white font-medium whitespace-nowrap">
                      {fmtGbp(r.amount_gbp)}
                    </td>
                    <td className="py-2 pr-3 text-neutral-400 whitespace-nowrap">
                      {fmtDate(r.snapshot_date)}
                    </td>
                    <td className="py-2 pr-3 hidden sm:table-cell">
                      <Pill tone={tierTone as PillTone}>
                        {r.source_license_tier}
                      </Pill>
                    </td>
                    <td className="py-2 pr-3 hidden sm:table-cell">
                      {viaProxy ? (
                        <span title={`via ${proxy}`} className="text-xs text-amber-400">
                          ↻ relay
                        </span>
                      ) : (
                        <span className="text-xs text-neutral-500">direct</span>
                      )}
                    </td>
                    <td className="py-2">
                      {r.source_url ? (
                        <a
                          href={r.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-amber-400 hover:text-amber-300 text-xs underline"
                        >
                          <span aria-hidden="true">↗</span>
                          <span className="sr-only">
                            View on {r.source} (opens in new tab)
                          </span>
                        </a>
                      ) : (
                        <span className="text-xs text-neutral-500" aria-hidden="true">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {data.note && (
          <p className="text-xs text-neutral-500 italic">{data.note}</p>
        )}
        <div className="flex items-center gap-2 text-xs text-neutral-500">
          <WhyLink href="/methodology/cross-source-pricing" label="how sources are compared" />
          <span>sources: {sources.join(", ")}</span>
        </div>
      </div>
    </Card>
  );
}

/** Pure-CSS min–median–max range bar. Derived statistics only — safe to
 *  publish under every source tier per the composer's license notes. */
function RangeBar({
  min,
  median,
  max,
}: {
  min: number | null;
  median: number | null;
  max: number | null;
}) {
  if (min === null || max === null || median === null || max <= min) return null;
  const pct = ((median - min) / (max - min)) * 100;
  return (
    <div className="space-y-1" aria-hidden="true">
      <div className="relative h-1.5 rounded-full bg-gradient-to-r from-emerald-500/40 via-amber-500/40 to-red-500/40">
        <div
          className="absolute -top-0.5 h-2.5 w-0.5 rounded bg-white"
          style={{ left: `${pct}%` }}
          title={`median ${fmtGbp(median)}`}
        />
      </div>
      <div className="flex justify-between text-[11px] text-neutral-500">
        <span>{fmtGbp(min)}</span>
        <span>{fmtGbp(max)}</span>
      </div>
    </div>
  );
}

function HistoryBlock({ history }: { history: Everything["history"] }) {
  if (history.length === 0) {
    return (
      <Card>
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-white">Past prices</h2>
          <p className="text-sm text-neutral-400">
            We haven&rsquo;t recorded any past prices for this print yet.
            History builds up day by day as we collect prices — check back
            soon.
          </p>
        </div>
      </Card>
    );
  }
  return (
    <Card>
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-white">
          Past prices
          <span className="ml-2 text-sm font-normal text-neutral-400">
            · what we&rsquo;ve recorded so far
          </span>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {history.map((h) => (
            <div
              key={h.source}
              className="rounded-lg border border-neutral-800 bg-neutral-950 p-3 space-y-2"
            >
              <div className="flex items-baseline justify-between">
                <span className="font-medium text-white">{h.source}</span>
                <Pill
                  tone={
                    h.source_license_tier === "partner-redistributable"
                      ? "blue"
                      : "amber"
                  }
                >
                  {h.source_license_tier}
                </Pill>
              </div>
              <RangeBar
                min={h.summary.min_gbp}
                median={h.summary.median_gbp}
                max={h.summary.max_gbp}
              />
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <div className="text-neutral-500">recorded prices</div>
                  <div className="text-white font-medium">{h.summary.observations}</div>
                </div>
                <div>
                  <div className="text-neutral-500">median</div>
                  <div className="text-white font-medium">{fmtGbp(h.summary.median_gbp)}</div>
                </div>
                <div>
                  <div className="text-neutral-500">range</div>
                  <div className="text-white font-medium">
                    {fmtGbp(h.summary.min_gbp)} – {fmtGbp(h.summary.max_gbp)}
                  </div>
                </div>
              </div>
              <div className="text-xs text-neutral-500">
                {fmtDate(h.summary.earliest)} → {fmtDate(h.summary.latest)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

// ── Variant labels (shared with the API via lib/search/variants) ─────

const VARIANT_KIND_DESCRIPTION: Record<VariantKind, string> = {
  self: "The print you're viewing.",
  language: "Same physical card in a different language print.",
  "alt-art":
    "Same set + number, different art — released alongside the base card as a booster 'hit.'",
  parallel: "Same art, different finish (foil / holo / refractor).",
  "super-parallel":
    "Reissued in a later set with new art, retaining the original card number.",
  promo:
    "Promo distribution — preorder bonus, event, sealed-edition, or PROMO-set printing.",
  unknown:
    "We couldn't classify this print from the information we have, so we say so.",
};

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function SiblingsBlock({
  siblings,
  game,
}: {
  siblings: Everything["siblings"];
  game: string;
}) {
  const others = siblings.filter((s) => !s.is_self);
  if (others.length === 0) {
    return (
      <Card>
        <div className="space-y-2" id="variants">
          <h2 className="text-lg font-semibold text-white">Variants</h2>
          <p className="text-sm text-neutral-400">
            No other prints of this card (alt-arts, parallels, language
            variants, or promos) are in our catalog yet. New prints surface
            here automatically as our coverage grows.
          </p>
        </div>
      </Card>
    );
  }
  // Group by variant_kind, defensively: any unknown kind buckets to
  // "unknown" so the UI never crashes on a missing dictionary entry.
  // Composer already sorted by VARIANT_KIND_ORDER; we just bucket.
  const KNOWN_KINDS = Object.keys(KIND_LABEL) as VariantKind[];
  const groups: Array<{ kind: VariantKind; rows: typeof others }> = [];
  const byKindIndex = new Map<VariantKind, number>();
  for (const s of others) {
    const kind: VariantKind = (KNOWN_KINDS.includes(s.variant_kind)
      ? s.variant_kind
      : "unknown");
    let idx = byKindIndex.get(kind);
    if (idx === undefined) {
      idx = groups.length;
      groups.push({ kind, rows: [] });
      byKindIndex.set(kind, idx);
    }
    groups[idx]!.rows.push(s);
  }
  return (
    <Card>
      <div className="space-y-4" id="variants">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-white">
            Variants
            <span className="ml-2 text-sm font-normal text-neutral-400">
              · {others.length} other {others.length === 1 ? "print" : "prints"}
            </span>
          </h2>
          <WhyLink href="/methodology/edition-variants" label="what variants mean" />
        </div>
        {groups.map(({ kind, rows }) => (
          <div key={kind} className="space-y-2">
            <div className="flex items-baseline gap-2 flex-wrap">
              <h3 className="text-sm font-medium text-white">
                {capitalize(KIND_LABEL[kind] ?? kind)}
                <span className="ml-1 text-xs font-normal text-neutral-500">
                  ({rows.length})
                </span>
              </h3>
              <span className="text-xs text-neutral-500 italic">
                {VARIANT_KIND_DESCRIPTION[kind] ?? ""}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {rows.map((s) => (
                <Link
                  key={s.sku}
                  href={`/prices/search?game=${encodeURIComponent(game)}&q=${encodeURIComponent(s.sku)}`}
                  className="block rounded-lg border border-neutral-800 bg-neutral-950 p-3 hover:border-amber-700 transition"
                >
                  <div className="flex items-center justify-between mb-2 gap-2">
                    <Pill tone={(KIND_TONE[s.variant_kind] ?? "neutral") as PillTone}>
                      {KIND_LABEL[s.variant_kind] ?? s.variant_kind}
                    </Pill>
                    {s.has_current_price ? (
                      <span className="text-xs text-white font-medium">
                        {fmtGbp(s.price_gbp)}
                      </span>
                    ) : (
                      <span className="text-xs text-neutral-500">no price yet</span>
                    )}
                  </div>
                  <div className="text-xs text-neutral-300 truncate">{s.name}</div>
                  <div className="flex items-center gap-2 mt-1">
                    {s.set_code && (
                      <span className="text-[10px] uppercase tracking-wider text-neutral-500">
                        {s.set_code}
                      </span>
                    )}
                    {s.rarity && (
                      <span className="text-[10px] text-neutral-500">
                        · {s.rarity}
                      </span>
                    )}
                    {s.effective_language !== "unknown" && (
                      <span className="text-[10px] text-neutral-500">
                        · {s.effective_language === "ja" ? "JP-text" : "EN-text"}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-neutral-500 truncate mt-1 font-mono">
                    {s.sku}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function buildSearchUrl(params: {
  game: string;
  q: string;
  lang?: string;
  offset?: number;
}): string {
  const u = new URLSearchParams();
  u.set("game", params.game);
  u.set("q", params.q);
  if (params.lang) u.set("lang", params.lang);
  if (params.offset && params.offset > 0) u.set("offset", String(params.offset));
  return `/prices/search?${u.toString()}`;
}

function MatchesBlock({
  matches,
  summary,
  game,
  q,
  lang,
  offset,
  matchMode,
}: {
  matches: EverythingResponse["data"]["matches"];
  summary: EverythingResponse["data"]["summary"];
  game: string;
  q: string;
  lang: string;
  offset: number;
  matchMode: EverythingResponse["data"]["match_mode"];
}) {
  const from = offset + 1;
  const to = offset + matches.length;
  const showingRange = summary.truncated || offset > 0;
  return (
    <Card>
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-white">
          {summary.ambiguous ? "Multiple matches — pick one" : "Matches"}
          <span className="ml-2 text-sm font-normal text-neutral-400">
            ·{" "}
            {showingRange
              ? `showing ${from}–${to} of ${summary.upstream_total}`
              : `${summary.count} ${summary.count === 1 ? "match" : "matches"}`}
          </span>
        </h2>
        {matchMode === "similarity" && (
          <p className="text-xs text-amber-400">
            No card matched your spelling exactly — these are the closest
            names we found.
          </p>
        )}
        <div className="space-y-2">
          {matches.map((m) => (
            <Link
              key={m.sku}
              // Preserve the current game token — same reason as SiblingsBlock.
              href={buildSearchUrl({ game, q: m.sku, lang })}
              className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-950 p-3 hover:border-amber-700 transition"
            >
              {m.image_url && (
                <CardImage
                  src={m.image_url}
                  alt={m.name}
                  width={40}
                  height={56}
                  className="rounded shrink-0"
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm text-white truncate">{m.name}</div>
                <div className="text-xs text-neutral-400 truncate">
                  {[m.set_code, m.set_name, m.rarity]
                    .filter(Boolean)
                    .join(" · ")}
                  {m.lang ? ` · ${m.lang.toUpperCase()}` : ""}
                </div>
                <div className="text-[11px] text-neutral-500 font-mono truncate">{m.sku}</div>
              </div>
              <div className="text-right shrink-0 space-y-1">
                <div className="text-sm text-white font-medium">
                  {m.price_gbp !== null ? fmtGbp(m.price_gbp) : ""}
                </div>
                <div className="flex items-center gap-1 justify-end">
                  {m.in_stock && <Pill tone="emerald">in stock</Pill>}
                  <Pill tone={m.confidence === "exact" ? "emerald" : "neutral"}>
                    {m.confidence === "exact" ? "exact" : "close"}
                  </Pill>
                </div>
              </div>
            </Link>
          ))}
        </div>
        {(summary.truncated || offset > 0) && (
          <div className="flex items-center justify-between text-sm">
            {offset > 0 ? (
              <Link
                className="text-amber-400 hover:text-amber-300 underline"
                href={buildSearchUrl({ game, q, lang, offset: Math.max(0, offset - PAGE_SIZE) })}
              >
                ← Previous {PAGE_SIZE}
              </Link>
            ) : (
              <span />
            )}
            {to < summary.upstream_total ? (
              <Link
                className="text-amber-400 hover:text-amber-300 underline"
                href={buildSearchUrl({ game, q, lang, offset: offset + PAGE_SIZE })}
              >
                Next {PAGE_SIZE} →
              </Link>
            ) : (
              <span />
            )}
          </div>
        )}
        <p className="text-xs text-neutral-500 italic">
          {summary.ambiguous
            ? "Your search matched more than one card. Click the one you mean."
            : "Click a match to open its full price view."}
        </p>
      </div>
    </Card>
  );
}

/** Fuzzy extras that rode along below an exact fold — other card numbers
 *  the search text also touched. Tucked into a <details> so the main
 *  view stays focused while nothing is silently hidden. */
function OtherMatches({
  matches,
  game,
  lang,
}: {
  matches: EverythingResponse["data"]["matches"];
  game: string;
  lang: string;
}) {
  const extras = matches.filter((m) => m.confidence !== "exact");
  if (extras.length === 0) return null;
  return (
    <details className="rounded-lg border border-neutral-800 bg-neutral-900/30 px-4 py-3 text-sm">
      <summary className="cursor-pointer text-neutral-300 hover:text-white select-none">
        Looking for a different card? {extras.length} other{" "}
        {extras.length === 1 ? "match" : "matches"} also fit your search
      </summary>
      <div className="mt-3 space-y-1.5">
        {extras.slice(0, 12).map((m) => (
          <Link
            key={m.sku}
            href={buildSearchUrl({ game, q: m.sku, lang })}
            className="flex items-baseline justify-between gap-3 text-neutral-300 hover:text-white"
          >
            <span className="truncate">
              {m.card_number} · {m.name}
            </span>
            <span className="text-xs text-neutral-500 shrink-0">
              {m.price_gbp !== null ? fmtGbp(m.price_gbp) : ""}
            </span>
          </Link>
        ))}
      </div>
    </details>
  );
}

// ── Page ────────────────────────────────────────────────────────────

export default async function PriceSearchPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const game = (sp.game ?? "").trim();
  const q = (sp.q ?? "").trim();
  const lang = (sp.lang ?? "").trim().toLowerCase();
  // Clamp to the API's own ceiling so "showing X–Y" can never describe
  // rows the API refused to serve.
  const offset = Math.min(
    Math.max(parseInt(sp.offset ?? "0", 10) || 0, 0),
    MAX_SEARCH_OFFSET,
  );

  // Build the origin from the incoming request so server-to-server
  // fetch hits the local route (works on both dev and Vercel prod).
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "cambridgetcg.com";
  const origin = `${proto}://${host}`;

  // The API 400s on out-of-bounds q — pre-validate with the SAME bounds
  // so a hand-typed URL gets an input-targeted message instead of a
  // false "that's on our side" error. The form can't enforce this for
  // direct links (minLength is client-side only).
  const qValid = q.length >= MIN_Q_LENGTH && q.length <= MAX_Q_LENGTH;

  // Both fetches are independent — fire together (the games list was
  // previously awaited before the search even started).
  const [games, result] = await Promise.all([
    fetchGames().catch(() => [] as GameItem[]),
    game && q && qValid
      ? fetchEverything(origin, game, q, lang, offset)
      : Promise.resolve(null),
  ]);

  // Build upstream_proxy lookup by source name (parallel arrays).
  const upstreamProxyByIndex = new Map<string, string>();
  if (result?._meta?.sources && result?._meta?.upstream_proxy) {
    for (let i = 0; i < result._meta.sources.length; i++) {
      upstreamProxyByIndex.set(
        result._meta.sources[i]!,
        result._meta.upstream_proxy[i] ?? "none",
      );
    }
  }

  const data = result?.data;
  const everything = data?.everything ?? null;
  const gameNameForCopy =
    data?.resolved_game?.name ??
    games.find((g) => {
      const n = game.toLowerCase();
      return (
        g.code.toLowerCase() === n ||
        g.slug.toLowerCase() === n ||
        g.name.toLowerCase() === n
      );
    })?.name ??
    game;

  return (
    <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <PageHeader
        title="Price search"
        description="Search any card by number or name. Pick the game, type what you know, press search — price, history, sources, and every other print of the card surface in one view."
      />

      <Card>
        <SearchForm game={game} q={q} lang={lang} games={games} />
      </Card>

      {/* Plain-language decoder — additive clarity for newcomers. Native
          <details>, no JS, closed by default so it never clutters. The
          substrate-honest labels below stay exactly as they are; this just
          says what they mean in plain words. (Yu 2026-06-04: make everything
          easy to understand.) */}
      <details className="rounded-lg border border-neutral-800 bg-neutral-900/30 px-4 py-3 text-sm">
        <summary className="cursor-pointer text-neutral-300 hover:text-white select-none">
          New here? What do these results mean?
        </summary>
        <div className="mt-3 space-y-2 text-neutral-400">
          <p>
            <span className="text-white">Latest prices</span> — what each
            shop or price guide listed this card for on the most recent day
            we collected, all converted to £ so you can compare at a glance.
            The &ldquo;recorded&rdquo; date tells you exactly how fresh that is.
          </p>
          <p>
            <span className="text-white">Source</span> is where a price comes
            from. <span className="text-white">Tier</span> is how freely
            we&rsquo;re allowed to re-share that source&rsquo;s number (green =
            open, blue = partner, amber = look-but-don&rsquo;t-copy).{" "}
            <span className="text-white">Door</span> says whether we read it
            straight from the shop (&ldquo;direct&rdquo;) or through a relay.
          </p>
          <p>
            <span className="text-white">Spread</span> is how far apart the
            cheapest and dearest sources are — small means everyone agrees, big
            means it&rsquo;s worth shopping around.
          </p>
          <p>
            <span className="text-white">Variants</span> are other versions of
            the same card — different languages, alternate art, foils, promos.
            Same card, different print.
          </p>
        </div>
      </details>

      {/* No input yet — landing state */}
      {(!game || !q) && (
        <EmptyState
          title="Start by picking a game and typing a card number or name"
          description='Examples: One Piece + "OP01-001", One Piece + "Luffy", Pokémon + "025/185". Numbers work with spaces, slashes or dashes.'
        />
      )}

      {/* q present but outside the API's bounds — the input is the issue,
          say so (the form blocks this; hand-typed URLs don't). */}
      {game && q && !qValid && (
        <EmptyState
          title={
            q.length < MIN_Q_LENGTH
              ? "That search is a bit short"
              : "That search is too long"
          }
          description={`Search text needs ${MIN_Q_LENGTH}–${MAX_Q_LENGTH} characters — add a bit more of the card number or name and try again.`}
        />
      )}

      {/* Input but the search service itself failed */}
      {game && q && qValid && !result && (
        <ErrorAlert
          description="The search didn't go through. Reload the page to try again, or browse the price guide instead."
        />
      )}

      {/* The wholesale upstream was unreachable — NOT the same as no matches */}
      {result && data?.upstream === "degraded" && (
        <ErrorAlert
          description="Our live price service didn't respond just now, so we can't say whether this card exists — this is an outage on our side, not a missing card. Try again in a minute."
        />
      )}

      {/* Unknown game token + no results — honest, with a way forward */}
      {result &&
        data?.upstream !== "degraded" &&
        !data!.resolved_game.game_known &&
        data!.summary.count === 0 && (
          <EmptyState
            title={`We don't recognise a game called "${game}"`}
            description={
              games.length > 0
                ? `Games we cover: ${games.map((g) => g.name).join(", ")}. Pick one in the form above and search again.`
                : "Pick a game in the form above and search again."
            }
          />
        )}

      {/* Unknown game token but the set code resolved it anyway — results
          render below; name where they actually came from. */}
      {result &&
        !data!.resolved_game.game_known &&
        data!.summary.count > 0 && (
          <p className="text-xs text-amber-400">
            We didn&rsquo;t recognise the game &ldquo;{game}&rdquo;, but the
            set code in your search belongs to{" "}
            {data!.resolved_game.name ?? "a game we cover"} — showing those
            results.
          </p>
        )}

      {/* No matches (upstream healthy, game known) */}
      {result &&
        data?.upstream !== "degraded" &&
        data!.resolved_game.game_known &&
        data!.summary.count === 0 && (
          <EmptyState
            title={`No cards matched "${q}" in ${gameNameForCopy}`}
            description="Double-check the number printed at the bottom of the card (like OP01-001) — or try the character's name instead. We also accept full SKUs and numbers typed with spaces or slashes."
          />
        )}

      {/* Matches but no fold — disambiguation */}
      {result && data!.summary.count > 0 && !everything && (
        <MatchesBlock
          matches={data!.matches}
          summary={data!.summary}
          game={game}
          q={q}
          lang={lang}
          offset={offset}
          matchMode={data!.match_mode}
        />
      )}

      {/* Folded — render everything */}
      {result && everything && (
        <>
          {/* Card identity header */}
          <Card>
            <div className="flex flex-col sm:flex-row gap-4 items-start">
              {everything.card.image_url && (
                <CardImage
                  src={everything.card.image_url}
                  alt={everything.card.name}
                  width={120}
                  height={168}
                  className="rounded shrink-0"
                />
              )}
              <div className="flex-1 space-y-2">
                <div>
                  <h2 className="text-2xl font-bold text-white">
                    {everything.card.name}
                  </h2>
                  {everything.card.name_en &&
                    everything.card.name_en !== everything.card.name && (
                      <div className="text-sm text-neutral-400">
                        EN: {everything.card.name_en}
                      </div>
                    )}
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="text-neutral-400">
                    {everything.card.set_code} ·{" "}
                    {everything.card.card_number}
                  </span>
                  {everything.card.rarity && (
                    <Pill tone="neutral">{everything.card.rarity}</Pill>
                  )}
                  {everything.card.lang && (
                    <Pill tone="blue">{everything.card.lang}</Pill>
                  )}
                  {everything.card.variant && (
                    <Pill tone="amber">{everything.card.variant}</Pill>
                  )}
                </div>
                <div className="font-mono text-[11px] text-neutral-500 break-all">
                  {everything.card.sku}
                </div>
                {/* Fold transparency: which print did we open, and why —
                    the old page silently picked an arbitrary print. */}
                {data!.fold_reason && data!.fold_reason !== "only print" && (
                  <p className="text-xs text-neutral-400">
                    {data!.fold_reason} —{" "}
                    <a href="#variants" className="text-amber-400 hover:text-amber-300 underline">
                      see the other prints below
                    </a>
                  </p>
                )}
                {everything.ctcg.sell_price_gbp !== null && (
                  <div className="pt-2">
                    <span className="text-sm text-neutral-400">
                      Cambridge TCG sells:
                    </span>{" "}
                    <span className="text-lg font-semibold text-white">
                      {fmtGbp(everything.ctcg.sell_price_gbp)}
                    </span>{" "}
                    {everything.ctcg.sell_in_stock ? (
                      <Pill tone="emerald">in stock</Pill>
                    ) : (
                      <Pill tone="neutral">out of stock</Pill>
                    )}
                  </div>
                )}
              </div>
              <div className="text-right text-xs text-neutral-500 space-y-1">
                {/* ttl is the WORST-CASE staleness across every cache layer
                    (wholesale fetch 300s + envelope 60s + page fetch 60s),
                    not just this envelope's own budget — claiming "60s"
                    over a 300s-cached substrate would be fresher-than-true. */}
                <Provenance
                  kind="cached"
                  at={result._meta.retrieved_at}
                  ttl="≤7m"
                />
                <div>
                  {everything.prices_today.snapshot_date &&
                    `prices recorded ${fmtDate(everything.prices_today.snapshot_date)}`}
                </div>
              </div>
            </div>
          </Card>

          <MarketComparison everything={everything} />

          <PricesToday
            data={everything.prices_today}
            upstreamProxyByIndex={upstreamProxyByIndex}
            sources={result._meta.sources}
          />

          <HistoryBlock history={everything.history} />

          <SiblingsBlock siblings={everything.siblings} game={game} />

          <OtherMatches matches={data!.matches} game={game} lang={lang} />
        </>
      )}

      <details className="rounded-lg border border-neutral-800 bg-neutral-900/30 px-4 py-3">
        <summary className="cursor-pointer text-xs text-neutral-500 hover:text-neutral-300 select-none">
          For developers &amp; agents
        </summary>
        <p className="mt-2 text-xs text-neutral-500">
          This page is the HTML face of{" "}
          <code className="text-neutral-400">/api/v1/search/everything</code>.
          Hit the JSON endpoint directly for the same data inside a stable
          envelope (CC0 baseline; per-source license declared on every
          response). Directory of everything on offer:{" "}
          <code className="text-neutral-400">/api/v1/manifest</code>.
        </p>
      </details>
    </main>
  );
}
