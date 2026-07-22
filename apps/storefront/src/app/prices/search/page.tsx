/**
 * /prices/search?game=<code|slug>&q=<input>&lang?=<iso>
 *
 * Kingdom-090 — the HTML face of POOF!
 *
 * Server-rendered, URL-driven. Composes /api/v1/search/everything once
 * and renders four sections:
 *
 *   1. The match block — what we resolved this input to
 *   2. Price publication status — legacy values withheld
 *   3. History publication status — legacy movements withheld
 *   4. Siblings — same physical card, different languages
 *
 * Substrate-honesty on every block: per-source provenance pill, license
 * tier badge, freshness label. Bright Data-routed sources surface their
 * proxy declaration via the `_meta.upstream_proxy` field.
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
import { fetchGames } from "@/lib/wholesale/client";
import { CardPriceSearchForm } from "@/app/prices/_components/CardPriceSearchForm";
import {
  ReferenceComparison,
  ReferencePriceSummary,
  formatGbp as fmtGbp,
  type ReferencePrice,
} from "./ReferencePriceView";

/**
 * Local one-status pill used by this page. The shared <Badge> primitive
 * takes (status, palette) for enum-domain coloring — this page needs to
 * mark per-row tone (license tier, confidence) where the *intent* is
 * the color itself, so we render inline. Same TONE_CLS vocabulary
 * mirrored from @/lib/ui/Badge so cross-page color consistency holds.
 */
