"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { formatPrice } from "@/lib/format";
import ConfirmModal from "@/components/ui/ConfirmModal";
import type { ValuatedCard, PortfolioSummary, PortfolioSnapshot, ListingAction } from "@/lib/portfolio/types";
import PortfolioAnalytics from "@/components/portfolio/PortfolioAnalytics";
import MoversPanel from "@/components/portfolio/MoversPanel";
import ValueChart from "@/components/portfolio/ValueChart";
import CsvImport, { type ParsedRow as CsvRow } from "@/components/portfolio/CsvImport";

type SortKey = "value" | "pnl" | "recent";

export default function PortfolioPage() {
  const router = useRouter();
  const [cards, setCards] = useState<(ValuatedCard & { listing_actions?: ListingAction[] })[]>([]);
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [snapshots, setSnapshots] = useState<PortfolioSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<SortKey>("value");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ quantity: 1, acquisitionPrice: "", condition: "NM", notes: "" });
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [trends, setTrends] = useState<Record<string, { d7: number | null; d30: number | null }>>({});
  const [showCsv, setShowCsv] = useState(false);
  const [showcaseIds, setShowcaseIds] = useState<Set<string>>(new Set());
  const [profile, setProfile] = useState<{ username: string | null; is_public: boolean } | null>(null);
  const [copiedShareLink, setCopiedShareLink] = useState(false);

  async function refreshShowcase() {
    try {
      const res = await fetch("/api/social/showcase");
      if (res.ok) {
        const d = await res.json();
        const ids = new Set<string>(
          (d.showcase ?? []).map((c: { portfolio_card_id: string }) => c.portfolio_card_id),
        );
        setShowcaseIds(ids);
      }
    } catch { /* ignore */ }
  }

  async function toggleShowcase(portfolioCardId: string, currentlyInShowcase: boolean) {
    // Optimistic
    setShowcaseIds((prev) => {
      const next = new Set(prev);
      if (currentlyInShowcase) next.delete(portfolioCardId);
      else next.add(portfolioCardId);
      return next;
    });
    try {
      const res = await fetch("/api/social/showcase", {
        method: currentlyInShowcase ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ portfolioCardId }),
      });
      if (!res.ok) {
        // Rollback on failure
        setShowcaseIds((prev) => {
          const next = new Set(prev);
          if (currentlyInShowcase) next.add(portfolioCardId);
          else next.delete(portfolioCardId);
          return next;
        });
      }
    } catch {
      // Rollback on error too
      refreshShowcase();
    }
  }

  const load = useCallback(() => {
    Promise.all([
      fetch("/api/portfolio").then((r) => r.json()),
      fetch("/api/portfolio/history?days=30").then((r) => r.json()),
      fetch("/api/portfolio/trends").then((r) => r.json()).catch(() => ({ trends: {} })),
      fetch("/api/social/showcase").then((r) => (r.ok ? r.json() : { showcase: [] })).catch(() => ({ showcase: [] })),
      fetch("/api/social/profile").then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([portfolio, history, trendsData, showcaseData, profileData]) => {
      setCards(portfolio.cards || []);
      setSummary(portfolio.summary || null);
      setSnapshots(history.snapshots || []);
      setTrends(trendsData.trends || {});
      const ids = new Set<string>(
        (showcaseData.showcase ?? []).map((c: { portfolio_card_id: string }) => c.portfolio_card_id),
      );
      setShowcaseIds(ids);
      if (profileData?.profile) {
        setProfile({
          username: profileData.profile.username ?? null,
          is_public: Boolean(profileData.profile.is_public),
        });
      }
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((data) => {
        if (!data?.user?.email) {
          router.push("/login");
          return;
        }
        load();
      });
  }, [router, load]);

  const sorted = [...cards].sort((a, b) => {
    if (sort === "value") return b.current_value - a.current_value;
    if (sort === "pnl") return (b.pnl ?? 0) - (a.pnl ?? 0);
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  function startEdit(card: ValuatedCard) {
    setEditingId(card.id);
    setEditForm({
      quantity: card.quantity,
      acquisitionPrice: card.acquisition_price ?? "",
      condition: card.condition,
      notes: card.notes ?? "",
    });
  }

  async function saveEdit(id: string) {
    setSaving(true);
    await fetch(`/api/portfolio/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quantity: editForm.quantity,
        acquisitionPrice: editForm.acquisitionPrice || null,
        condition: editForm.condition,
        notes: editForm.notes || null,
      }),
    });
    setEditingId(null);
    setSaving(false);
    load();
  }

  function removeCard(id: string) {
    setPendingAction(() => async () => {
      await fetch(`/api/portfolio/${id}`, { method: "DELETE" });
      load();
    });
    setConfirmOpen(true);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-neutral-500">Loading...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Portfolio</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShowCsv(true)}
            className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-white font-medium rounded-lg transition text-sm"
          >
            Import CSV
          </button>
          <Link
            href="/account/portfolio/add"
            className="px-4 py-2 bg-amber-500 text-black font-semibold rounded-lg hover:bg-amber-400 transition text-sm"
          >
            Add Cards
          </Link>
        </div>
      </div>

      {/* Summary Bar */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="bg-neutral-900 rounded-xl p-4">
            <p className="text-xs text-neutral-500 uppercase tracking-wide">Total Value</p>
            <p className="text-2xl font-bold text-amber-400">{formatPrice(summary.total_value)}</p>
          </div>
          <div className="bg-neutral-900 rounded-xl p-4">
            <p className="text-xs text-neutral-500 uppercase tracking-wide">Total Cost</p>
            <p className="text-lg font-semibold text-neutral-300">
              {summary.total_cost != null ? formatPrice(summary.total_cost) : "—"}
            </p>
          </div>
          <div className="bg-neutral-900 rounded-xl p-4">
            <p className="text-xs text-neutral-500 uppercase tracking-wide">P&L</p>
            {summary.total_pnl != null ? (
              <p className={`text-lg font-semibold ${summary.total_pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {summary.total_pnl >= 0 ? "+" : ""}
                {formatPrice(summary.total_pnl)}
                {summary.total_pnl_percent != null && (
                  <span className="text-sm ml-1">
                    ({summary.total_pnl_percent >= 0 ? "+" : ""}
                    {summary.total_pnl_percent.toFixed(1)}%)
                  </span>
                )}
              </p>
            ) : (
              <p className="text-lg font-semibold text-neutral-500">—</p>
            )}
          </div>
          <div className="bg-neutral-900 rounded-xl p-4">
            <p className="text-xs text-neutral-500 uppercase tracking-wide">Cards</p>
            <p className="text-lg font-semibold text-neutral-300">
              {summary.card_count}
              <span className="text-sm text-neutral-500 ml-1">({summary.unique_cards} unique)</span>
            </p>
          </div>
        </div>
      )}

      {/* Value History Sparkline */}
      {/* Interactive value chart (7d / 30d / 90d toggle) */}
      <div className="mb-6">
        <ValueChart initial={snapshots} />
      </div>

      {/* Movers over the last 7 days */}
      {cards.length > 0 && (
        <div className="mb-6">
          <MoversPanel cards={cards} trends={trends} window={7} />
        </div>
      )}

      {/* Public showcase banner */}
      {profile && cards.length > 0 && (
        <div className="mb-6 bg-gradient-to-r from-amber-500/10 via-neutral-900 to-fuchsia-500/10 border border-amber-500/20 rounded-xl px-5 py-3 flex items-center justify-between flex-wrap gap-3">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-amber-400 font-bold">
              Your showcase · {showcaseIds.size} featured
            </p>
            {profile.username && profile.is_public ? (
              <p className="text-sm text-neutral-300 mt-0.5 truncate">
                Public at{" "}
                <Link href={`/u/${profile.username}`} className="text-amber-400 underline hover:text-amber-300">
                  /u/{profile.username}
                </Link>
              </p>
            ) : !profile.username ? (
              <p className="text-xs text-neutral-500 mt-0.5">
                Pick a username in{" "}
                <Link href="/account/profile" className="text-amber-400 hover:text-amber-300 underline">
                  your profile
                </Link>{" "}
                to get a shareable URL.
              </p>
            ) : (
              <p className="text-xs text-neutral-500 mt-0.5">
                Profile is private.{" "}
                <Link href="/account/profile" className="text-amber-400 hover:text-amber-300 underline">
                  Make it public
                </Link>{" "}
                to share /u/{profile.username}.
              </p>
            )}
          </div>
          <div className="flex gap-2">
            {profile.username && profile.is_public && (
              <button
                onClick={() => {
                  const url = `${window.location.origin}/u/${profile.username}`;
                  navigator.clipboard.writeText(url).then(
                    () => { setCopiedShareLink(true); setTimeout(() => setCopiedShareLink(false), 2000); },
                    () => {},
                  );
                }}
                className="text-xs bg-amber-500 hover:bg-amber-400 text-black font-bold rounded px-3 py-1.5 transition-colors whitespace-nowrap"
              >
                {copiedShareLink ? "Copied!" : "Copy share link"}
              </button>
            )}
            <Link
              href={profile.username ? `/u/${profile.username}` : "/account/profile"}
              className="text-xs bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded px-3 py-1.5 transition-colors whitespace-nowrap"
            >
              Preview
            </Link>
          </div>
        </div>
      )}

      {/* Analytics breakdown — sets / rarity / condition / concentration */}
      {cards.length > 0 && summary && (
        <div className="mb-6">
          <PortfolioAnalytics cards={cards} summary={summary} />
        </div>
      )}

      {/* Sort Controls */}
      {cards.length > 0 && (
        <div className="flex gap-2 mb-4">
          <span className="text-sm text-neutral-500 py-1">Sort:</span>
          {([["value", "Value"], ["pnl", "P&L"], ["recent", "Recent"]] as [SortKey, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSort(key)}
              className={`px-3 py-1 rounded-lg text-sm font-medium transition ${
                sort === key
                  ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                  : "text-neutral-400 hover:text-white hover:bg-neutral-800"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Card Grid */}
      {cards.length === 0 ? (
        <div className="bg-neutral-900 rounded-xl p-12 text-center">
          <p className="text-neutral-400 mb-4">Your portfolio is empty. Add cards to track their value.</p>
          <Link
            href="/account/portfolio/add"
            className="inline-block px-5 py-2.5 bg-amber-500 text-black font-semibold rounded-lg hover:bg-amber-400 transition text-sm"
          >
            Add Cards
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {sorted.map((card) => (
            <div key={card.id} className="bg-neutral-900 rounded-xl overflow-hidden flex flex-col">
              {/* Image */}
              <div className="relative aspect-[5/7] bg-neutral-800">
                {card.image_url ? (
                  <Image
                    src={card.image_url}
                    alt={card.card_name || "Card"}
                    fill
                    className="object-contain"
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-neutral-600 text-sm">
                    No Image
                  </div>
                )}
                {/* Showcase toggle — amber star when featured */}
                {(() => {
                  const inShowcase = showcaseIds.has(card.id);
                  return (
                    <button
                      onClick={() => toggleShowcase(card.id, inShowcase)}
                      className={`absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center transition-all ${
                        inShowcase
                          ? "bg-amber-500 text-black shadow-lg shadow-amber-500/30 hover:bg-amber-400"
                          : "bg-black/50 backdrop-blur text-white/70 hover:text-amber-400 hover:bg-black/70"
                      }`}
                      title={inShowcase ? "Remove from public showcase" : "Feature in public showcase"}
                      aria-label={inShowcase ? "Remove from showcase" : "Add to showcase"}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill={inShowcase ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l2.4 5.7 6.1.5-4.6 4 1.4 6-5.3-3.2-5.3 3.2 1.4-6-4.6-4 6.1-.5z" />
                      </svg>
                    </button>
                  );
                })()}
              </div>

              <div className="p-3 flex-1 flex flex-col">
                {/* Name & Badges */}
                <h3 className="text-sm font-semibold text-white truncate">{card.card_name || card.sku}</h3>
                <p className="text-xs text-neutral-500 truncate mb-1.5">
                  {card.set_name || card.set_code}
                  {card.card_number ? ` #${card.card_number}` : ""}
                </p>
                <div className="flex gap-1.5 mb-2">
                  {card.rarity && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 font-medium uppercase">
                      {card.rarity}
                    </span>
                  )}
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400 font-medium">
                    {card.condition}
                  </span>
                </div>

                {/* Value */}
                <div className="text-sm mb-1">
                  <span className="text-neutral-500">{card.quantity} x {card.market_price != null ? formatPrice(card.market_price) : "—"}</span>
                  <span className="text-white font-semibold ml-1">= {formatPrice(card.current_value)}</span>
                </div>

                {/* Price trend — only rendered if we have history data */}
                {(() => {
                  const t = trends[card.sku];
                  if (!t || (t.d7 == null && t.d30 == null)) return null;
                  const chip = (label: string, val: number | null) => {
                    if (val == null) return null;
                    const positive = val >= 0;
                    return (
                      <span
                        key={label}
                        className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                          positive ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"
                        }`}
                        title={`${label === "7d" ? "Last 7 days" : "Last 30 days"} spot change`}
                      >
                        {label} {positive ? "+" : ""}{val.toFixed(1)}%
                      </span>
                    );
                  };
                  return (
                    <div className="flex items-center gap-1 mb-1">
                      {chip("7d", t.d7)}
                      {chip("30d", t.d30)}
                    </div>
                  );
                })()}

                {/* P&L */}
                <div className="text-xs mb-3">
                  {card.total_cost != null ? (
                    <>
                      <span className="text-neutral-500">Cost {formatPrice(card.total_cost)}</span>
                      {card.pnl != null && (
                        <span className={`ml-1.5 font-medium ${card.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {card.pnl >= 0 ? "+" : ""}{formatPrice(card.pnl)}
                          {card.pnl_percent != null && (
                            <span className="ml-0.5">({card.pnl_percent >= 0 ? "+" : ""}{card.pnl_percent.toFixed(1)}%)</span>
                          )}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-neutral-600">No cost basis</span>
                  )}
                </div>

                {/* Listing Actions */}
                {card.listing_actions && card.listing_actions.length > 0 && (
                  <div className="flex gap-1.5 mb-2">
                    {card.listing_actions.map((action) => {
                      let href = "#";
                      if (action.type === "market_ask") href = `/market/${card.sku}?side=ask`;
                      else if (action.type === "auction") href = `/auctions/sell?sku=${card.sku}`;
                      else if (action.type === "tradein") href = `/trade-in?sku=${card.sku}&name=${encodeURIComponent(card.card_name || "")}`;

                      return (
                        <Link
                          key={action.type}
                          href={href}
                          className="flex-1 text-center text-[10px] px-1.5 py-1.5 rounded-lg bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white transition font-medium"
                        >
                          {action.label}
                        </Link>
                      );
                    })}
                  </div>
                )}

                {/* Quick actions fallback (when no listing_actions) */}
                {(!card.listing_actions || card.listing_actions.length === 0) && (
                  <div className="flex gap-1.5 mb-2">
                    <Link
                      href={`/market/${card.sku}?side=ask`}
                      className="flex-1 text-center text-[10px] px-1.5 py-1.5 rounded-lg bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white transition font-medium"
                    >
                      Sell
                    </Link>
                    <Link
                      href={`/auctions/sell?sku=${card.sku}`}
                      className="flex-1 text-center text-[10px] px-1.5 py-1.5 rounded-lg bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white transition font-medium"
                    >
                      Auction
                    </Link>
                    <Link
                      href={`/trade-in?sku=${card.sku}&name=${encodeURIComponent(card.card_name || "")}`}
                      className="flex-1 text-center text-[10px] px-1.5 py-1.5 rounded-lg bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white transition font-medium"
                    >
                      Trade In
                    </Link>
                  </div>
                )}

                {/* Edit / Remove */}
                <div className="mt-auto flex gap-1.5">
                  <button
                    onClick={() => (editingId === card.id ? setEditingId(null) : startEdit(card))}
                    className="flex-1 text-xs py-1.5 rounded-lg border border-neutral-800 text-neutral-400 hover:text-white hover:border-neutral-600 transition"
                  >
                    {editingId === card.id ? "Cancel" : "Edit"}
                  </button>
                  <button
                    onClick={() => removeCard(card.id)}
                    className="text-xs px-3 py-1.5 rounded-lg border border-neutral-800 text-neutral-500 hover:text-red-400 hover:border-red-500/30 transition"
                  >
                    Remove
                  </button>
                </div>

                {/* Inline Edit Form */}
                {editingId === card.id && (
                  <div className="mt-3 pt-3 border-t border-neutral-800 space-y-2">
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <label className="text-[10px] text-neutral-500 block mb-0.5">Qty</label>
                        <input
                          type="number"
                          min={1}
                          value={editForm.quantity}
                          onChange={(e) => setEditForm({ ...editForm, quantity: parseInt(e.target.value) || 1 })}
                          className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-sm text-white"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="text-[10px] text-neutral-500 block mb-0.5">Cost</label>
                        <input
                          type="text"
                          value={editForm.acquisitionPrice}
                          onChange={(e) => setEditForm({ ...editForm, acquisitionPrice: e.target.value })}
                          placeholder="0.00"
                          className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-sm text-white"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] text-neutral-500 block mb-0.5">Condition</label>
                      <select
                        value={editForm.condition}
                        onChange={(e) => setEditForm({ ...editForm, condition: e.target.value })}
                        className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-sm text-white"
                      >
                        <option value="NM">Near Mint</option>
                        <option value="LP">Lightly Played</option>
                        <option value="MP">Moderately Played</option>
                        <option value="HP">Heavily Played</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] text-neutral-500 block mb-0.5">Notes</label>
                      <input
                        type="text"
                        value={editForm.notes}
                        onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                        placeholder="Optional notes"
                        className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-sm text-white"
                      />
                    </div>
                    <button
                      onClick={() => saveEdit(card.id)}
                      disabled={saving}
                      className="w-full py-1.5 bg-amber-500 text-black font-semibold rounded-lg text-sm hover:bg-amber-400 transition disabled:opacity-50"
                    >
                      {saving ? "Saving..." : "Save Changes"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmModal
        open={confirmOpen}
        title="Remove Card"
        message="Remove this card from your portfolio?"
        confirmLabel="Remove"
        variant="danger"
        onConfirm={() => { pendingAction?.(); setConfirmOpen(false); setPendingAction(null); }}
        onCancel={() => { setConfirmOpen(false); setPendingAction(null); }}
      />

      {showCsv && (
        <CsvImport
          onClose={() => setShowCsv(false)}
          onImport={async (rows: CsvRow[]) => {
            // Resolve each SKU against the catalog, then POST per row.
            const failed: string[] = [];
            let added = 0;

            // Resolve all in parallel — the wholesale API is fast.
            const resolved = await Promise.all(
              rows.map(async (r) => {
                try {
                  const res = await fetch(
                    `/api/portfolio/search?q=${encodeURIComponent(r.sku)}`,
                  );
                  if (!res.ok) return { row: r, card: null };
                  const d = await res.json();
                  const results = (d.results as Array<{
                    sku: string; card_name: string; card_number: string;
                    set_code: string; set_name: string; image_url: string | null;
                    rarity: string | null;
                  }>) ?? [];
                  const exact = results.find((c) => c.sku.toUpperCase() === r.sku);
                  return { row: r, card: exact ?? results[0] ?? null };
                } catch {
                  return { row: r, card: null };
                }
              }),
            );

            // POST each resolved card to /api/portfolio (addCard upserts).
            for (const { row, card } of resolved) {
              if (!card) { failed.push(row.sku); continue; }
              try {
                const res = await fetch("/api/portfolio", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    sku: card.sku,
                    cardName: card.card_name,
                    cardNumber: card.card_number,
                    setCode: card.set_code,
                    setName: card.set_name,
                    imageUrl: card.image_url,
                    rarity: card.rarity,
                    condition: row.condition,
                    quantity: row.quantity,
                    acquisitionPrice: row.acquisitionPrice,
                    acquiredAt: row.acquiredAt,
                    notes: row.notes,
                  }),
                });
                if (res.ok) added += 1;
                else failed.push(row.sku);
              } catch {
                failed.push(row.sku);
              }
            }

            // Refresh the portfolio once everything's been posted.
            load();
            return { added, failed };
          }}
        />
      )}
    </div>
  );
}
