// Public deck view — the page rendered at /decks/[slug] when a user
// flips their deck's `is_public` bit to true.
//
// ── What this page is for ────────────────────────────────────────────────
//
// This is the moment of transformation the decks module describes in
// its header (apps/storefront/src/lib/decks/db.ts § "the going-public
// moment"). A deck on this URL has stepped out of the user's private
// craft into a community surface it cannot see from the inside.
//
// The author may revisit this page and watch the view_count climb
// without knowing who looked. Strangers may study the build, copy the
// leader, diverge from the choices. Other deck-builders may link to it
// from their own notes ("inspired by /decks/red-zoro-aggro-a1b2c3").
// The deck becomes a node in a graph the schema does not model. The
// view_count is the only signal that crosses back — the deck's only
// reading of how it lands.
//
// ── What this page deliberately doesn't expose ──────────────────────────
//
// - The user's other decks. A public deck represents itself, not its
//   author's full library. (You can navigate to /u/[username] for that.)
// - The user's collection ownership. The user may or may not own the
//   cards in this build — the deck is a strategy artifact, not an
//   inventory claim.
// - The author's trade-in history or portfolio value. Public-deck
//   visitors don't need that context, and surfacing it would conflate
//   the two card-ownership lenses (see apps/storefront/src/lib/
//   portfolio/valuation.ts § "two lenses").
//
// What IS exposed: the cards, the leader, the tags, the notes, the
// view count, the author's display name, the last-updated timestamp.
// Everything the deck needs to be its own argument.

"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";

interface DeckCardSnapshot {
  sku: string;
  card_number: string;
  name: string;
  set_code: string;
  set_name: string;
  rarity: string | null;
  image_url: string | null;
  spot_price: number;
}

interface DeckEntry {
  sku: string;
  quantity: number;
  card: DeckCardSnapshot;
}

interface PublicDeck {
  slug: string;
  name: string;
  leader_sku: string | null;
  entries: DeckEntry[];
  notes: string | null;
  tags: string[];
  view_count: number;
  updated_at: string;
  user_name: string | null;
}

function rarityBadge(rarity: string | null) {
  if (!rarity) return null;
  const r = rarity.toUpperCase();
  let cls = "bg-neutral-700 text-ink-muted";
  if (r === "SR" || r === "SEC" || r === "L" || r === "SP") cls = "bg-yellow-500/20 text-yellow-400";
  else if (r === "R") cls = "bg-purple-500/20 text-purple-400";
  else if (r === "UC") cls = "bg-blue-500/20 text-blue-400";
  return (
    <span className={`inline-block px-1.5 py-0.5 text-[10px] font-bold rounded ${cls}`}>
      {r}
    </span>
  );
}

