"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { formatPrice } from "@/lib/format";
import ConfirmModal from "@/components/ui/ConfirmModal";
import { useToast } from "@/components/ui/Toast";
import HandSimulator from "@/components/deck-builder/HandSimulator";
import DeckStatsPanel from "@/components/deck-builder/DeckStatsPanel";
import BulkImport, { type ParsedEntry } from "@/components/deck-builder/BulkImport";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface CatalogCard {
  sku: string;
  card_number: string;
  name: string;
  set_code: string;
  set_name: string;
  rarity: string | null;
  image_url: string | null;
  spot_price: number;
  tradein_credit: number | null;
}

interface SetInfo {
  code: string;
  name: string;
  card_count: number;
}

interface DeckEntry {
  card: CatalogCard;
  quantity: number;
}

interface SavedDeck {
  name: string;
  leader: CatalogCard | null;
  entries: { sku: string; quantity: number; card: CatalogCard }[];
  savedAt: string;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const MAX_DECK_SIZE = 50;
const MAX_COPIES = 4;
const DON_COUNT = 10;
const STORAGE_KEY = "ctcg-deck-builder-decks";

const RARITY_OPTIONS = [
  { value: "", label: "All Rarities" },
  { value: "L", label: "L (Leader)" },
  { value: "SEC", label: "SEC (Secret)" },
  { value: "SR", label: "SR (Super Rare)" },
  { value: "SP", label: "SP (Special)" },
  { value: "R", label: "R (Rare)" },
  { value: "UC", label: "UC (Uncommon)" },
  { value: "C", label: "C (Common)" },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function rarityBadge(rarity: string | null) {
  if (!rarity) return null;
  const r = rarity.toUpperCase();
  let cls = "bg-neutral-700 text-neutral-400";
  if (r === "SR" || r === "SEC" || r === "SCR" || r === "L" || r === "SP")
    cls = "bg-yellow-500/20 text-yellow-400";
  else if (r === "R" || r === "RR" || r === "SSR")
    cls = "bg-purple-500/20 text-purple-400";
  else if (r === "UC")
    cls = "bg-blue-500/20 text-blue-400";
  else if (r === "C")
    cls = "bg-neutral-700 text-neutral-400";
  return (
    <span className={`inline-block px-1.5 py-0.5 text-[10px] font-bold rounded ${cls}`}>
      {rarity.toUpperCase()}
    </span>
  );
}

function encodeDeck(leader: CatalogCard | null, entries: DeckEntry[]): string {
  const data = {
    l: leader?.sku || null,
    c: entries.map((e) => `${e.card.sku}:${e.quantity}`),
  };
  return btoa(JSON.stringify(data));
}

function setGroupOrder(code: string): number {
  const prefix = code.replace(/[0-9-].*/, "");
  const order: Record<string, number> = { OP: 0, EB: 1, ST: 2, PRB: 3, PCC: 4, P: 5, PROMO: 6 };
  return order[prefix] ?? 8;
}

/* ------------------------------------------------------------------ */
/*  Skeleton loaders                                                   */
/* ------------------------------------------------------------------ */

function SkeletonCard() {
  return (
    <div className="bg-neutral-900 rounded-lg p-2 animate-pulse">
      <div className="aspect-[2.5/3.5] bg-neutral-800 rounded mb-2" />
      <div className="h-3 bg-neutral-800 rounded w-3/4 mb-1" />
      <div className="h-3 bg-neutral-800 rounded w-1/2" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export default function DeckBuilderPage() {
  /* ---- Deck state ---- */
  const [leader, setLeader] = useState<CatalogCard | null>(null);
  const [deckEntries, setDeckEntries] = useState<DeckEntry[]>([]);
  const [deckName, setDeckName] = useState("My Deck");

  /* ---- Search state ---- */
  const [cards, setCards] = useState<CatalogCard[]>([]);
  const [sets, setSets] = useState<SetInfo[]>([]);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [activeSet, setActiveSet] = useState<string | null>(null);
  const [activeRarity, setActiveRarity] = useState("");
  const [loading, setLoading] = useState(true);
  const [setsLoading, setSetsLoading] = useState(true);
  const [searchTotal, setSearchTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const limit = 48;

  /* ---- UI state ---- */
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [savedDecks, setSavedDecks] = useState<SavedDeck[]>([]);
  const [leaderSearchMode, setLeaderSearchMode] = useState(false);
  const [mobileShowDeck, setMobileShowDeck] = useState(false);
  const [showSimulator, setShowSimulator] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  // Save-metadata state — only relevant when save modal is open. Reset when
  // the modal opens so each save starts from a clean slate.
  const [saveIsPublic, setSaveIsPublic] = useState(false);
  const [saveTagsRaw, setSaveTagsRaw] = useState("");
  const [saveNotes, setSaveNotes] = useState("");

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { toast } = useToast();

  /* ---- Derived values ---- */
  const totalCards = useMemo(
    () => deckEntries.reduce((sum, e) => sum + e.quantity, 0),
    [deckEntries]
  );

  const totalValue = useMemo(
    () => deckEntries.reduce((sum, e) => sum + e.card.spot_price * e.quantity, 0),
    [deckEntries]
  );

  const leaderValue = leader ? leader.spot_price : 0;
  const fullDeckValue = totalValue + leaderValue;

  const deckWarnings = useMemo(() => {
    const warns: string[] = [];
    if (totalCards > MAX_DECK_SIZE)
      warns.push(`Deck has ${totalCards} cards (max ${MAX_DECK_SIZE})`);
    for (const entry of deckEntries) {
      if (entry.quantity > MAX_COPIES)
        warns.push(`${entry.card.name} exceeds ${MAX_COPIES}-copy limit (${entry.quantity})`);
    }
    return warns;
  }, [deckEntries, totalCards]);

  /* ---- Debounced search ---- */
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(query);
      setOffset(0);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  /* ---- Fetch sets ---- */
  useEffect(() => {
    (async () => {
      setSetsLoading(true);
      try {
        const res = await fetch("/api/market/catalog?view=sets&game=one-piece");
        if (!res.ok) throw new Error("Failed");
        const data = await res.json();
        const sorted = (data.sets ?? []).sort((a: SetInfo, b: SetInfo) => {
          const gA = setGroupOrder(a.code);
          const gB = setGroupOrder(b.code);
          if (gA !== gB) return gA - gB;
          return a.code.localeCompare(b.code, undefined, { numeric: true });
        });
        setSets(sorted);
      } catch {
        setSets([]);
      } finally {
        setSetsLoading(false);
      }
    })();
  }, []);

  /* ---- Fetch cards ---- */
  const fetchCards = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        game: "one-piece",
        sort: "name_asc",
        limit: String(limit),
        offset: String(offset),
      });
      if (activeSet) params.set("set", activeSet);
      if (debouncedQuery) params.set("q", debouncedQuery);
      const res = await fetch(`/api/market/catalog?${params}`);
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setCards(data.cards ?? []);
      setSearchTotal(data.total ?? 0);
    } catch {
      setCards([]);
      setSearchTotal(0);
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery, offset, activeSet]);

  useEffect(() => {
    fetchCards();
  }, [fetchCards]);

  /* ---- Load saved decks — prefer server for signed-in users ---- */
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/decks");
        if (res.status === 401) {
          // Anonymous — fall back to localStorage.
          setSignedIn(false);
          const stored = localStorage.getItem(STORAGE_KEY);
          if (stored) setSavedDecks(JSON.parse(stored));
          return;
        }
        if (res.ok) {
          setSignedIn(true);
          const data = await res.json();
          // Map server decks to the existing SavedDeck shape the UI uses.
          type ServerDeck = {
            name: string;
            leader_sku: string | null;
            entries: { sku: string; quantity: number; card: CatalogCard }[];
            updated_at: string;
          };
          const decks: SavedDeck[] = (data.decks ?? []).map((d: ServerDeck) => {
            const leaderEntry = d.entries.find((e) => e.sku === d.leader_sku);
            return {
              name: d.name,
              leader: leaderEntry?.card ?? null,
              entries: d.entries.filter((e) => e.sku !== d.leader_sku),
              savedAt: d.updated_at,
            };
          });
          setSavedDecks(decks);
          return;
        }
      } catch {
        /* fall through to localStorage */
      }
      // Fallback
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) setSavedDecks(JSON.parse(stored));
      } catch { /* ignore */ }
    })();
  }, []);

  /* ---- Filtered cards (client-side rarity filter) ---- */
  const filteredCards = useMemo(() => {
    if (!activeRarity) return cards;
    return cards.filter(
      (c) => c.rarity && c.rarity.toUpperCase() === activeRarity.toUpperCase()
    );
  }, [cards, activeRarity]);

  /* ---- Deck operations ---- */
  function addToDeck(card: CatalogCard) {
    setDeckEntries((prev) => {
      const existing = prev.find((e) => e.card.sku === card.sku);
      if (existing) {
        if (existing.quantity >= MAX_COPIES) {
          toast(`Max ${MAX_COPIES} copies of ${card.name}`, "warning");
          return prev;
        }
        return prev.map((e) =>
          e.card.sku === card.sku ? { ...e, quantity: e.quantity + 1 } : e
        );
      }
      if (totalCards >= MAX_DECK_SIZE) {
        toast(`Deck is full (${MAX_DECK_SIZE} cards)`, "warning");
        return prev;
      }
      return [...prev, { card, quantity: 1 }];
    });
  }

  function removeFromDeck(sku: string) {
    setDeckEntries((prev) => {
      const existing = prev.find((e) => e.card.sku === sku);
      if (!existing) return prev;
      if (existing.quantity <= 1) {
        return prev.filter((e) => e.card.sku !== sku);
      }
      return prev.map((e) =>
        e.card.sku === sku ? { ...e, quantity: e.quantity - 1 } : e
      );
    });
  }

  function clearDeck() {
    setLeader(null);
    setDeckEntries([]);
    setDeckName("My Deck");
    setShowClearConfirm(false);
    toast("Deck cleared", "info");
  }

  function selectLeader(card: CatalogCard) {
    setLeader(card);
    setLeaderSearchMode(false);
    toast(`${card.name} set as Leader`, "success");
  }

  /* ---- Save / Load ---- */
  async function saveDeck() {
    const deck: SavedDeck = {
      name: deckName,
      leader,
      entries: deckEntries.map((e) => ({
        sku: e.card.sku,
        quantity: e.quantity,
        card: e.card,
      })),
      savedAt: new Date().toISOString(),
    };

    // Signed-in users hit the server (cross-device sync). Anonymous users
    // stick with localStorage. The local cache is kept in sync in both
    // cases so reloading the page doesn't flash an empty list.
    if (signedIn) {
      // Build the server-side entry list (includes leader for snapshot).
      const serverEntries = deckEntries.map((e) => ({
        sku: e.card.sku,
        quantity: e.quantity,
        card: e.card,
      }));
      if (leader) {
        serverEntries.unshift({ sku: leader.sku, quantity: 1, card: leader });
      }
      const tags = saveTagsRaw
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 10);
      try {
        const res = await fetch("/api/decks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: deckName,
            leader_sku: leader?.sku ?? null,
            entries: serverEntries,
            is_public: saveIsPublic,
            tags,
            notes: saveNotes.trim() || undefined,
          }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          toast(d.error || "Save failed.", "error");
          return;
        }
      } catch {
        toast("Network error — saved locally only.", "warning");
      }
    }

    const updated = [...savedDecks.filter((d) => d.name !== deckName), deck];
    setSavedDecks(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    setShowSaveModal(false);
    toast(`Deck "${deckName}" saved${signedIn ? " (synced)" : ""}`, "success");
  }

  function loadDeck(deck: SavedDeck) {
    setLeader(deck.leader);
    setDeckEntries(
      deck.entries.map((e) => ({ card: e.card, quantity: e.quantity }))
    );
    setDeckName(deck.name);
    setShowLoadModal(false);
    toast(`Loaded "${deck.name}"`, "success");
  }

  async function deleteSavedDeck(name: string) {
    if (signedIn) {
      try {
        // Server-side delete — look up by name via the list, then DELETE by id.
        // (We don't have the id in client state yet, so fetch once.)
        const list = await fetch("/api/decks").then((r) => (r.ok ? r.json() : null));
        const target = list?.decks?.find((d: { name: string; id: string }) => d.name === name);
        if (target?.id) {
          await fetch(`/api/decks/${target.id}`, { method: "DELETE" });
        }
      } catch {
        /* fall through to local removal */
      }
    }
    const updated = savedDecks.filter((d) => d.name !== name);
    setSavedDecks(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    toast(`Deleted "${name}"`, "info");
  }

  /* ---- Share ---- */
  /* ---- Bulk import ---- */
  async function handleBulkImport(entries: ParsedEntry[]): Promise<{ added: number; notFound: string[] }> {
    // Resolve each card number to a catalog card. We fire the lookups in
    // parallel — the catalog API supports search-by-card-number via the ?q=
    // param (substring match on SKU).
    const resolved: Array<{ parsed: ParsedEntry; card: CatalogCard | null }> = await Promise.all(
      entries.map(async (p) => {
        try {
          const res = await fetch(
            `/api/market/catalog?game=one-piece&q=${encodeURIComponent(p.cardNumber)}&limit=5`,
          );
          if (!res.ok) return { parsed: p, card: null };
          const d = await res.json();
          // Prefer exact card_number match when multiple cards come back
          const cards: CatalogCard[] = d.cards ?? [];
          const exact = cards.find((c) => c.card_number.toUpperCase() === p.cardNumber);
          return { parsed: p, card: exact ?? cards[0] ?? null };
        } catch {
          return { parsed: p, card: null };
        }
      }),
    );

    const notFound: string[] = [];
    let added = 0;

    // Apply to deck state. Leader lines take over the leader slot; others
    // go to deckEntries, respecting MAX_COPIES.
    const newEntries = [...deckEntries];
    let newLeader = leader;

    for (const { parsed, card } of resolved) {
      if (!card) { notFound.push(parsed.cardNumber); continue; }
      if (parsed.isLeader) {
        newLeader = card;
        added += 1;
        continue;
      }
      const existingIdx = newEntries.findIndex((e) => e.card.sku === card.sku);
      if (existingIdx >= 0) {
        const current = newEntries[existingIdx];
        const want = current.quantity + parsed.quantity;
        const capped = Math.min(MAX_COPIES, want);
        newEntries[existingIdx] = { ...current, quantity: capped };
        added += capped - current.quantity;
      } else {
        const capped = Math.min(MAX_COPIES, parsed.quantity);
        newEntries.push({ card, quantity: capped });
        added += capped;
      }
    }

    setLeader(newLeader);
    setDeckEntries(newEntries);

    if (added > 0) toast(`Imported ${added} card${added === 1 ? "" : "s"}`, "success");
    return { added, notFound };
  }

  function shareDeck() {
    const encoded = encodeDeck(leader, deckEntries);
    const url = `${window.location.origin}/deck-builder?deck=${encoded}`;
    navigator.clipboard.writeText(url).then(
      () => toast("Share link copied to clipboard", "success"),
      () => toast("Failed to copy link", "error")
    );
  }

  /* ---- Export ---- */
  function exportDeck() {
    const lines: string[] = [];
    if (leader) lines.push(`// Leader: ${leader.card_number} ${leader.name}`);
    lines.push(`// DON!! x${DON_COUNT}`);
    lines.push("");
    for (const entry of deckEntries) {
      lines.push(`${entry.quantity}x ${entry.card.card_number} ${entry.card.name}`);
    }
    lines.push("");
    lines.push(`// Total: ${totalCards}/${MAX_DECK_SIZE} cards`);
    lines.push(`// Value: ${formatPrice(fullDeckValue)}`);

    const text = lines.join("\n");
    navigator.clipboard.writeText(text).then(
      () => toast("Deck list copied to clipboard", "success"),
      () => toast("Failed to copy deck list", "error")
    );
  }

  /* ---- Load deck from URL on mount ---- */
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const deckParam = params.get("deck");
      if (!deckParam) return;

      const data = JSON.parse(atob(deckParam));
      if (!data || !data.c) return;

      // We need to fetch the cards by SKU — for now, store SKU references
      // and load them when the catalog loads
      toast("Loading shared deck...", "info");

      // Fetch all referenced SKUs
      const skuQuantities = (data.c as string[]).map((s: string) => {
        const [sku, qty] = s.split(":");
        return { sku, quantity: parseInt(qty, 10) };
      });

      const allSkus = [...(data.l ? [data.l] : []), ...skuQuantities.map((sq) => sq.sku)];

      // Fetch cards in batches by searching for them
      Promise.all(
        allSkus.map((sku: string) =>
          fetch(`/api/market/catalog?game=one-piece&q=${sku}&limit=1`)
            .then((r) => r.json())
            .then((d) => d.cards?.[0] || null)
            .catch(() => null)
        )
      ).then((results) => {
        const cardMap = new Map<string, CatalogCard>();
        for (const card of results) {
          if (card) cardMap.set(card.sku, card);
        }

        if (data.l && cardMap.has(data.l)) {
          setLeader(cardMap.get(data.l)!);
        }

        const entries: DeckEntry[] = [];
        for (const sq of skuQuantities) {
          const card = cardMap.get(sq.sku);
          if (card) entries.push({ card, quantity: sq.quantity });
        }
        setDeckEntries(entries);
        toast("Shared deck loaded", "success");
      });
    } catch {
      /* ignore invalid deck param */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---- Pagination ---- */
  const totalPages = Math.ceil(searchTotal / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  /* ---- Render ---- */
  return (
    <div className="min-h-screen bg-neutral-950">
      <div className="max-w-[1600px] mx-auto px-4 py-8">
        {/* ========== HEADER ========== */}
        <div className="mb-6">
          <h1 className="text-3xl font-black text-white mb-1">
            Deck Builder
          </h1>
          <p className="text-neutral-400 text-sm">
            Build a 50-card One Piece TCG deck. Select a Leader, add cards, and
            buy what you need.
          </p>
        </div>

        {/* ========== LEADER SECTION ========== */}
        <div className="mb-6 bg-neutral-900 border border-neutral-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-neutral-400 uppercase tracking-wider">
              Leader Card
            </h2>
            {leader && (
              <button
                onClick={() => {
                  setLeader(null);
                  toast("Leader removed", "info");
                }}
                className="text-xs text-red-400 hover:text-red-300 transition"
              >
                Remove Leader
              </button>
            )}
          </div>

          {leader ? (
            <div className="flex items-center gap-4">
              {leader.image_url ? (
                <img
                  src={leader.image_url}
                  alt={leader.name}
                  className="w-20 h-28 object-cover rounded-lg shadow-lg shadow-amber-500/10"
                />
              ) : (
                <div className="w-20 h-28 bg-neutral-800 rounded-lg flex items-center justify-center">
                  <span className="text-neutral-600 text-[10px]">N/A</span>
                </div>
              )}
              <div>
                <h3 className="text-lg font-bold text-white">{leader.name}</h3>
                <p className="text-xs text-neutral-400 font-mono">
                  {leader.card_number} &middot; {leader.set_code}
                </p>
                {rarityBadge(leader.rarity)}
                <p className="text-sm text-amber-400 font-semibold mt-1">
                  {formatPrice(leader.spot_price)}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center py-4 gap-3">
              <div className="w-16 h-22 rounded-lg border-2 border-dashed border-neutral-700 flex items-center justify-center">
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="text-neutral-600"
                >
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </div>
              <p className="text-sm text-neutral-500">
                Select your Leader to start building
              </p>
              <button
                onClick={() => {
                  setLeaderSearchMode(true);
                  setActiveRarity("L");
                }}
                className="px-4 py-2 bg-amber-500 text-black text-sm font-bold rounded-lg hover:bg-amber-400 transition"
              >
                Search for Leader
              </button>
            </div>
          )}
        </div>

        {/* ========== MAIN LAYOUT: Search + Deck ========== */}
        <div className="flex flex-col lg:flex-row gap-6">
          {/* ======== LEFT: Card Search & Filter ======== */}
          <div className="flex-1 min-w-0 lg:w-[60%]">
            {/* Leader search mode banner */}
            {leaderSearchMode && (
              <div className="mb-4 bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3 flex items-center justify-between">
                <p className="text-sm text-amber-400 font-medium">
                  Selecting a Leader card — click a card to set as Leader
                </p>
                <button
                  onClick={() => {
                    setLeaderSearchMode(false);
                    setActiveRarity("");
                  }}
                  className="text-xs text-amber-400 hover:text-amber-300 underline"
                >
                  Cancel
                </button>
              </div>
            )}

            {/* Search + Filters */}
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              {/* Search input */}
              <div className="relative flex-1">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search cards by name or card number..."
                  className="w-full px-4 py-2.5 bg-neutral-900 border border-neutral-800 rounded-lg text-white placeholder:text-neutral-500 focus:outline-none focus:border-amber-500/50 transition text-sm"
                />
                {query && (
                  <button
                    onClick={() => setQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white transition text-sm"
                  >
                    x
                  </button>
                )}
              </div>

              {/* Set filter */}
              <select
                value={activeSet || ""}
                onChange={(e) => {
                  setActiveSet(e.target.value || null);
                  setOffset(0);
                }}
                className="px-3 py-2.5 bg-neutral-900 border border-neutral-800 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500/50 transition min-w-[140px]"
              >
                <option value="">All Sets</option>
                {setsLoading && <option disabled>Loading...</option>}
                {sets.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.code} — {s.name}
                  </option>
                ))}
              </select>

              {/* Rarity filter */}
              <select
                value={activeRarity}
                onChange={(e) => setActiveRarity(e.target.value)}
                className="px-3 py-2.5 bg-neutral-900 border border-neutral-800 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500/50 transition min-w-[130px]"
              >
                {RARITY_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Results count */}
            {!loading && (
              <p className="text-xs text-neutral-500 mb-3">
                Showing {filteredCards.length} of {searchTotal.toLocaleString()}{" "}
                cards
                {activeRarity
                  ? ` (filtered to ${activeRarity})`
                  : ""}
              </p>
            )}

            {/* Loading skeletons */}
            {loading && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
                {Array.from({ length: 10 }).map((_, i) => (
                  <SkeletonCard key={i} />
                ))}
              </div>
            )}

            {/* Empty state */}
            {!loading && filteredCards.length === 0 && (
              <div className="text-center py-16">
                <p className="text-4xl mb-3 opacity-20">No results</p>
                <h2 className="text-lg font-bold text-white mb-2">
                  No cards found
                </h2>
                <p className="text-neutral-400 text-sm mb-4">
                  Try a different search term, set, or rarity filter.
                </p>
                {(query || activeSet || activeRarity) && (
                  <button
                    onClick={() => {
                      setQuery("");
                      setActiveSet(null);
                      setActiveRarity("");
                    }}
                    className="px-4 py-2 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400 transition text-sm"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            )}

            {/* Card results grid */}
            {!loading && filteredCards.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
                {filteredCards.map((card) => {
                  const inDeck = deckEntries.find(
                    (e) => e.card.sku === card.sku
                  );
                  const isLeader = leader?.sku === card.sku;

                  return (
                    <div
                      key={card.sku}
                      className={`bg-neutral-900 rounded-xl p-2 hover:bg-neutral-800/80 transition group relative ${
                        isLeader ? "ring-2 ring-amber-500" : ""
                      } ${inDeck ? "ring-1 ring-emerald-500/50" : ""}`}
                    >
                      {/* Image */}
                      {card.image_url ? (
                        <img
                          src={card.image_url}
                          alt={card.name}
                          className="aspect-[2.5/3.5] w-full object-cover rounded-lg mb-2 group-hover:scale-[1.02] transition"
                          loading="lazy"
                        />
                      ) : (
                        <div className="aspect-[2.5/3.5] w-full bg-neutral-800 rounded-lg mb-2 flex items-center justify-center">
                          <span className="text-neutral-600 text-xs">
                            No Image
                          </span>
                        </div>
                      )}

                      {/* Quantity badge */}
                      {inDeck && (
                        <div className="absolute top-1 right-1 w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center">
                          <span className="text-[10px] font-bold text-black">
                            {inDeck.quantity}
                          </span>
                        </div>
                      )}

                      {/* Leader badge */}
                      {isLeader && (
                        <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-amber-500 rounded text-[9px] font-bold text-black">
                          LEADER
                        </div>
                      )}

                      {/* Info */}
                      <h3 className="text-xs font-semibold text-white truncate">
                        {card.name}
                      </h3>
                      <p className="text-[10px] text-neutral-500 mb-1 truncate">
                        {card.card_number} &middot; {card.set_code}
                      </p>
                      <div className="flex items-center gap-1 mb-2">
                        {rarityBadge(card.rarity)}
                        <span className="text-xs font-bold text-amber-400">
                          {formatPrice(card.spot_price)}
                        </span>
                      </div>

                      {/* Action buttons */}
                      <div className="flex gap-1">
                        {leaderSearchMode ? (
                          <button
                            onClick={() => selectLeader(card)}
                            className="flex-1 py-1.5 text-[11px] font-bold bg-amber-500 text-black rounded-lg hover:bg-amber-400 transition"
                          >
                            Set as Leader
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={() => addToDeck(card)}
                              className="flex-1 py-1.5 text-[11px] font-bold bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 transition"
                            >
                              + Add
                            </button>
                            {!leader &&
                              card.rarity?.toUpperCase() === "L" && (
                                <button
                                  onClick={() => selectLeader(card)}
                                  className="py-1.5 px-2 text-[11px] font-bold bg-amber-500 text-black rounded-lg hover:bg-amber-400 transition"
                                  title="Set as Leader"
                                >
                                  L
                                </button>
                              )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Pagination */}
            {!loading && totalPages > 1 && (
              <div className="flex justify-center items-center gap-2 mt-6">
                <button
                  onClick={() => setOffset(Math.max(0, offset - limit))}
                  disabled={offset === 0}
                  className="px-3 py-2 bg-neutral-900 text-neutral-300 rounded-lg hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed transition text-sm"
                >
                  Previous
                </button>
                {(() => {
                  const pages: number[] = [];
                  let start = Math.max(1, currentPage - 2);
                  const end = Math.min(totalPages, start + 4);
                  start = Math.max(1, end - 4);
                  for (let p = start; p <= end; p++) pages.push(p);
                  return pages.map((p) => (
                    <button
                      key={p}
                      onClick={() => setOffset((p - 1) * limit)}
                      className={`w-9 h-9 rounded-lg text-sm transition ${
                        p === currentPage
                          ? "bg-amber-500 text-black font-bold"
                          : "bg-neutral-900 text-neutral-300 hover:bg-neutral-800"
                      }`}
                    >
                      {p}
                    </button>
                  ));
                })()}
                <button
                  onClick={() => setOffset(offset + limit)}
                  disabled={currentPage >= totalPages}
                  className="px-3 py-2 bg-neutral-900 text-neutral-300 rounded-lg hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed transition text-sm"
                >
                  Next
                </button>
              </div>
            )}
          </div>

          {/* ======== RIGHT: Deck List (desktop) / Toggle (mobile) ======== */}
          <div className="lg:w-[40%] lg:min-w-[360px]">
            {/* Mobile toggle */}
            <div className="lg:hidden mb-3">
              <button
                onClick={() => setMobileShowDeck(!mobileShowDeck)}
                className="w-full py-3 bg-neutral-900 border border-neutral-800 rounded-lg text-white text-sm font-bold flex items-center justify-center gap-2"
              >
                <span>
                  Deck ({totalCards}/{MAX_DECK_SIZE})
                </span>
                <span className="text-amber-400">{formatPrice(fullDeckValue)}</span>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="currentColor"
                  className={`transition ${mobileShowDeck ? "rotate-180" : ""}`}
                >
                  <path d="M2 4l4 4 4-4" />
                </svg>
              </button>
            </div>

            <div
              className={`${
                mobileShowDeck ? "block" : "hidden"
              } lg:block lg:sticky lg:top-4`}
            >
              {/* Deck container */}
              <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
                {/* Deck header */}
                <div className="px-4 py-3 border-b border-neutral-800">
                  <div className="flex items-center justify-between mb-2">
                    <input
                      type="text"
                      value={deckName}
                      onChange={(e) => setDeckName(e.target.value)}
                      className="bg-transparent text-white font-bold text-lg focus:outline-none border-b border-transparent focus:border-amber-500/50 transition"
                      placeholder="Deck name..."
                    />
                    <div className="flex gap-1">
                      <button
                        onClick={() => {
                          // Reset save-metadata state each time the modal opens.
                          setSaveIsPublic(false);
                          setSaveTagsRaw("");
                          setSaveNotes("");
                          setShowSaveModal(true);
                        }}
                        className="p-1.5 text-neutral-400 hover:text-white transition rounded"
                        title="Save Deck"
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <path d="M13 5v8a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1h6l3 3z" />
                          <path d="M10 2v3h3" />
                          <path d="M6 9h4M6 11h2" />
                        </svg>
                      </button>
                      <button
                        onClick={() => {
                          try {
                            const stored = localStorage.getItem(STORAGE_KEY);
                            if (stored) setSavedDecks(JSON.parse(stored));
                          } catch { /* ignore */ }
                          setShowLoadModal(true);
                        }}
                        className="p-1.5 text-neutral-400 hover:text-white transition rounded"
                        title="Load Deck"
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <path d="M2 4h4l2 2h6v7a1 1 0 01-1 1H3a1 1 0 01-1-1V4z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => setShowSimulator(true)}
                        disabled={totalCards < 5}
                        className="p-1.5 text-neutral-400 hover:text-amber-400 transition rounded disabled:opacity-30 disabled:cursor-not-allowed"
                        title={totalCards < 5 ? "Add 5+ cards to simulate" : "Simulate opening hand"}
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <rect x="1" y="4" width="10" height="9" rx="1.5" />
                          <rect x="4" y="2" width="10" height="9" rx="1.5" />
                        </svg>
                      </button>
                      <button
                        onClick={() => setShowBulkImport(true)}
                        className="p-1.5 text-neutral-400 hover:text-amber-400 transition rounded"
                        title="Paste a decklist to import"
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <path d="M8 2v9" />
                          <path d="M4 7l4 4 4-4" />
                          <path d="M2 13h12" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Card counts */}
                  <div className="flex items-center gap-3 text-xs">
                    <span
                      className={`font-bold ${
                        totalCards === MAX_DECK_SIZE
                          ? "text-emerald-400"
                          : totalCards > MAX_DECK_SIZE
                          ? "text-red-400"
                          : "text-neutral-300"
                      }`}
                    >
                      {totalCards}/{MAX_DECK_SIZE} cards
                    </span>
                    <span className="text-neutral-500">|</span>
                    <span className="text-neutral-400">
                      DON!! {DON_COUNT}/{DON_COUNT}
                    </span>
                    <span className="text-neutral-500">|</span>
                    <span className="text-amber-400 font-semibold">
                      {formatPrice(fullDeckValue)}
                    </span>
                  </div>
                </div>

                {/* Warnings */}
                {deckWarnings.length > 0 && (
                  <div className="px-4 py-2 bg-red-500/10 border-b border-red-500/20">
                    {deckWarnings.map((w, i) => (
                      <p key={i} className="text-[11px] text-red-400">
                        {w}
                      </p>
                    ))}
                  </div>
                )}

                {/* Deck Stats */}
                {deckEntries.length > 0 && (
                  <div className="px-4 py-3 border-b border-neutral-800">
                    <h3 className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-2">
                      Stats
                    </h3>
                    <DeckStatsPanel
                      leader={leader}
                      entries={deckEntries}
                      totalCards={totalCards}
                      maxDeckSize={MAX_DECK_SIZE}
                    />
                  </div>
                )}

                {/* Deck list */}
                <div className="max-h-[400px] overflow-y-auto">
                  {deckEntries.length === 0 ? (
                    <div className="px-4 py-8 text-center">
                      <p className="text-neutral-500 text-sm">
                        No cards added yet
                      </p>
                      <p className="text-neutral-600 text-xs mt-1">
                        Search and add cards from the left panel
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-neutral-800/50">
                      {deckEntries.map((entry) => (
                        <div
                          key={entry.card.sku}
                          className="flex items-center gap-3 px-4 py-2 hover:bg-neutral-800/50 transition"
                        >
                          {/* Thumbnail */}
                          {entry.card.image_url ? (
                            <img
                              src={entry.card.image_url}
                              alt={entry.card.name}
                              className="w-8 h-11 object-cover rounded shrink-0"
                              loading="lazy"
                            />
                          ) : (
                            <div className="w-8 h-11 bg-neutral-800 rounded shrink-0 flex items-center justify-center">
                              <span className="text-neutral-600 text-[8px]">
                                N/A
                              </span>
                            </div>
                          )}

                          {/* Card info */}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-white truncate">
                              {entry.card.name}
                            </p>
                            <p className="text-[10px] text-neutral-500">
                              {entry.card.card_number} &middot;{" "}
                              {formatPrice(
                                entry.card.spot_price * entry.quantity
                              )}
                            </p>
                          </div>

                          {/* Quantity controls */}
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => removeFromDeck(entry.card.sku)}
                              className="w-6 h-6 flex items-center justify-center bg-neutral-800 text-neutral-300 rounded hover:bg-red-500/20 hover:text-red-400 transition text-xs font-bold"
                            >
                              -
                            </button>
                            <span className="w-6 text-center text-xs font-bold text-white">
                              {entry.quantity}
                            </span>
                            <button
                              onClick={() => addToDeck(entry.card)}
                              className="w-6 h-6 flex items-center justify-center bg-neutral-800 text-neutral-300 rounded hover:bg-emerald-500/20 hover:text-emerald-400 transition text-xs font-bold"
                              disabled={entry.quantity >= MAX_COPIES}
                            >
                              +
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Deck value summary */}
                {deckEntries.length > 0 && (
                  <div className="px-4 py-3 border-t border-neutral-800 bg-neutral-900">
                    <div className="flex justify-between text-sm">
                      <span className="text-neutral-400">
                        Deck value{leader ? " (incl. Leader)" : ""}
                      </span>
                      <span className="text-amber-400 font-bold">
                        {formatPrice(fullDeckValue)}
                      </span>
                    </div>
                  </div>
                )}

                {/* Action buttons */}
                <div className="px-4 py-3 border-t border-neutral-800 space-y-2">
                  {/* Buy Missing */}
                  {deckEntries.length > 0 && (
                    <button
                      onClick={() => {
                        // Open each card's market page
                        const skus = deckEntries.map((e) => e.card.sku);
                        // Open first card, rest can be navigated
                        if (skus.length > 0) {
                          window.open(`/market/${skus[0]}`, "_blank");
                        }
                        toast(
                          `${skus.length} cards — visit each card's market page to buy`,
                          "info"
                        );
                      }}
                      className="w-full py-2.5 bg-emerald-600 text-white text-sm font-bold rounded-lg hover:bg-emerald-500 transition"
                    >
                      Buy Missing Cards
                    </button>
                  )}

                  {/* Action row */}
                  <div className="flex gap-2">
                    <button
                      onClick={shareDeck}
                      disabled={deckEntries.length === 0}
                      className="flex-1 py-2 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition"
                    >
                      Share
                    </button>
                    <button
                      onClick={exportDeck}
                      disabled={deckEntries.length === 0}
                      className="flex-1 py-2 bg-neutral-800 text-neutral-300 text-xs font-bold rounded-lg hover:bg-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
                    >
                      Export
                    </button>
                    <button
                      onClick={() => setShowClearConfirm(true)}
                      disabled={deckEntries.length === 0 && !leader}
                      className="flex-1 py-2 bg-neutral-800 text-red-400 text-xs font-bold rounded-lg hover:bg-red-500/10 disabled:opacity-40 disabled:cursor-not-allowed transition"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ========== Mobile sticky summary bar ========== */}
        <div className="fixed bottom-0 left-0 right-0 z-30 lg:hidden border-t border-neutral-800">
          <div className="bg-neutral-900/95 backdrop-blur">
            <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-sm font-bold text-white shrink-0">
                  {totalCards}/{MAX_DECK_SIZE}
                </span>
                <span className="text-xs text-amber-400 font-semibold">
                  {formatPrice(fullDeckValue)}
                </span>
              </div>
              <button
                onClick={() => setMobileShowDeck(true)}
                className="px-4 py-2 bg-amber-500 text-black text-sm font-bold rounded-lg hover:bg-amber-400 transition shrink-0"
              >
                View Deck
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ========== MODALS ========== */}

      {/* Clear confirm */}
      <ConfirmModal
        open={showClearConfirm}
        title="Clear Deck"
        message="Remove all cards and the Leader from your deck? This cannot be undone."
        confirmLabel="Clear Deck"
        cancelLabel="Keep"
        variant="danger"
        onConfirm={clearDeck}
        onCancel={() => setShowClearConfirm(false)}
      />

      {/* Save deck modal */}
      {showSaveModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowSaveModal(false);
          }}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-white mb-4">Save Deck</h3>
            <label className="text-[11px] uppercase tracking-wider text-neutral-500 font-bold">Name</label>
            <input
              type="text"
              value={deckName}
              onChange={(e) => setDeckName(e.target.value)}
              placeholder="Deck name..."
              className="w-full mt-1 px-4 py-2.5 bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder:text-neutral-500 focus:outline-none focus:border-amber-500/50 transition text-sm"
            />

            {signedIn && (
              <>
                <label className="text-[11px] uppercase tracking-wider text-neutral-500 font-bold mt-4 block">
                  Tags <span className="text-neutral-600 normal-case">(comma separated, max 10)</span>
                </label>
                <input
                  type="text"
                  value={saveTagsRaw}
                  onChange={(e) => setSaveTagsRaw(e.target.value)}
                  placeholder="aggro, budget, tournament-ready"
                  className="w-full mt-1 px-4 py-2.5 bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder:text-neutral-500 focus:outline-none focus:border-amber-500/50 transition text-sm"
                />

                <label className="text-[11px] uppercase tracking-wider text-neutral-500 font-bold mt-4 block">
                  Notes <span className="text-neutral-600 normal-case">(optional, 2000 char max)</span>
                </label>
                <textarea
                  value={saveNotes}
                  onChange={(e) => setSaveNotes(e.target.value.slice(0, 2000))}
                  placeholder="Deck guide, mulligan priorities, tech choices..."
                  rows={4}
                  className="w-full mt-1 px-4 py-2.5 bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder:text-neutral-500 focus:outline-none focus:border-amber-500/50 transition text-sm resize-y"
                />

                <label className="flex items-start gap-3 mt-4 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={saveIsPublic}
                    onChange={(e) => setSaveIsPublic(e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-amber-500"
                  />
                  <div>
                    <p className="text-sm font-semibold text-white">Publish to community</p>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      Listed at /decks so other players can read and copy it.
                      You can un-publish later by re-saving with this unchecked.
                    </p>
                  </div>
                </label>
              </>
            )}

            {!signedIn && (
              <div className="mt-4 bg-amber-900/20 border border-amber-700/40 text-amber-300 rounded-lg px-3 py-2 text-xs">
                Sign in to save to your account, publish publicly, and sync across devices.
              </div>
            )}

            <p className="text-xs text-neutral-500 mt-4">
              {totalCards} cards &middot; {formatPrice(fullDeckValue)}
              {leader ? ` · Leader: ${leader.name}` : ""}
            </p>

            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setShowSaveModal(false)}
                className="flex-1 py-2.5 px-4 bg-neutral-800 text-neutral-300 text-sm font-medium rounded-lg hover:bg-neutral-700 transition"
              >
                Cancel
              </button>
              <button
                onClick={saveDeck}
                className="flex-1 py-2.5 px-4 bg-amber-500 text-black text-sm font-bold rounded-lg hover:bg-amber-400 transition"
              >
                {saveIsPublic ? "Save & Publish" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Load deck modal */}
      {showLoadModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowLoadModal(false);
          }}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-white mb-4">Load Deck</h3>
            {savedDecks.length === 0 ? (
              <p className="text-sm text-neutral-400 py-4 text-center">
                No saved decks found.
              </p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {savedDecks.map((deck) => (
                  <div
                    key={deck.name}
                    className="flex items-center justify-between p-3 bg-neutral-800 rounded-lg hover:bg-neutral-750 transition"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-white truncate">
                        {deck.name}
                      </p>
                      <p className="text-[11px] text-neutral-500">
                        {deck.entries.reduce((s, e) => s + e.quantity, 0)} cards
                        &middot;{" "}
                        {deck.leader ? `Leader: ${deck.leader.name}` : "No leader"}
                        &middot;{" "}
                        {new Date(deck.savedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex gap-1 shrink-0 ml-2">
                      <button
                        onClick={() => loadDeck(deck)}
                        className="px-3 py-1.5 bg-amber-500 text-black text-xs font-bold rounded hover:bg-amber-400 transition"
                      >
                        Load
                      </button>
                      <button
                        onClick={() => deleteSavedDeck(deck.name)}
                        className="px-2 py-1.5 bg-neutral-700 text-red-400 text-xs font-bold rounded hover:bg-red-500/20 transition"
                      >
                        x
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={() => setShowLoadModal(false)}
              className="w-full mt-4 py-2.5 bg-neutral-800 text-neutral-300 text-sm font-medium rounded-lg hover:bg-neutral-700 transition"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Hand Simulator */}
      {showSimulator && (
        <HandSimulator
          leader={leader}
          entries={deckEntries.map((e) => ({
            card: {
              sku: e.card.sku,
              card_number: e.card.card_number,
              name: e.card.name,
              rarity: e.card.rarity,
              image_url: e.card.image_url,
            },
            quantity: e.quantity,
          }))}
          onClose={() => setShowSimulator(false)}
        />
      )}

      {/* Bulk Import */}
      {showBulkImport && (
        <BulkImport
          onClose={() => setShowBulkImport(false)}
          onImport={handleBulkImport}
        />
      )}
    </div>
  );
}
