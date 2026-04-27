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
  let cls = "bg-neutral-700 text-neutral-400";
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
  const totalValue = deck?.entries.reduce((s, e) => s + e.card.spot_price * e.quantity, 0) ?? 0;

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
    <main className="min-h-screen bg-neutral-950 text-white">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <Link href="/decks" className="text-sm text-neutral-500 hover:text-neutral-300">
          &larr; Community Decks
        </Link>

        {loading && (
          <div className="py-12 text-center">
            <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" />
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
                <p className="text-sm text-neutral-500 mt-1">
                  {deck.user_name && <>by <span className="text-neutral-300">{deck.user_name}</span> · </>}
                  Updated {new Date(deck.updated_at).toLocaleDateString()} · {deck.view_count} views
                </p>
                {deck.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {deck.tags.map((t) => (
                      <span
                        key={t}
                        className="text-[10px] bg-neutral-800 text-neutral-400 px-2 py-0.5 rounded uppercase tracking-wide"
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
                  className="bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm font-medium rounded-lg px-4 py-2 transition-colors"
                >
                  {copied ? "Copied!" : "Copy deck list"}
                </button>
                <Link
                  href="/deck-builder"
                  className="bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm rounded-lg px-4 py-2 transition-colors"
                >
                  Build your own
                </Link>
              </div>
            </div>

            {deck.notes && (
              <div className="mb-6 bg-neutral-900/60 border border-neutral-800 rounded-xl p-4">
                <p className="text-xs uppercase tracking-wider text-neutral-500 font-bold mb-2">Notes</p>
                <p className="text-sm text-neutral-300 whitespace-pre-wrap leading-relaxed">{deck.notes}</p>
              </div>
            )}

            <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
              {/* Leader + summary */}
              <div className="space-y-4">
                {leader && (
                  <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
                    <div className="relative aspect-[5/7] bg-neutral-950">
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
                      <p className="text-[10px] uppercase tracking-wider text-amber-400 font-bold">Leader</p>
                      <p className="font-semibold text-sm truncate">{leader.name}</p>
                      <p className="text-xs text-neutral-500">{leader.card_number}</p>
                    </div>
                  </div>
                )}
                <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 grid grid-cols-2 gap-3 text-center">
                  <div>
                    <p className="text-2xl font-bold text-white">{totalCards}</p>
                    <p className="text-[10px] text-neutral-500">Cards</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-amber-400">£{totalValue.toFixed(2)}</p>
                    <p className="text-[10px] text-neutral-500">Spot value</p>
                  </div>
                </div>
              </div>

              {/* Card list */}
              <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between">
                  <p className="font-bold text-sm">Main deck</p>
                  <p className="text-xs text-neutral-500">{mainDeck.length} unique</p>
                </div>
                <div className="divide-y divide-neutral-800/60">
                  {mainDeck.map((e) => (
                    <div
                      key={e.sku}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-800/40 transition-colors"
                    >
                      <div className="relative w-10 h-14 flex-shrink-0 rounded overflow-hidden bg-neutral-800">
                        {e.card.image_url && (
                          <Image src={e.card.image_url} alt={e.card.name} fill sizes="40px" className="object-cover" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{e.card.name}</p>
                        <div className="flex items-center gap-1.5 text-[11px] text-neutral-500">
                          <span>{e.card.card_number}</span>
                          {rarityBadge(e.card.rarity)}
                          <span className="text-amber-400">£{e.card.spot_price.toFixed(2)}</span>
                        </div>
                      </div>
                      <span className="text-amber-400 font-bold text-sm w-10 text-right">
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