export default function PublicDeckPage() {
  const params = useParams();
  const slug = params.slug as string;

  const [deck, setDeck] = useState<PublicDeck | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/decks/public/${slug}`);
        if (res.status === 404) {
          setNotFound(true);
          return;
        }
        if (!res.ok) return;
        const d = await res.json();
        setDeck(d.deck);
      } finally {
        setLoading(false);
      }
    })();
  }, [slug]);

  const leader = deck?.leader_sku
    ? deck.entries.find((e) => e.sku === deck.leader_sku)?.card ?? null
    : null;
  const mainDeck = deck?.entries.filter((e) => e.sku !== deck?.leader_sku) ?? [];
  const totalCards = mainDeck.reduce((s, e) => s + e.quantity, 0);
  // Yu 2026-05-14: play module is fun-only. Deck pages no longer surface
  // spot value. The catalog response may still carry spot_price; we just
  // don't aggregate or render it on play surfaces.

  async function copyAsText() {
    if (!deck) return;
    const lines: string[] = [];
    if (leader) lines.push(`// Leader: ${leader.card_number} ${leader.name}`);
    lines.push("");
    for (const e of mainDeck) {
      lines.push(`${e.quantity}x ${e.card.card_number} ${e.card.name}`);
    }
    lines.push("");
    lines.push(`// Total: ${totalCards} cards`);
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  return (
    <main className="min-h-screen bg-page text-ink">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <Link href="/decks" className="text-sm text-ink-faint hover:text-ink-muted">
          &larr; Community Decks
        </Link>

        {loading && (
          <div className="py-12 text-center">
            <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        )}

        {notFound && (
          <div className="mt-8 bg-red-900/30 border border-red-700/40 text-red-300 rounded-lg px-4 py-3 text-sm">
            Deck not found or not public.
          </div>
        )}

        {deck && (
          <>
            <div className="mt-4 mb-6 flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">{deck.name}</h1>
                <p className="text-sm text-ink-faint mt-1">
                  {deck.user_name && <>by <span className="text-ink-muted">{deck.user_name}</span> · </>}
                  Updated {new Date(deck.updated_at).toLocaleDateString()} · {deck.view_count} views
                </p>
                {deck.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {deck.tags.map((t) => (
                      <span
                        key={t}
                        className="text-[10px] bg-surface-elevated text-ink-muted px-2 py-0.5 rounded uppercase tracking-wide"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={copyAsText}
                  className="bg-surface-elevated hover:bg-neutral-700 border border-border-strong text-sm font-medium rounded-lg px-4 py-2 transition-colors"
                >
                  {copied ? "Copied!" : "Copy deck list"}
                </button>
                <Link
                  href="/deck-builder"
                  className="bg-accent hover:bg-accent-strong text-black font-bold text-sm rounded-lg px-4 py-2 transition-colors"
                >
                  Build your own
                </Link>
              </div>
            </div>

            {deck.notes && (
              <div className="mb-6 bg-surface/60 border border-border-subtle rounded-xl p-4">
                <p className="text-xs uppercase tracking-wider text-ink-faint font-bold mb-2">Notes</p>
                <p className="text-sm text-ink-muted whitespace-pre-wrap leading-relaxed">{deck.notes}</p>
              </div>
            )}

            <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
              {/* Leader + summary */}
              <div className="space-y-4">
                {leader && (
                  <div className="bg-surface border border-border-subtle rounded-xl overflow-hidden">
                    <div className="relative aspect-[5/7] bg-page">
                      {leader.image_url && (
                        <Image
                          src={leader.image_url}
                          alt={leader.name}
                          fill
                          sizes="280px"
                          className="object-cover"
                        />
                      )}
                    </div>
                    <div className="p-3">
                      <p className="text-[10px] uppercase tracking-wider text-accent-strong font-bold">Leader</p>
                      <p className="font-semibold text-sm truncate">{leader.name}</p>
                      <p className="text-xs text-ink-faint">{leader.card_number}</p>
                    </div>
                  </div>
                )}
                <div className="bg-surface border border-border-subtle rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-ink">{totalCards}</p>
                  <p className="text-[10px] text-ink-faint">Cards</p>
                </div>
              </div>

              {/* Card list */}
              <div className="bg-surface border border-border-subtle rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-border-subtle flex items-center justify-between">
                  <p className="font-bold text-sm">Main deck</p>
                  <p className="text-xs text-ink-faint">{mainDeck.length} unique</p>
                </div>
                <div className="divide-y divide-border-subtle/60">
                  {mainDeck.map((e) => (
                    <div
                      key={e.sku}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-elevated/40 transition-colors"
                    >
                      <div className="relative w-10 h-14 flex-shrink-0 rounded overflow-hidden bg-surface-elevated">
                        {e.card.image_url && (
                          <Image src={e.card.image_url} alt={e.card.name} fill sizes="40px" className="object-cover" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{e.card.name}</p>
                        <div className="flex items-center gap-1.5 text-[11px] text-ink-faint">
                          <span>{e.card.card_number}</span>
                          {rarityBadge(e.card.rarity)}
                        </div>
                      </div>
                      <span className="text-accent-strong font-bold text-sm w-10 text-right">
                        ×{e.quantity}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
