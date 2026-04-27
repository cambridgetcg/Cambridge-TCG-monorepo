"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import WishlistCsvImport, { type ParsedWishRow } from "@/components/wishlist/CsvImport";

interface WishlistItem {
  id: string;
  sku: string | null;
  card_name: string;
  card_number: string | null;
  set_code: string | null;
  set_name: string | null;
  image_url: string | null;
  max_price: string | null;
  condition_min: string;
  notes: string | null;
  fulfilled: boolean;
  created_at: string;
  last_matched_at: string | null;
  availability?: {
    p2p_price: number | null;
    p2p_condition: string | null;
    p2p_qty: number;
    p2p_order_id: string | null;
    store_price: number | null;
    store_stock: number;
    matched: boolean;
    best_price: number | null;
    best_source: "p2p" | "wholesale" | null;
  } | null;
}

type Filter = "pending" | "matched" | "fulfilled" | "all";

function gbp(n: number | null | undefined): string {
  if (n == null) return "—";
  return `£${Number(n).toFixed(2)}`;
}

export default function WishlistPage() {
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("pending");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [showCsv, setShowCsv] = useState(false);
  const [suggestions, setSuggestions] = useState<Record<string, { value: number; explanation: string } | null>>({});
  const [profile, setProfile] = useState<{ username: string | null; is_public: boolean } | null>(null);
  const [copied, setCopied] = useState(false);

  async function fetchSuggestion(sku: string) {
    if (suggestions[sku] !== undefined) return;
    try {
      const res = await fetch(`/api/social/wishlist/suggest?sku=${encodeURIComponent(sku)}`);
      if (!res.ok) { setSuggestions((p) => ({ ...p, [sku]: null })); return; }
      const d = await res.json();
      setSuggestions((p) => ({
        ...p,
        [sku]: d.suggestion != null ? { value: d.suggestion, explanation: d.explanation ?? "" } : null,
      }));
    } catch {
      setSuggestions((p) => ({ ...p, [sku]: null }));
    }
  }

  const load = useCallback(async () => {
    setError(null);
    try {
      const [wishRes, profRes] = await Promise.all([
        fetch("/api/social/wishlist?enrich=1"),
        fetch("/api/social/profile").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]);
      if (!wishRes.ok) {
        if (wishRes.status === 401) setError("Sign in required.");
        else setError(`Failed (HTTP ${wishRes.status})`);
        return;
      }
      const d = await wishRes.json();
      setItems(d.wishlist ?? []);
      if (profRes?.profile) {
        setProfile({
          username: profRes.profile.username ?? null,
          is_public: Boolean(profRes.profile.is_public),
        });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function remove(id: string) {
    if (!confirm("Remove this wish?")) return;
    setBusy(id);
    try {
      await fetch("/api/social/wishlist", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: id }),
      });
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function toggleFulfilled(item: WishlistItem) {
    setBusy(item.id);
    try {
      // The existing POST does an add; we need a fulfilled toggle. Use a
      // re-add with the same sku — addToWishlist has ON CONFLICT update.
      // Simpler path: direct PATCH endpoint. Since one doesn't exist yet,
      // we just re-POST the same fields with an updated note and rely on
      // the UNIQUE constraint — but that doesn't toggle fulfilled. For
      // now, remove-and-readd is the clean path via existing APIs.
      // (Proper endpoint: PATCH /api/social/wishlist/[id] — future work.)
      // Here: just remove the item when user marks fulfilled.
      if (!item.fulfilled) {
        if (!confirm(`Mark "${item.card_name}" as fulfilled (removes it from active wishlist)?`)) return;
        await fetch("/api/social/wishlist", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemId: item.id }),
        });
        await load();
      }
    } finally {
      setBusy(null);
    }
  }

  async function saveMaxPrice(item: WishlistItem) {
    const v = parseFloat(editPrice);
    if (!Number.isFinite(v) || v < 0) { setError("Max price must be ≥ 0."); return; }
    setBusy(item.id);
    try {
      // Re-POST the same fields with the new max_price — addToWishlist
      // upserts on (user_id, sku).
      const res = await fetch("/api/social/wishlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku: item.sku,
          cardName: item.card_name,
          cardNumber: item.card_number,
          setCode: item.set_code,
          setName: item.set_name,
          imageUrl: item.image_url,
          maxPrice: v,
          conditionMin: item.condition_min,
          notes: item.notes,
        }),
      });
      if (!res.ok) { setError("Save failed."); return; }
      setEditingId(null);
      await load();
    } finally {
      setBusy(null);
    }
  }

  const counts = {
    pending: items.filter((i) => !i.fulfilled && !i.availability?.matched).length,
    matched: items.filter((i) => !i.fulfilled && i.availability?.matched).length,
    fulfilled: items.filter((i) => i.fulfilled).length,
    all: items.length,
  };

  const filtered = items.filter((i) => {
    if (filter === "fulfilled") return i.fulfilled;
    if (filter === "matched") return !i.fulfilled && i.availability?.matched;
    if (filter === "pending") return !i.fulfilled && !i.availability?.matched;
    return true;
  });

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
          <div>
            <Link href="/account" className="text-xs text-neutral-500 hover:text-neutral-300">&larr; Account</Link>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mt-2">Wishlist</h1>
            <p className="text-sm text-neutral-400 mt-1">
              Cards you&apos;re hunting. We&apos;ll email you when one appears at your max price on the P2P market or in-store stock.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowCsv(true)}
              className="bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-white font-medium rounded-lg px-4 py-2 text-sm transition-colors"
            >
              Import CSV
            </button>
            <Link
              href="/account/profile"
              className="bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-lg px-4 py-2 text-sm transition-colors"
            >
              + Add from profile
            </Link>
          </div>
        </div>

        {error && (
          <div className="mb-4 bg-red-900/30 border border-red-700/40 text-red-300 rounded-lg px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {/* Gift-link share banner */}
        {profile && items.length > 0 && (
          <div className="mb-4 bg-gradient-to-r from-fuchsia-500/10 via-neutral-900 to-amber-500/10 border border-fuchsia-500/20 rounded-xl px-4 py-3 flex items-center justify-between flex-wrap gap-3 text-sm">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-fuchsia-400 font-bold">
                🎁 Gift this wishlist
              </p>
              {profile.username && profile.is_public ? (
                <p className="text-neutral-300 mt-0.5 truncate">
                  Share{" "}
                  <Link href={`/u/${profile.username}`} className="text-fuchsia-300 underline hover:text-fuchsia-200">
                    /u/{profile.username}
                  </Link>{" "}
                  — your wishlist is visible at the bottom of your public profile.
                </p>
              ) : (
                <p className="text-xs text-neutral-500 mt-0.5">
                  Pick a username + make your profile public in{" "}
                  <Link href="/account/profile" className="text-fuchsia-400 hover:text-fuchsia-300 underline">
                    settings
                  </Link>{" "}
                  to get a shareable URL.
                </p>
              )}
            </div>
            {profile.username && profile.is_public && (
              <button
                onClick={() => {
                  const url = `${window.location.origin}/u/${profile.username}`;
                  navigator.clipboard.writeText(url).then(
                    () => { setCopied(true); setTimeout(() => setCopied(false), 2000); },
                    () => {},
                  );
                }}
                className="text-xs bg-fuchsia-500 hover:bg-fuchsia-400 text-black font-bold rounded px-3 py-1.5 transition-colors whitespace-nowrap"
              >
                {copied ? "Copied!" : "Copy gift link"}
              </button>
            )}
          </div>
        )}

        {/* Filter tabs */}
        <div className="flex gap-1 mb-6 text-xs overflow-x-auto">
          {(["pending", "matched", "fulfilled", "all"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors ${
                filter === f
                  ? "bg-amber-500 text-black font-bold"
                  : "bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white"
              }`}
            >
              {f === "matched" && counts.matched > 0 && "⚡ "}
              {f.charAt(0).toUpperCase() + f.slice(1)} · {counts[f]}
            </button>
          ))}
        </div>

        {loading && (
          <div className="py-12 text-center">
            <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-8 text-center">
            <p className="text-neutral-500 text-sm">
              {filter === "pending" && "No pending wishes. Add cards from your profile or a product page."}
              {filter === "matched" && "No matches right now — we'll email you as soon as one appears."}
              {filter === "fulfilled" && "No fulfilled wishes yet."}
              {filter === "all" && "Your wishlist is empty."}
            </p>
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((item) => {
              const max = item.max_price != null ? parseFloat(item.max_price) : null;
              const av = item.availability;
              const isEditing = editingId === item.id;
              return (
                <div
                  key={item.id}
                  className={`relative bg-neutral-900 border rounded-xl overflow-hidden ${
                    av?.matched ? "border-emerald-500/40" : "border-neutral-800"
                  }`}
                >
                  {av?.matched && (
                    <div className="absolute top-0 left-0 right-0 bg-emerald-500 text-black text-[10px] font-bold uppercase tracking-wider py-1 text-center z-10">
                      ⚡ Match — {gbp(av.best_price)} via {av.best_source}
                    </div>
                  )}

                  <div className="relative aspect-[5/7] bg-neutral-800">
                    {item.image_url ? (
                      <Image src={item.image_url} alt={item.card_name} fill sizes="280px" className="object-cover" />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-neutral-600 text-xs">No image</div>
                    )}
                  </div>

                  <div className="p-3 space-y-1">
                    <p className="font-semibold text-sm truncate">{item.card_name}</p>
                    <p className="text-xs text-neutral-500 truncate">
                      {item.sku ?? item.card_number ?? ""}
                      {item.set_code ? ` · ${item.set_code}` : ""}
                      {item.condition_min && item.condition_min !== "NM" ? ` · ≥${item.condition_min}` : ""}
                    </p>

                    {/* Max price — editable */}
                    {isEditing ? (
                      <div className="mt-1">
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-neutral-500">Max £</span>
                          <input
                            type="number"
                            step="0.01"
                            value={editPrice}
                            onChange={(e) => setEditPrice(e.target.value)}
                            className="bg-neutral-800 border border-neutral-700 rounded text-xs px-2 py-1 w-16 focus:outline-none focus:border-amber-500"
                            autoFocus
                          />
                          <button
                            onClick={() => saveMaxPrice(item)}
                            disabled={busy === item.id}
                            className="text-[11px] bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded px-2 py-1"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => { setEditingId(null); setError(null); }}
                            className="text-[11px] text-neutral-500 hover:text-white"
                          >
                            Cancel
                          </button>
                        </div>
                        {item.sku && (() => {
                          const s = suggestions[item.sku];
                          if (s === undefined) {
                            return (
                              <button
                                onClick={() => item.sku && fetchSuggestion(item.sku)}
                                className="text-[10px] text-fuchsia-400 hover:text-fuchsia-300 underline mt-1"
                              >
                                Suggest target from 30-day history
                              </button>
                            );
                          }
                          if (s == null) {
                            return (
                              <p className="text-[10px] text-neutral-600 mt-1">
                                Not enough price history yet.
                              </p>
                            );
                          }
                          return (
                            <div className="mt-1 text-[10px] text-neutral-400">
                              Suggested{" "}
                              <button
                                onClick={() => setEditPrice(s.value.toString())}
                                className="text-fuchsia-400 hover:text-fuchsia-300 font-semibold underline"
                              >
                                £{s.value.toFixed(2)}
                              </button>
                              <span className="text-neutral-600"> — {s.explanation}</span>
                            </div>
                          );
                        })()}
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 mt-1 text-xs">
                        <span className="text-neutral-500">Target</span>
                        <span className="text-white font-semibold">{gbp(max)}</span>
                        {item.sku && (
                          <button
                            onClick={() => { setEditingId(item.id); setEditPrice(max != null ? max.toString() : ""); }}
                            className="text-neutral-500 hover:text-amber-400 text-[10px] ml-1"
                          >
                            edit
                          </button>
                        )}
                      </div>
                    )}

                    {/* Availability breakdown (only render for SKUd items with enrichment) */}
                    {item.sku && av && (
                      <div className="pt-1 mt-1 border-t border-neutral-800 space-y-0.5 text-[11px]">
                        <div className="flex justify-between text-neutral-400">
                          <span>P2P</span>
                          <span>
                            {av.p2p_price != null
                              ? `${gbp(av.p2p_price)} · ${av.p2p_condition} · ${av.p2p_qty}x`
                              : <span className="text-neutral-600">no ask</span>}
                          </span>
                        </div>
                        <div className="flex justify-between text-neutral-400">
                          <span>Store</span>
                          <span>
                            {av.store_price != null
                              ? `${gbp(av.store_price)} · ${av.store_stock}x`
                              : <span className="text-neutral-600">no stock</span>}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-1.5 pt-2">
                      {item.sku && av?.p2p_order_id && av.p2p_price != null && max != null && av.p2p_price <= max && (
                        <Link
                          href={`/market/${item.sku}`}
                          className="flex-1 text-center text-[11px] bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded px-2 py-1.5 transition-colors"
                        >
                          Buy P2P
                        </Link>
                      )}
                      {item.sku && av?.store_price != null && av.store_stock > 0 && max != null && av.store_price <= max && (
                        <Link
                          href={`/product/${item.sku}`}
                          className="flex-1 text-center text-[11px] bg-amber-500 hover:bg-amber-400 text-black font-bold rounded px-2 py-1.5 transition-colors"
                        >
                          Buy in store
                        </Link>
                      )}
                      <button
                        onClick={() => toggleFulfilled(item)}
                        disabled={busy === item.id}
                        className="flex-1 text-[11px] bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded px-2 py-1.5 transition-colors disabled:opacity-40"
                        title="Mark as fulfilled (removes from active list)"
                      >
                        Fulfilled
                      </button>
                      <button
                        onClick={() => remove(item.id)}
                        disabled={busy === item.id}
                        className="text-[11px] bg-neutral-800 hover:bg-red-900/40 text-neutral-400 hover:text-red-400 rounded px-2 py-1.5 transition-colors disabled:opacity-40"
                      >
                        ✕
                      </button>
                    </div>

                    {item.last_matched_at && !av?.matched && (
                      <p className="text-[10px] text-neutral-600 pt-1">
                        Last matched {new Date(item.last_matched_at).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showCsv && (
        <WishlistCsvImport
          onClose={() => setShowCsv(false)}
          onImport={async (rows: ParsedWishRow[]) => {
            const failed: string[] = [];
            let added = 0;

            // Resolve each SKU via the catalog search so we can store a
            // full card snapshot, then POST to /api/social/wishlist which
            // upserts on (user_id, sku).
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
                  }>) ?? [];
                  const exact = results.find((c) => c.sku.toUpperCase() === r.sku);
                  return { row: r, card: exact ?? results[0] ?? null };
                } catch { return { row: r, card: null }; }
              }),
            );

            for (const { row, card } of resolved) {
              if (!card) { failed.push(row.sku); continue; }
              try {
                const res = await fetch("/api/social/wishlist", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    sku: card.sku,
                    cardName: card.card_name,
                    cardNumber: card.card_number,
                    setCode: card.set_code,
                    setName: card.set_name,
                    imageUrl: card.image_url,
                    maxPrice: row.maxPrice,
                    conditionMin: row.conditionMin,
                    notes: row.notes,
                  }),
                });
                if (res.ok) added += 1;
                else failed.push(row.sku);
              } catch { failed.push(row.sku); }
            }

            await load();
            return { added, failed };
          }}
        />
      )}
    </main>
  );
}
