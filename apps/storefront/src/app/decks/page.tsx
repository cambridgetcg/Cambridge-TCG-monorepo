"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";

interface DeckCardSnapshot {
  sku: string;
  name: string;
  image_url: string | null;
  rarity: string | null;
}

interface PublicDeckSummary {
  id: string;
  slug: string;
  name: string;
  leader_sku: string | null;
  leader_card: DeckCardSnapshot | null;
  entry_count: number;
  unique_count: number;
  tags: string[];
  view_count: number;
  updated_at: string;
  user_name: string | null;
}

export default function PublicDecksPage() {
  const [decks, setDecks] = useState<PublicDeckSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/decks/public");
        if (!res.ok) {
          setError(`Failed (HTTP ${res.status})`);
          return;
        }
        const d = await res.json();
        setDecks(d.decks ?? []);
      } catch {
        setError("Network error.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = search
    ? decks.filter((d) =>
        (d.name + " " + (d.user_name ?? "") + " " + (d.leader_card?.name ?? "") + " " + d.tags.join(" "))
          .toLowerCase()
          .includes(search.toLowerCase()),
      )
    : decks;

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <section className="border-b border-neutral-800">
        <div className="mx-auto max-w-5xl px-4 py-12">
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-2">
            Community Decks
          </h1>
          <p className="text-neutral-400 max-w-xl">
            Decks shared by Cambridge TCG players. Click through to copy the list,
            simulate opening hands, or import into your own deck builder.
          </p>
          <div className="mt-6 flex items-center gap-3 flex-wrap">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, leader, or tag..."
              className="bg-neutral-900 border border-neutral-800 rounded-lg px-4 py-2.5 text-sm w-full sm:w-80 focus:outline-none focus:border-amber-500"
            />
            <Link
              href="/deck-builder"
              className="bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-lg px-5 py-2.5 text-sm transition-colors"
            >
              Build your own &rarr;
            </Link>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-4 py-8">
        {error && (
          <div className="bg-red-900/30 border border-red-700/40 text-red-300 rounded-lg px-4 py-3 text-sm mb-4">
            {error}
          </div>
        )}

        {loading && (
          <div className="py-12 text-center">
            <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-8 text-center">
            <p className="text-neutral-500 text-sm">
              {search
                ? "No decks match your search."
                : "No public decks yet. Be the first — mark a deck as public in the builder."}
            </p>
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((d) => (
              <Link
                key={d.id}
                href={`/decks/${d.slug}`}
                className="group bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden hover:border-amber-500/40 transition-colors"
              >
                <div className="aspect-[5/7] relative bg-neutral-950">
                  {d.leader_card?.image_url ? (
                    <Image
                      src={d.leader_card.image_url}
                      alt={d.leader_card.name}
                      fill
                      sizes="240px"
                      className="object-cover"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-neutral-700 text-xs">
                      no leader
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <p className="font-semibold text-sm truncate group-hover:text-amber-400 transition-colors">
                    {d.name}
                  </p>
                  {d.leader_card && (
                    <p className="text-xs text-neutral-500 truncate">
                      Leader: {d.leader_card.name}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-2 text-[11px] text-neutral-500">
                    <span>{d.entry_count} cards</span>
                    <span>·</span>
                    <span>{d.view_count} views</span>
                    {d.user_name && (
                      <>
                        <span>·</span>
                        <span className="truncate">{d.user_name}</span>
                      </>
                    )}
                  </div>
                  {d.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {d.tags.slice(0, 3).map((t) => (
                        <span
                          key={t}
                          className="text-[9px] bg-neutral-800 text-neutral-400 px-1.5 py-0.5 rounded uppercase tracking-wide"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
