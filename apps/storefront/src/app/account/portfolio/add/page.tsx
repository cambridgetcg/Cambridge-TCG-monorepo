"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { formatPrice } from "@/lib/format";

interface SearchResult {
  sku: string;
  card_name: string;
  card_number: string | null;
  set_code: string | null;
  set_name: string | null;
  image_url: string | null;
  rarity: string | null;
  price: number | null;
  stock: number | null;
}

export default function AddToPortfolioPage() {
  const router = useRouter();
  const [authed, setAuthed] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedSku, setSelectedSku] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state
  const [quantity, setQuantity] = useState(1);
  const [acquisitionPrice, setAcquisitionPrice] = useState("");
  const [condition, setCondition] = useState("NM");
  const [acquiredAt, setAcquiredAt] = useState("");
  const [notes, setNotes] = useState("");

  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((data) => {
        if (!data?.user?.email) {
          router.push("/login");
          return;
        }
        setAuthed(true);
      });
  }, [router]);

  const search = useCallback((q: string) => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    fetch(`/api/portfolio/search?q=${encodeURIComponent(q)}`)
      .then((r) => r.json())
      .then((data) => {
        setResults(data.results || []);
        setSearching(false);
      })
      .catch(() => setSearching(false));
  }, []);

  function handleQueryChange(val: string) {
    setQuery(val);
    setSelectedSku(null);
    setSuccess(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(val), 300);
  }

  function selectCard(card: SearchResult) {
    if (selectedSku === card.sku) {
      setSelectedSku(null);
      return;
    }
    setSelectedSku(card.sku);
    setQuantity(1);
    setAcquisitionPrice(card.price != null ? card.price.toFixed(2) : "");
    setCondition("NM");
    setAcquiredAt("");
    setNotes("");
    setSuccess(null);
  }

  async function addCard(card: SearchResult) {
    setAdding(true);
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
          condition,
          quantity,
          acquisitionPrice: acquisitionPrice || null,
          acquiredAt: acquiredAt || null,
        }),
      });
      if (res.ok) {
        setSuccess(card.card_name);
        setSelectedSku(null);
      }
    } finally {
      setAdding(false);
    }
  }

  if (!authed) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-neutral-500">Loading...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/account/portfolio"
          className="text-neutral-500 hover:text-white transition text-sm"
        >
          &larr; Portfolio
        </Link>
        <h1 className="text-2xl font-bold text-white">Add Cards</h1>
      </div>

      {/* Success message */}
      {success && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 mb-6 flex items-center justify-between">
          <p className="text-emerald-400 text-sm font-medium">
            Added &ldquo;{success}&rdquo; to your portfolio!
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setSuccess(null)}
              className="text-sm text-emerald-400 hover:text-emerald-300 transition"
            >
              Add more
            </button>
            <Link
              href="/account/portfolio"
              className="text-sm text-neutral-400 hover:text-white transition"
            >
              View portfolio
            </Link>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-6">
        <input
          type="text"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          placeholder="Search for cards (e.g. Luffy, Charizard)..."
          className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-white placeholder:text-neutral-600 focus:outline-none focus:border-amber-500/50 transition"
          autoFocus
        />
        {searching && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-500 text-sm">
            Searching...
          </div>
        )}
      </div>

      {/* Results Grid */}
      {results.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {results.map((card) => (
            <div
              key={card.sku}
              className={`bg-neutral-900 rounded-xl overflow-hidden transition cursor-pointer border ${
                selectedSku === card.sku
                  ? "border-amber-500/50"
                  : "border-transparent hover:border-neutral-700"
              }`}
              onClick={() => selectCard(card)}
            >
              {/* Card Preview */}
              <div className="flex gap-3 p-3">
                <div className="relative w-16 h-[90px] bg-neutral-800 rounded shrink-0 overflow-hidden">
                  {card.image_url ? (
                    <Image
                      src={card.image_url}
                      alt={card.card_name}
                      fill
                      className="object-contain"
                      sizes="64px"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-neutral-600 text-[10px]">
                      No Img
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-white truncate">{card.card_name}</h3>
                  <p className="text-xs text-neutral-500 truncate">
                    {card.set_name || card.set_code}
                    {card.card_number ? ` #${card.card_number}` : ""}
                  </p>
                  {card.rarity && (
                    <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 font-medium uppercase">
                      {card.rarity}
                    </span>
                  )}
                  {card.price != null && (
                    <p className="text-sm font-semibold text-amber-400 mt-1">{formatPrice(card.price)}</p>
                  )}
                </div>
              </div>

              {/* Add Form (expanded) */}
              {selectedSku === card.sku && (
                <div
                  className="px-3 pb-3 pt-1 border-t border-neutral-800 space-y-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="text-[10px] text-neutral-500 block mb-0.5">Quantity</label>
                      <input
                        type="number"
                        min={1}
                        value={quantity}
                        onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                        className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1.5 text-sm text-white"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-[10px] text-neutral-500 block mb-0.5">Cost per card</label>
                      <input
                        type="text"
                        value={acquisitionPrice}
                        onChange={(e) => setAcquisitionPrice(e.target.value)}
                        placeholder="0.00"
                        className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1.5 text-sm text-white"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="text-[10px] text-neutral-500 block mb-0.5">Condition</label>
                      <select
                        value={condition}
                        onChange={(e) => setCondition(e.target.value)}
                        className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1.5 text-sm text-white"
                      >
                        <option value="NM">Near Mint</option>
                        <option value="LP">Lightly Played</option>
                        <option value="MP">Moderately Played</option>
                        <option value="HP">Heavily Played</option>
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className="text-[10px] text-neutral-500 block mb-0.5">Date acquired</label>
                      <input
                        type="date"
                        value={acquiredAt}
                        onChange={(e) => setAcquiredAt(e.target.value)}
                        className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1.5 text-sm text-white"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] text-neutral-500 block mb-0.5">Notes (optional)</label>
                    <input
                      type="text"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="e.g. Pulled from booster pack"
                      className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1.5 text-sm text-white"
                    />
                  </div>
                  <button
                    onClick={() => addCard(card)}
                    disabled={adding}
                    className="w-full py-2 bg-amber-500 text-black font-semibold rounded-lg text-sm hover:bg-amber-400 transition disabled:opacity-50"
                  >
                    {adding ? "Adding..." : "Add to Portfolio"}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Empty search state */}
      {query && !searching && results.length === 0 && (
        <div className="bg-neutral-900 rounded-xl p-8 text-center">
          <p className="text-neutral-400">No cards found for &ldquo;{query}&rdquo;</p>
        </div>
      )}

      {/* Initial state */}
      {!query && (
        <div className="bg-neutral-900 rounded-xl p-8 text-center">
          <p className="text-neutral-500">Start typing to search for cards to add to your portfolio.</p>
        </div>
      )}
    </div>
  );
}
