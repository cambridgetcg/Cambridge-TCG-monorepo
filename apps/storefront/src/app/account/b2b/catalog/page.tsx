/**
 * /account/b2b/catalog — wholesale-priced catalog.
 *
 * Phase 2.1 of the wholesale consolidation. Same cards as the retail
 * surface, priced through the wholesale channel via the Falcon's
 * dual-key path (WHOLESALE_B2B_API_KEY).
 *
 * URL params:
 *   ?game=op       — filter to a game (slug or code)
 *   ?set=OP01      — filter to a set within the game
 *   ?q=zoro        — full-text search across card name + number
 *   ?sort=...      — card_number | price_asc | price_desc | name_asc
 *   ?stock=true    — only show in-stock cards
 *   ?page=N        — 1-indexed pagination
 *
 * Stock display: numeric (B2B buyers care about quantities for
 * resale planning). Retail catalog shows coarse indicators; this
 * page deliberately diverges.
 *
 * Auth: proxy.ts ensures role∈{wholesale,admin}; /account/layout.tsx
 * ensures auth. This page trusts both gates.
 *
 * Substrate-honesty note: if WHOLESALE_B2B_API_KEY is unset (operator
 * hasn't provisioned the B2B key yet), the Falcon falls back to the
 * retail key and the prices column will render retail values. The
 * response's `channel` field still says 'cambridgetcg' in that case;
 * we surface the discrepancy via a banner instead of pretending the
 * prices are wholesale.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { fetchPrices, fetchGames, fetchSets } from "@/lib/wholesale/client";
import { Card, PageHeader, audienceMetadata } from "@/lib/ui";
import { formatPrice } from "@/lib/format";
import { AddToB2BCart } from "../cart/_client";

export const metadata: Metadata = {
  title: "Wholesale catalog — Cambridge TCG",
  description: "Browse the full Cambridge TCG catalog at your wholesale account's prices.",
  other: audienceMetadata("consumer", ["wholesale", "b2b", "catalog"]),
};

const PAGE_SIZE = 60;

const SORT_OPTIONS = [
  { value: "card_number", label: "Card #" },
  { value: "name_asc", label: "Name A→Z" },
  { value: "price_asc", label: "Price ↑" },
  { value: "price_desc", label: "Price ↓" },
] as const;

type SortValue = (typeof SORT_OPTIONS)[number]["value"];

function asSort(raw: string | undefined): SortValue {
  const valid = SORT_OPTIONS.map((o) => o.value) as readonly string[];
  return (valid.includes(raw ?? "") ? raw : "card_number") as SortValue;
}

function buildHref(
  base: string,
  current: Record<string, string | undefined>,
  overrides: Record<string, string | undefined>,
): string {
  const merged = { ...current, ...overrides };
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) {
    if (v && v.length > 0) qs.set(k, v);
  }
  const s = qs.toString();
  return s ? `${base}?${s}` : base;
}

export default async function B2BCatalogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const game = sp.game?.trim() || undefined;
  const set = sp.set?.trim() || undefined;
  const q = sp.q?.trim() || undefined;
  const sort = asSort(sp.sort);
  const inStock = sp.stock === "true";
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const [pricesResp, games] = await Promise.all([
    fetchPrices({
      channel: "wholesale",
      game,
      set,
      q,
      sort,
      in_stock: inStock,
      limit: PAGE_SIZE,
      offset,
    }),
    fetchGames(),
  ]);

  const sets = game ? await fetchSets(game) : [];

  const totalPages = Math.max(1, Math.ceil((pricesResp.total ?? 0) / PAGE_SIZE));
  const channelMatched = pricesResp.channel === "wholesale";
  const currentParams = { game, set, q, sort: sort === "card_number" ? undefined : sort, stock: inStock ? "true" : undefined };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Wholesale catalog"
        description={`${pricesResp.total ?? 0} cards available at your account's wholesale prices.`}
      />

      {!channelMatched && (
        <Card>
          <div className="text-sm text-accent">
            <strong className="font-semibold">Setup pending:</strong> the
            wholesale API key isn&rsquo;t provisioned yet
            (<code className="rounded bg-surface-subtle px-1 text-xs">WHOLESALE_B2B_API_KEY</code>),
            so prices below are showing retail values until that env var lands.
            See the Phase 2 commit body for the operator recipe.
          </div>
        </Card>
      )}

      <Card>
        <form
          action="/account/b2b/catalog"
          method="get"
          className="flex flex-wrap items-end gap-3"
        >
          <div className="flex flex-col gap-1 min-w-[160px]">
            <label className="text-xs uppercase tracking-wider text-ink-faint">Game</label>
            <select
              name="game"
              defaultValue={game ?? ""}
              className="rounded border border-border-subtle bg-surface px-2 py-1 text-sm"
            >
              <option value="">All games</option>
              {games.map((g) => (
                <option key={g.code} value={g.slug || g.code}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
          {game && (
            <div className="flex flex-col gap-1 min-w-[160px]">
              <label className="text-xs uppercase tracking-wider text-ink-faint">Set</label>
              <select
                name="set"
                defaultValue={set ?? ""}
                className="rounded border border-border-subtle bg-surface px-2 py-1 text-sm"
              >
                <option value="">All sets</option>
                {sets.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.code} — {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="flex flex-col gap-1 grow min-w-[180px]">
            <label className="text-xs uppercase tracking-wider text-ink-faint">Search</label>
            <input
              type="text"
              name="q"
              defaultValue={q ?? ""}
              placeholder="card name or number"
              className="rounded border border-border-subtle bg-surface px-2 py-1 text-sm"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-ink-muted">
            <input type="checkbox" name="stock" value="true" defaultChecked={inStock} />
            In stock only
          </label>
          <button
            type="submit"
            className="rounded bg-ink px-4 py-1.5 text-sm font-medium text-page hover:opacity-90"
          >
            Apply
          </button>
          {(game || set || q || inStock) && (
            <Link
              href="/account/b2b/catalog"
              className="text-sm text-ink-muted hover:text-ink"
            >
              Clear
            </Link>
          )}
        </form>
      </Card>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="uppercase tracking-wider text-ink-faint">Sort:</span>
        {SORT_OPTIONS.map((opt) => {
          const active = sort === opt.value;
          const href = buildHref("/account/b2b/catalog", currentParams, {
            sort: opt.value === "card_number" ? undefined : opt.value,
            page: undefined,
          });
          return (
            <Link
              key={opt.value}
              href={href}
              className={
                "rounded-full px-3 py-1 font-medium " +
                (active
                  ? "bg-ok/20 text-ok ring-1 ring-ok/40"
                  : "bg-surface-subtle text-ink-muted hover:text-ink")
              }
            >
              {opt.label}
            </Link>
          );
        })}
      </div>

      <div className="overflow-x-auto rounded-lg border border-border-subtle">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-subtle text-xs uppercase tracking-wider text-ink-muted">
            <tr>
              <th className="px-3 py-3">Card #</th>
              <th className="px-3 py-3">Name</th>
              <th className="px-3 py-3">Set</th>
              <th className="px-3 py-3">Rarity</th>
              <th className="px-3 py-3 text-right">Stock</th>
              <th className="px-3 py-3 text-right">Wholesale</th>
              <th className="px-3 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {pricesResp.items.map((card) => {
              const wholesalePrice = card.channel_price ?? card.price_gbp;
              return (
                <tr key={card.sku} className="bg-surface hover:bg-surface-subtle">
                  <td className="px-3 py-3 font-mono text-xs text-ink-muted">
                    <Link
                      href={`/account/b2b/cards/${encodeURIComponent(card.sku)}`}
                      className="hover:text-accent"
                    >
                      {card.card_number}
                    </Link>
                  </td>
                  <td className="px-3 py-3">
                    <Link
                      href={`/account/b2b/cards/${encodeURIComponent(card.sku)}`}
                      className="text-ink hover:text-accent"
                    >
                      {card.name_en || card.name || card.card_number}
                    </Link>
                  </td>
                  <td className="px-3 py-3 text-xs text-ink-muted">{card.set_code ?? "—"}</td>
                  <td className="px-3 py-3 text-xs text-ink-muted">{card.rarity ?? "—"}</td>
                  <td className="px-3 py-3 text-right font-mono text-xs">
                    <span className={card.stock > 0 ? "text-ok" : "text-ink-faint"}>
                      {card.stock}
                    </span>
                    {card.pending_stock > 0 && (
                      <span className="text-accent"> +{card.pending_stock}</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right font-medium text-ink">
                    {wholesalePrice === null ? "Unavailable" : formatPrice(wholesalePrice)}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <AddToB2BCart sku={card.sku} compact disabled={card.stock <= 0 || wholesalePrice === null} />
                  </td>
                </tr>
              );
            })}
            {pricesResp.items.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-ink-faint">
                  No cards match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <div className="text-ink-faint">
            Page {page} of {totalPages} · {pricesResp.total ?? 0} cards
          </div>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={buildHref("/account/b2b/catalog", currentParams, {
                  page: page === 2 ? undefined : String(page - 1),
                })}
                className="rounded border border-border-subtle px-3 py-1 hover:border-accent hover:text-accent"
              >
                ← Prev
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={buildHref("/account/b2b/catalog", currentParams, {
                  page: String(page + 1),
                })}
                className="rounded border border-border-subtle px-3 py-1 hover:border-accent hover:text-accent"
              >
                Next →
              </Link>
            )}
          </div>
        </div>
      )}

      <p className="text-xs text-ink-faint">
        Stock shows on-hand UK quantity; <span className="text-accent">+N</span> indicates
        pending stock (ordered, not yet received). Card numbers link to the per-card detail page
        with the same wholesale pricing.
      </p>
    </div>
  );
}