type PillTone = "amber" | "red" | "emerald" | "blue" | "neutral" | "sky";
const PILL_CLS: Record<PillTone, string> = {
  amber: "bg-accent-wash text-accent border-accent/30",
  red: "bg-danger/15 text-danger border-danger/30",
  emerald: "bg-ok/15 text-ok border-ok/30",
  blue: "bg-info/15 text-info border-info/30",
  neutral: "bg-surface-subtle text-ink-muted border-border-subtle",
  sky: "bg-info/15 text-info border-info/30",
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

interface PageProps {
  searchParams: Promise<{ game?: string; q?: string; lang?: string }>;
}

export async function generateMetadata({
  searchParams,
}: PageProps): Promise<Metadata> {
  const sp = await searchParams;
  const q = sp.q ?? "";
  const title = q
    ? `${q.toUpperCase()} — Structural Card Search — Cambridge TCG`
    : "Structural Card Search — Cambridge TCG";
  return {
    title,
    description:
      "Search structural card fields by number. Legacy prices, images, and transaction history are withheld; source status and known language variants remain visible.",
  };
}

interface EverythingResponse {
  data: {
    input: { game: string; q: string; lang: string | null };
    matches: Array<{
      sku: string;
      card_number: string;
      set_code: string | null;
      name: string;
      name_en: string | null;
      image_url: string | null;
      lang: string | null;
      variant: string | null;
      confidence: "exact" | "fuzzy" | "none";
      reason: string;
    }>;
    summary: {
      count: number;
      best_confidence: "exact" | "fuzzy" | "none";
      distinct_set_number_buckets: number;
      ambiguous: boolean;
    };
    folded_sku: string | null;
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
    variant_kind:
      | "self"
      | "language"
      | "alt-art"
      | "parallel"
      | "super-parallel"
      | "promo"
      | "unknown";
    variant_kind_reason: string;
    effective_language: "ja" | "en" | "unknown";
  }>;
  reference_price: ReferencePrice;
}

async function fetchEverything(
  origin: string,
  game: string,
  q: string,
  lang: string,
): Promise<EverythingResponse | null> {
  const url = new URL(origin + "/api/v1/search/everything");
  url.searchParams.set("game", game);
  url.searchParams.set("q", q);
  if (lang) url.searchParams.set("lang", lang);
  try {
    const res = await fetch(url.toString(), {
      next: { revalidate: 300 },
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    return (await res.json()) as EverythingResponse;
  } catch {
    return null;
  }
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().slice(0, 10);
}

// ── Section components ──────────────────────────────────────────────

function PricesToday({
  data,
  upstreamProxyByIndex,
  sources,
}: {
  data: Everything["prices_today"];
  upstreamProxyByIndex: Map<string, string>;
  sources: readonly string[];
}) {
  if (data.rows.length === 0) {
    return (
      <Card>
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-ink">Price publication status</h2>
          <p className="text-sm text-ink-muted">
            Legacy wholesale price values are withheld pending field-level source-rights
            records. Null means withheld, not zero. {data.note}
          </p>
        </div>
      </Card>
    );
  }
  return (
    <Card>
      <div className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-ink">
            Today&rsquo;s prices
            <span className="ml-2 text-sm font-normal text-ink-muted">
              · {data.rows.length} {data.rows.length === 1 ? "source" : "sources"} ·{" "}
              snapshot {fmtDate(data.snapshot_date)}
            </span>
          </h2>
          {data.agreement && data.agreement.distinct_source_count > 1 && (
            <span className="text-xs text-ink-muted">
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
              <tr className="text-left text-xs uppercase tracking-wider text-ink-faint border-b border-border-subtle">
                <th className="pb-2 pr-3">Source</th>
                <th className="pb-2 pr-3">Tier</th>
                <th className="pb-2 pr-3">Currency</th>
                <th className="pb-2 pr-3 text-right">Price (GBP)</th>
                <th className="pb-2 pr-3">Snapshot</th>
                <th className="pb-2 pr-3">Door</th>
                <th className="pb-2">Link</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => {
                const proxy = upstreamProxyByIndex.get(r.source);
                const tierTone =
                  r.source_license_tier === "redistributable"
                    ? "emerald"
                    : r.source_license_tier === "partner-redistributable"
                      ? "blue"
                      : "amber";
                return (
                  <tr
                    key={r.source}
                    className="border-b border-border-subtle last:border-0"
                  >
                    <td className="py-2 pr-3 text-ink font-medium">{r.source}</td>
                    <td className="py-2 pr-3">
                      <Pill tone={tierTone as PillTone}>
                        {r.source_license_tier}
                      </Pill>
                    </td>
                    <td className="py-2 pr-3 text-ink-muted">{r.source_currency}</td>
                    <td className="py-2 pr-3 text-right text-ink font-medium">
                      {fmtGbp(r.amount_gbp)}
                    </td>
                    <td className="py-2 pr-3 text-ink-muted">
                      {fmtDate(r.snapshot_date)}
                    </td>
                    <td className="py-2 pr-3">
                      {proxy && proxy !== "none" ? (
                        <span title={`via ${proxy}`} className="text-xs text-accent">
                          ↻ proxy
                        </span>
                      ) : (
                        <span className="text-xs text-ink-faint">direct</span>
                      )}
                    </td>
                    <td className="py-2">
                      {r.source_url ? (
                        <a
                          href={r.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-accent hover:text-accent-strong text-xs underline"
                        >
                          ↗
                        </a>
                      ) : (
                        <span className="text-xs text-ink-faint">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-ink-faint italic">{data.note}</p>
        <div className="flex items-center gap-2 text-xs text-ink-faint">
          <WhyLink href="/methodology/cross-source-pricing" />
          <span>
            Cross-source agreement methodology · sources:{" "}
            {sources.join(", ")}
          </span>
        </div>
      </div>
    </Card>
  );
}

function HistoryBlock({ history }: { history: Everything["history"] }) {
  if (history.length === 0) {
    return (
      <Card>
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-ink">History publication status</h2>
          <p className="text-sm text-ink-muted">
            Legacy historical observations may remain stored for review, but they are
            not published. Authentication does not reopen them.
          </p>
        </div>
      </Card>
    );
  }
  return (
    <Card>
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-ink">
          Past prices
          <span className="ml-2 text-sm font-normal text-ink-muted">
            · a summary of what we&rsquo;ve recorded so far
          </span>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {history.map((h) => (
            <div
              key={h.source}
              className="rounded-lg border border-border-subtle bg-page p-3 space-y-2"
            >
              <div className="flex items-baseline justify-between">
                <span className="font-medium text-ink">{h.source}</span>
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
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <div className="text-ink-faint">observations</div>
                  <div className="text-ink font-medium">{h.summary.observations}</div>
                </div>
                <div>
                  <div className="text-ink-faint">median</div>
                  <div className="text-ink font-medium">{fmtGbp(h.summary.median_gbp)}</div>
                </div>
                <div>
                  <div className="text-ink-faint">range</div>
                  <div className="text-ink font-medium">
                    {fmtGbp(h.summary.min_gbp)} – {fmtGbp(h.summary.max_gbp)}
                  </div>
                </div>
              </div>
              <div className="text-xs text-ink-faint">
                {fmtDate(h.summary.earliest)} → {fmtDate(h.summary.latest)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

// ── Variant-kind helpers (mirror lib/search/variants.ts) ─────────────

type SiblingKind = Everything["siblings"][number]["variant_kind"];

const VARIANT_KIND_LABEL: Record<SiblingKind, string> = {
  self: "this print",
  language: "language",
  "alt-art": "alt art",
  parallel: "parallel",
  "super-parallel": "super parallel",
  promo: "promo",
  unknown: "variant",
};
const VARIANT_KIND_TONE: Record<SiblingKind, PillTone> = {
  self: "emerald",
  language: "blue",
  "alt-art": "amber",
  parallel: "sky",
  "super-parallel": "blue",
  promo: "amber",
  unknown: "neutral",
};
const VARIANT_KIND_DESCRIPTION: Record<SiblingKind, string> = {
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
    "Classification couldn't ground from the available signals. Substrate-honest.",
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
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-ink">Variants</h2>
          <p className="text-sm text-ink-muted">
            No other prints of this card (alt-arts, parallels, super-parallels,
            language variants, or promos) are in the catalog yet. As wholesale
            ingests more upstreams, additional prints surface here automatically.
          </p>
        </div>
      </Card>
    );
  }
  // Group by variant_kind, defensively: any unknown kind buckets to
  // "unknown" so the UI never crashes on a missing dictionary entry.
  // Composer already sorted by VARIANT_KIND_ORDER; we just bucket.
  const KNOWN_KINDS = Object.keys(VARIANT_KIND_LABEL) as SiblingKind[];
  const groups: Array<{ kind: SiblingKind; rows: typeof others }> = [];
  const byKindIndex = new Map<SiblingKind, number>();
  for (const s of others) {
    const kind: SiblingKind = (KNOWN_KINDS.includes(s.variant_kind)
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
      <div className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-ink">
            Variants
            <span className="ml-2 text-sm font-normal text-ink-muted">
              · {others.length} other {others.length === 1 ? "print" : "prints"}
            </span>
          </h2>
          <WhyLink href="/methodology/edition-variants" />
        </div>
        {groups.map(({ kind, rows }) => (
          <div key={kind} className="space-y-2">
            <div className="flex items-baseline gap-2">
              <h3 className="text-sm font-medium text-ink">
                {capitalize(VARIANT_KIND_LABEL[kind] ?? kind)}
                <span className="ml-1 text-xs font-normal text-ink-faint">
                  ({rows.length})
                </span>
              </h3>
              <span className="text-xs text-ink-faint italic">
                {VARIANT_KIND_DESCRIPTION[kind] ?? ""}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {rows.map((s) => (
                <Link
                  key={s.sku}
                  href={`/prices/search?game=${encodeURIComponent(game)}&q=${encodeURIComponent(s.sku)}`}
                  className="block rounded-lg border border-border-subtle bg-page p-3 hover:border-accent transition"
                >
                  <div className="flex items-center justify-between mb-2 gap-2">
                    <Pill tone={VARIANT_KIND_TONE[s.variant_kind] ?? "neutral"}>
                      {VARIANT_KIND_LABEL[s.variant_kind] ?? s.variant_kind}
                    </Pill>
                    {s.has_current_price ? (
                      <span className="text-xs text-ink font-medium">
                        {fmtGbp(s.price_gbp)}
                      </span>
                    ) : (
                      <span className="text-xs text-ink-faint">price withheld</span>
                    )}
                  </div>
                  <div className="text-xs text-ink-muted truncate">{s.name}</div>
                  <div className="flex items-center gap-2 mt-1">
                    {s.set_code && (
                      <span className="text-[10px] uppercase tracking-wider text-ink-faint">
                        {s.set_code}
                      </span>
                    )}
                    {s.rarity && (
                      <span className="text-[10px] text-ink-faint">
                        · {s.rarity}
                      </span>
                    )}
                    {s.effective_language !== "unknown" && (
                      <span className="text-[10px] text-ink-faint">
                        · {s.effective_language === "ja" ? "JP-text" : "EN-text"}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-ink-faint truncate mt-1 font-mono">
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

function MatchesBlock({
  matches,
  summary,
  game,
}: {
  matches: EverythingResponse["data"]["matches"];
  summary: EverythingResponse["data"]["summary"];
  game: string;
}) {
  return (
    <Card>
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-ink">
          {summary.ambiguous ? "Multiple matches — pick one" : "Resolved matches"}
          <span className="ml-2 text-sm font-normal text-ink-muted">
            · {summary.count} {summary.count === 1 ? "match" : "matches"} ·{" "}
            {summary.best_confidence}
          </span>
        </h2>
        <div className="space-y-2">
          {matches.slice(0, 20).map((m) => (
            <Link
              key={m.sku}
              // Preserve the current game token — same reason as SiblingsBlock.
              href={`/prices/search?game=${encodeURIComponent(game)}&q=${encodeURIComponent(m.sku)}`}
              className="flex items-center gap-3 rounded-lg border border-border-subtle bg-page p-3 hover:border-accent transition"
            >
              {m.image_url && (
                <Image
                  src={m.image_url}
                  alt={m.name}
                  width={36}
                  height={50}
                  className="rounded shrink-0"
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm text-ink truncate">{m.name}</div>
                <div className="text-xs text-ink-faint font-mono">{m.sku}</div>
              </div>
              <Pill tone={m.confidence === "exact" ? "emerald" : "neutral"}>
                {m.confidence}
              </Pill>
            </Link>
          ))}
        </div>
        <p className="text-xs text-ink-faint italic">
          {summary.ambiguous
            ? "Your input matched cards in multiple sets. Click the one you mean."
            : "Click a match to open its full detail."}
        </p>
      </div>
    </Card>
  );
}

// ── Page ────────────────────────────────────────────────────────────

export default async function PriceSearchPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const game = (sp.game ?? "").trim();
  const q = (sp.q ?? "").trim();
  const lang = (sp.lang ?? "").trim().toLowerCase();
  const games = await fetchGames().catch(() => []);

  // Build the origin from the incoming request so server-to-server
  // fetch hits the local route (works on both dev and Vercel prod).
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "cambridgetcg.com";
  const origin = `${proto}://${host}`;

  const result =
    game && q ? await fetchEverything(origin, game, q, lang) : null;

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

  return (
    <main className="container mx-auto px-4 py-8 space-y-6">
      <PageHeader
        title="Structural card search"
        description="Search by card number across supported games. Structural identity, source status, and known variants are visible; legacy prices, images, and transaction history are withheld."
      />

      <Card>
        <CardPriceSearchForm
          games={games}
          game={game}
          query={q}
          language={lang}
          autoFocus
          browseHref="/prices#browse-by-game"
        />
      </Card>

      {/* Plain-language decoder — additive clarity for newcomers. Native
          <details>, no JS, closed by default so it never clutters. The
          substrate-honest labels below stay exactly as they are; this just
          says what they mean in plain words. (Yu 2026-06-04: make everything
          easy to understand.) */}
      <details className="rounded-lg border border-border-subtle bg-surface-subtle px-4 py-3 text-sm">
        <summary className="cursor-pointer text-ink-muted hover:text-ink select-none">
          New here? What do these results mean?
        </summary>
        <div className="mt-3 space-y-2 text-ink-muted">
          <p>
            <span className="text-ink">Price publication status</span> — legacy
            wholesale values are withheld until field-level source rights are recorded.
          </p>
          <p>
            <span className="text-ink">Source status</span> names known lineage
            and whether a source is blocked, planned, or reviewed. It is not a
            promise that the source&apos;s numeric values are published.
          </p>
          <p>
            <span className="text-ink">History</span> remains unavailable on this
            surface. A requested date does not reconstruct a historical price.
          </p>
          <p>
            <span className="text-ink">Variants</span> are other versions of
            the same card — different languages, alternate art, foils, promos.
            Same card, different print.
          </p>
        </div>
      </details>

      {/* No input yet — landing state */}
      {(!game || !q) && (
        <EmptyState
          title="Start by entering a game and card number"
          description="Examples: game=op + q=OP01-001 · game=pkm + q=001 · game=mtg + q=LTR-001"
        />
      )}

      {/* Input but no result */}
      {game && q && !result && (
        <ErrorAlert
          description="The wholesale API didn't return a response. Try again, or browse /prices to see what's covered."
        />
      )}

      {/* No matches */}
      {result && result.data.summary.count === 0 && (
        <EmptyState
          title={`No cards matched "${q}" in game ${game}`}
          description="Double-check the card number format. Examples: OP01-001 (One Piece), SV01-001 (Pokémon), LTR-001 (MTG). Or browse /prices for a list of covered games."
        />
      )}

      {/* Matches but no fold — disambiguation */}
      {result &&
        result.data.summary.count > 0 &&
        !result.data.everything && (
          <MatchesBlock
            matches={result.data.matches}
            summary={result.data.summary}
            game={game}
          />
        )}

      {/* Folded — render everything */}
      {result && result.data.everything && (
        <>
          {/* Card identity header */}
          <Card>
            <div className="flex flex-col sm:flex-row gap-4 items-start">
              {result.data.everything.card.image_url && (
                <Image
                  src={result.data.everything.card.image_url}
                  alt={result.data.everything.card.name}
                  width={120}
                  height={168}
                  className="rounded shrink-0"
                />
              )}
              <div className="flex-1 space-y-2">
                <div>
                  <h2 className="text-2xl font-bold text-ink">
                    {result.data.everything.card.name}
                  </h2>
                  {result.data.everything.card.name_en &&
                    result.data.everything.card.name_en !==
                      result.data.everything.card.name && (
                      <div className="text-sm text-ink-muted">
                        EN: {result.data.everything.card.name_en}
                      </div>
                    )}
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="text-ink-muted">
                    {result.data.everything.card.set_code} ·{" "}
                    {result.data.everything.card.card_number}
                  </span>
                  {result.data.everything.card.rarity && (
                    <Pill tone="neutral">
                      {result.data.everything.card.rarity}
                    </Pill>
                  )}
                  {result.data.everything.card.lang && (
                    <Pill tone="blue">{result.data.everything.card.lang}</Pill>
                  )}
                  {result.data.everything.card.variant && (
                    <Pill tone="amber">
                      {result.data.everything.card.variant}
                    </Pill>
                  )}
                </div>
                <div className="font-mono text-[10px] text-ink-faint break-all">
                  {result.data.everything.card.sku}
                </div>
                <ReferencePriceSummary
                  reference={result.data.everything.reference_price}
                />
              </div>
              <div className="text-right text-xs text-ink-faint space-y-1">
                <Provenance
                  kind="cached"
                  at={result._meta.retrieved_at}
                  ttl="5m"
                />
                <div>
                  {result.data.everything.prices_today.snapshot_date &&
                    `snapshot ${fmtDate(result.data.everything.prices_today.snapshot_date)}`}
                </div>
              </div>
            </div>
          </Card>

          <ReferenceComparison
            reference={result.data.everything.reference_price}
            rows={result.data.everything.prices_today.rows}
          />

          <PricesToday
            data={result.data.everything.prices_today}
            upstreamProxyByIndex={upstreamProxyByIndex}
            sources={result._meta.sources}
          />

          <HistoryBlock history={result.data.everything.history} />

          <SiblingsBlock
            siblings={result.data.everything.siblings}
            game={game}
          />
        </>
      )}

      <Card>
        <p className="text-xs text-ink-faint">
          This page is the HTML face of <code>/api/v1/search/everything</code>.
          Partners and agents can call the JSON endpoint for the same structural
          response. Read its aggregate and per-source rights fields; public access
          is not a blanket CC0 grant.
        </p>
      </Card>
    </main>
  );
}
