/**
 * /play/starters — tier-2 of the rookie flow.
 *
 * Yu 2026-05-14: *"PREBUILD FOR ROOKIES!!!! TAILOR THE CARD PICKING
 * PROCESS FOR PLAYERS!!!!"*
 *
 * Six color tiles. Pick a color → load that starter as the active deck →
 * routed to /play with one click. The patterns this surface implements
 * come from `docs/research/deck-builder-ux-survey.md`:
 *
 *   - Pattern 1 (free starter library at install) — all 6 are free + ready
 *   - Pattern 2 (color/archetype gate before card list) — color-first picker
 *   - Pattern 4 (game-economy stats only) — NO money, NO prices
 *   - Pattern 5 (one-click play) — selecting a tile drops into a match
 *
 * Composes with /play (tier-1 default-mount) and /deck-builder
 * (tier-3/4 custom builds).
 */

"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface StarterTile {
  id: string;
  product_code: string;
  display_name: string;
  leader_name: string;
  leader_card_number: string;
  color: "red" | "green" | "blue" | "purple" | "black" | "yellow";
  color_label: string;
  playstyle_short: string;
  one_paragraph: string;
  complexity: 1 | 2 | 3 | 4 | 5;
  era: string;
  tier: 1 | 2 | 3;
  decklist_source: "bandai-official" | "ctcg-minimal-playable";
  source_url: string | null;
  main_deck_cards: number;
  detail_url: string;
  play_url: string;
}

interface ResolvedCard {
  sku: string | null;
  card_number: string;
  name: string | null;
  set_code: string | null;
  rarity: string | null;
  image_url: string | null;
  quantity: number;
  role: string | null;
  resolved: boolean;
}

interface StarterDetail {
  id: string;
  product_code: string;
  display_name: string;
  leader_name: string;
  color: StarterTile["color"];
  color_label: string;
  playstyle_short: string;
  one_paragraph: string;
  complexity: number;
  era: string;
  decklist_source: StarterTile["decklist_source"];
  source_url: string | null;
  main_deck_cards_declared: number;
  leader: ResolvedCard;
  cards: ResolvedCard[];
  cards_resolved: number;
  cards_unresolved: number;
}

const STORAGE_KEY = "ctcg-deck-builder-decks";

const COLOR_PALETTE: Record<StarterTile["color"], {
  bg: string;
  hoverBg: string;
  border: string;
  text: string;
  ringSelected: string;
}> = {
  red:    { bg: "bg-danger/10",     hoverBg: "hover:bg-danger/20",     border: "border-danger/40",     text: "text-red-300",     ringSelected: "ring-red-400" },
  green:  { bg: "bg-emerald-500/10", hoverBg: "hover:bg-emerald-500/20", border: "border-emerald-500/40", text: "text-emerald-300", ringSelected: "ring-emerald-400" },
  blue:   { bg: "bg-blue-500/10",    hoverBg: "hover:bg-blue-500/20",    border: "border-blue-500/40",    text: "text-blue-300",    ringSelected: "ring-blue-400" },
  purple: { bg: "bg-purple-500/10",  hoverBg: "hover:bg-purple-500/20",  border: "border-purple-500/40",  text: "text-purple-300",  ringSelected: "ring-purple-400" },
  black:  { bg: "bg-slate-500/10",   hoverBg: "hover:bg-slate-500/20",   border: "border-slate-500/40",   text: "text-slate-300",   ringSelected: "ring-slate-400" },
  yellow: { bg: "bg-accent/10",   hoverBg: "hover:bg-accent/20",   border: "border-accent/40",   text: "text-accent-strong",   ringSelected: "ring-amber-400" },
};

export default function StartersPage() {
  const router = useRouter();
  const [tiles, setTiles] = useState<StarterTile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<StarterDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showTier2, setShowTier2] = useState(false);

  // ── Load the catalog ────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    fetch("/api/v1/play/starters")
      .then((r) => r.ok ? r.json() : Promise.reject(r))
      .then((env) => {
        if (cancelled) return;
        setTiles(env?.data?.starters ?? []);
      })
      .catch(() => {
        if (cancelled) return;
        setError("Couldn't load starters. Try again in a moment.");
      });
    return () => { cancelled = true; };
  }, []);

  // ── Load detail for the selected starter ───────────────────────────
  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    fetch(`/api/v1/play/starters/${selectedId}`)
      .then((r) => r.ok ? r.json() : Promise.reject(r))
      .then((env) => {
        if (cancelled) return;
        setDetail(env?.data ?? null);
        setDetailLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError("Couldn't load that starter. Try another color.");
        setDetailLoading(false);
      });
    return () => { cancelled = true; };
  }, [selectedId]);

  // ── Load a starter as the active deck and go play ──────────────────
  async function playWithThisStarter() {
    if (!detail || !detail.leader.resolved || !detail.leader.sku) return;
    setLoading(true);
    setLoadError(null);
    try {
      // Build a SavedDeck-shaped object (same shape /play and /deck-builder use)
      const leaderCard = {
        sku: detail.leader.sku,
        card_number: detail.leader.card_number,
        name: detail.leader.name ?? detail.leader.card_number,
        set_code: detail.leader.set_code ?? "",
        set_name: "",
        rarity: detail.leader.rarity,
        image_url: detail.leader.image_url,
        spot_price: 0,
        tradein_credit: null,
      };
      const entries = detail.cards
        .filter((c) => c.resolved && c.sku)
        .map((c) => ({
          sku: c.sku as string,
          quantity: c.quantity,
          card: {
            sku: c.sku as string,
            card_number: c.card_number,
            name: c.name ?? c.card_number,
            set_code: c.set_code ?? "",
            set_name: "",
            rarity: c.rarity,
            image_url: c.image_url,
            spot_price: 0,
            tradein_credit: null,
          },
        }));
      const starterDeck = {
        name: `${detail.display_name} (starter)`,
        leader: leaderCard,
        entries,
        savedAt: new Date().toISOString(),
      };
      // Prepend this starter to existing decks, dedup'd by name.
      const stored = ((): typeof starterDeck[] => {
        try {
          const raw = localStorage.getItem(STORAGE_KEY);
          return raw ? JSON.parse(raw) : [];
        } catch {
          return [];
        }
      })();
      const filtered = stored.filter((d) => d.name !== starterDeck.name);
      const next = [starterDeck, ...filtered];
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        setLoadError("Couldn't save the deck — your browser may have storage disabled.");
        setLoading(false);
        return;
      }
      router.push("/play");
    } catch {
      setLoadError("Something went wrong loading the deck. Try again?");
      setLoading(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <main className="max-w-5xl mx-auto px-4 py-10">
      <nav aria-label="Breadcrumb" className="text-sm text-ink-muted mb-6">
        <ol className="flex items-center gap-1.5">
          <li><Link href="/" className="hover:text-ink">Home</Link></li>
          <li className="text-neutral-600">/</li>
          <li><Link href="/play" className="hover:text-ink">Play</Link></li>
          <li className="text-neutral-600">/</li>
          <li className="text-ink">Starters</li>
        </ol>
      </nav>

      <header className="mb-8">
        <h1 className="text-3xl font-bold text-ink mb-2">
          Pick your first deck
        </h1>
        <p className="text-ink-muted max-w-2xl leading-relaxed">
          Each color plays differently. Pick one that sounds fun — you can
          always switch later. All six starters are free and ready to play.
          No deck building, no shopping required.
        </p>
        <p className="mt-3 text-[11px] text-neutral-600 leading-relaxed max-w-2xl">
          The play module is fun-first. No prices, no rating, no commerce —
          just six color archetypes from Bandai&apos;s 2024 reboot cohort
          (ST-15 through ST-20). See{" "}
          <Link href="/methodology/starter-decks" className="text-accent-strong hover:underline">
            methodology
          </Link>
          {" "}for sourcing.
        </p>
      </header>

      {error && (
        <div className="mb-6 bg-red-900/40 border border-red-700 text-red-300 rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {!tiles ? (
        <div className="py-16 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* ── Tier-1: 6-tile color picker ──────────────────────────── */}
          <section
            role="radiogroup"
            aria-label="Pick a starter color"
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 mb-8"
          >
            {tiles.filter((t) => t.tier === 1).map((tile) => {
              const palette = COLOR_PALETTE[tile.color];
              const isSelected = tile.id === selectedId;
              return (
                <button
                  key={tile.id}
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => setSelectedId(tile.id)}
                  className={
                    "text-left rounded-xl border p-4 transition-all " +
                    `${palette.bg} ${palette.hoverBg} ${palette.border} ` +
                    (isSelected ? `ring-2 ring-offset-2 ring-offset-neutral-950 ${palette.ringSelected}` : "")
                  }
                >
                  <div className="flex items-baseline justify-between mb-1.5">
                    <h2 className={`text-lg font-bold ${palette.text}`}>
                      {tile.color_label}
                    </h2>
                    <span className="text-[10px] font-mono uppercase tracking-wider text-ink-faint">
                      {tile.product_code}
                    </span>
                  </div>
                  <p className="text-sm text-ink font-semibold mb-0.5">
                    {tile.leader_name}
                  </p>
                  <p className="text-xs text-ink-muted mb-3">
                    {tile.playstyle_short}
                  </p>
                  <p className="text-xs text-ink-faint leading-relaxed">
                    {tile.one_paragraph}
                  </p>
                </button>
              );
            })}
          </section>

          {/* ── Tier-2: "Next-step starters" — collapsed by default ─── */}
          {tiles.some((t) => t.tier === 2) && (
            <section className="mb-8" aria-label="Next-step starters">
              {!showTier2 ? (
                <div className="text-center">
                  <button
                    onClick={() => setShowTier2(true)}
                    className="text-sm text-ink-muted hover:text-ink underline underline-offset-4"
                  >
                    Show next-step starters →
                  </button>
                  <p className="mt-1 text-[11px] text-neutral-600">
                    {tiles.filter((t) => t.tier === 2).length} more decks — slightly
                    more complex, recommended after your first match
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex items-baseline justify-between mb-3">
                    <h2 className="text-sm font-bold uppercase tracking-wider text-ink-muted">
                      Next-step starters
                    </h2>
                    <button
                      onClick={() => setShowTier2(false)}
                      className="text-[11px] text-ink-faint hover:text-ink-muted underline"
                    >
                      Hide
                    </button>
                  </div>
                  <div
                    role="radiogroup"
                    aria-label="Pick a next-step starter"
                    className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
                  >
                    {tiles.filter((t) => t.tier === 2).map((tile) => {
                      const palette = COLOR_PALETTE[tile.color];
                      const isSelected = tile.id === selectedId;
                      return (
                        <button
                          key={tile.id}
                          role="radio"
                          aria-checked={isSelected}
                          onClick={() => setSelectedId(tile.id)}
                          className={
                            "text-left rounded-xl border p-4 transition-all " +
                            `${palette.bg} ${palette.hoverBg} ${palette.border} ` +
                            (isSelected ? `ring-2 ring-offset-2 ring-offset-neutral-950 ${palette.ringSelected}` : "")
                          }
                        >
                          <div className="flex items-baseline justify-between mb-1.5">
                            <h2 className={`text-sm font-bold ${palette.text}`}>
                              {tile.color_label} · {tile.playstyle_short}
                            </h2>
                            <span className="text-[10px] font-mono uppercase tracking-wider text-ink-faint">
                              {tile.product_code}
                            </span>
                          </div>
                          <p className="text-sm text-ink font-semibold mb-2">
                            {tile.leader_name}
                          </p>
                          <p className="text-xs text-ink-faint leading-relaxed">
                            {tile.one_paragraph}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </section>
          )}

          {/* ── Expanded view for the selected starter ─────────────── */}
          {selectedId && (
            <section
              aria-label="Selected starter detail"
              className="rounded-xl border border-border-subtle bg-page p-5 sm:p-6"
            >
              {detailLoading || !detail ? (
                <div className="py-8 flex items-center justify-center">
                  <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <>
                  <div className="mb-4 flex items-baseline justify-between gap-4 flex-wrap">
                    <div>
                      <h2 className="text-2xl font-bold text-ink">
                        {detail.display_name}
                      </h2>
                      <p className="text-sm text-ink-muted mt-0.5">
                        Leader: <span className="text-ink">{detail.leader_name}</span>
                        {" · "}Color: <span className={COLOR_PALETTE[detail.color].text}>{detail.color_label}</span>
                        {" · "}Complexity: <span className="text-ink">{"★".repeat(detail.complexity)}</span>
                      </p>
                    </div>
                    {detail.decklist_source === "ctcg-minimal-playable" && (
                      <span
                        className="inline-block px-2 py-1 rounded bg-accent/10 text-accent-strong border border-accent/30 text-[10px] uppercase tracking-wider"
                        title="v1 — minimal playable list pending full encoding from upstream"
                      >
                        v1 minimal list
                      </span>
                    )}
                  </div>

                  <p className="text-ink-muted leading-relaxed mb-5 max-w-2xl">
                    {detail.one_paragraph}
                  </p>

                  <div className="grid gap-5 md:grid-cols-[180px_1fr] mb-5">
                    {/* Leader image */}
                    <div className="md:order-1">
                      {detail.leader.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={detail.leader.image_url}
                          alt={`${detail.leader.name ?? "Leader"} card art`}
                          className="w-full max-w-[180px] rounded-lg border border-border-subtle aspect-[5/7] object-cover bg-surface"
                          loading="eager"
                        />
                      ) : (
                        <div className="w-full max-w-[180px] aspect-[5/7] rounded-lg border border-border-subtle bg-surface flex items-center justify-center text-neutral-600 text-xs">
                          No image
                        </div>
                      )}
                    </div>

                    {/* Card list */}
                    <div className="md:order-2">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-ink-faint mb-2">
                        Main deck ({detail.cards_resolved} of {detail.main_deck_cards_declared} cards)
                      </h3>
                      {detail.cards_resolved === 0 ? (
                        <p className="text-sm text-ink-faint">
                          Card data couldn&apos;t be resolved against the catalog.
                          The deck is still playable — try the Play button.
                        </p>
                      ) : (
                        <ul className="space-y-1 text-xs text-ink-muted max-h-64 overflow-y-auto pr-2">
                          {detail.cards
                            .filter((c) => c.resolved)
                            .map((c, i) => (
                              <li
                                key={`${c.card_number}-${i}`}
                                className="flex items-center gap-2 py-0.5"
                              >
                                <span className="text-accent-strong font-mono w-6 text-right shrink-0">
                                  ×{c.quantity}
                                </span>
                                <span className="text-ink-faint font-mono text-[10px] w-20 shrink-0 truncate">
                                  {c.card_number}
                                </span>
                                <span className="truncate flex-1">{c.name}</span>
                                {c.rarity && (
                                  <span className="text-[10px] text-neutral-600 shrink-0">
                                    {c.rarity}
                                  </span>
                                )}
                              </li>
                            ))}
                        </ul>
                      )}
                    </div>
                  </div>

                  {loadError && (
                    <div className="mb-3 bg-red-900/40 border border-red-700 text-red-300 rounded-lg px-3 py-2 text-sm">
                      {loadError}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-3">
                    <button
                      onClick={playWithThisStarter}
                      disabled={loading || !detail.leader.resolved}
                      className="bg-accent hover:bg-accent-strong disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold rounded-lg px-6 py-3 text-base transition-colors"
                    >
                      {loading ? "Loading..." : "▶ Play with this deck"}
                    </button>
                    <button
                      onClick={() => setSelectedId(null)}
                      className="rounded-lg border border-border-strong hover:border-neutral-500 text-ink-muted px-4 py-3 text-sm transition-colors"
                    >
                      ← Pick a different color
                    </button>
                  </div>

                  <p className="mt-4 text-[10px] text-neutral-600 leading-relaxed">
                    Decklist source:{" "}
                    <code className="text-ink-faint">{detail.decklist_source}</code>
                    {detail.source_url && (
                      <>
                        {" · "}
                        <a
                          href={detail.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-ink-faint hover:text-accent-strong underline"
                        >
                          upstream
                        </a>
                      </>
                    )}
                  </p>
                </>
              )}
            </section>
          )}

          {/* ── No selection state ─────────────────────────────────── */}
          {!selectedId && (
            <p className="text-center text-sm text-ink-faint py-4">
              Click any color tile to see what that starter plays like.
            </p>
          )}
        </>
      )}

      <footer className="mt-12 pt-6 border-t border-border-subtle text-xs text-ink-faint leading-relaxed">
        <p>
          Want to build your own deck instead?{" "}
          <Link href="/deck-builder" className="text-accent-strong hover:underline">
            Open the deck builder
          </Link>
          . Want to read about how the game works first?{" "}
          <Link href="/play/welcome" className="text-accent-strong hover:underline">
            See the welcome page
          </Link>
          .
        </p>
      </footer>
    </main>
  );
}
