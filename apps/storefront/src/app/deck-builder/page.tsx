"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import Image from "next/image";
import ConfirmModal from "@/components/ui/ConfirmModal";
import { useToast } from "@/components/ui/Toast";
import HandSimulator from "@/components/deck-builder/HandSimulator";
import DeckStatsPanel from "@/components/deck-builder/DeckStatsPanel";
import BulkImport, { type ParsedEntry } from "@/components/deck-builder/BulkImport";
import { normalizeRarity } from "@/components/deck-builder/rarity";
import { Modal, EmptyState, Field, Input, Textarea } from "@/lib/ui";

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
  // Yu 2026-05-14: the play module is fun-only. Catalog responses may
  // still carry pricing fields; we deliberately don't surface them
  // anywhere on this surface. The deck builder lives in the
  // game-economy, not the real-economy.
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
// The in-progress deck. Written on every edit (debounced) so a reload,
// back-swipe, or tab eviction never destroys a half-built deck.
const DRAFT_KEY = "ctcg-deck-builder-draft";

const RARITY_OPTIONS = [
  { value: "", label: "All Rarities" },
  { value: "L", label: "L (Leader)" },
  { value: "SEC", label: "SEC (Secret)" },
  { value: "SR", label: "SR (Super Rare)" },
  { value: "SP", label: "SP (Special)" },
  { value: "TR", label: "TR (Treasure)" },
  { value: "R", label: "R (Rare)" },
  { value: "UC", label: "UC (Uncommon)" },
  { value: "C", label: "C (Common)" },
  { value: "P", label: "P (Promo)" },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function rarityBadge(rarity: string | null) {
  if (!rarity) return null;
  const r = normalizeRarity(rarity);
  let cls = "bg-neutral-700 text-neutral-400";
  if (r === "SR" || r === "SEC" || r === "SCR" || r === "L" || r === "SP" || r === "TR")
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

// Bounded-concurrency map — used by the share-link loader and bulk import
// so a 50-card deck doesn't fire 50 simultaneous catalog requests.
async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
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
  // Substrate honesty: the API says where card data came from (a dated
  // snapshot vs a live read); surface it next to the results count.
  const [catalogSource, setCatalogSource] = useState<{ kind: string; generated_at?: string } | null>(null);
  const limit = 48;

  /* ---- UI state ---- */
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [savedDecks, setSavedDecks] = useState<SavedDeck[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
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
  const searchBarRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const deckPanelRef = useRef<HTMLDivElement | null>(null);
  // Rarity filter in place before entering leader-search mode — restored
  // when the mode exits so the mode doesn't leak its "L" filter.
  const prevRarityRef = useRef("");
  const draftLoadedRef = useRef(false);
  const prevTotalRef = useRef(0);
  const { toast } = useToast();

  /* ---- Derived values ---- */
  const totalCards = useMemo(
    () => deckEntries.reduce((sum, e) => sum + e.quantity, 0),
    [deckEntries]
  );

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

  /* ---- Fetch cards ----
     The rarity filter is server-side (the wholesale catalog supports
     ?rarity=) so counts and pagination tell the truth — previously a
     client-side filter over one 48-card page made "Search for leader"
     page through 72 mostly-empty pages. Aborted on every param change so
     a slow stale response can never overwrite a newer one; the previous
     grid stays mounted (dimmed) while the next page loads. */
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
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
        if (activeRarity) params.set("rarity", activeRarity);
        const res = await fetch(`/api/market/catalog?${params}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("Failed");
        const data = await res.json();
        setCards(data.cards ?? []);
        setSearchTotal(data.total ?? 0);
        setCatalogSource(data.source ?? null);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setCards([]);
        setSearchTotal(0);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [debouncedQuery, offset, activeSet, activeRarity]);

  /* ---- Load saved decks — prefer server for signed-in users ---- */
  const [signedIn, setSignedIn] = useState(false);

  type ServerDeck = {
    name: string;
    leader_sku: string | null;
    entries: { sku: string; quantity: number; card: CatalogCard }[];
    updated_at: string;
  };

  // Map server decks to the SavedDeck shape the UI uses.
  const mapServerDecks = useCallback((decks: ServerDeck[]): SavedDeck[] => {
    return decks.map((d) => {
      const leaderEntry = d.entries.find((e) => e.sku === d.leader_sku);
      return {
        name: d.name,
        leader: leaderEntry?.card ?? null,
        entries: d.entries.filter((e) => e.sku !== d.leader_sku),
        savedAt: d.updated_at,
      };
    });
  }, []);

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
          setSavedDecks(mapServerDecks(data.decks ?? []));
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
  }, [mapServerDecks]);

  /* ---- Draft restore + autosave ----
     The working deck is the user's most fragile state — up to 51 picks
     with no save step. Restore it on mount (unless a ?deck= share link
     takes precedence) and write it back, debounced, on every edit. */
  useEffect(() => {
    // Deferred a tick so the restore isn't a synchronous setState inside
    // the effect body (microtasks still run before first paint).
    queueMicrotask(() => {
      try {
        const params = new URLSearchParams(window.location.search);
        if (!params.get("deck")) {
          const raw = localStorage.getItem(DRAFT_KEY);
          if (raw) {
            const draft = JSON.parse(raw);
            if (draft && (draft.leader || draft.entries?.length)) {
              setLeader(draft.leader ?? null);
              setDeckEntries(Array.isArray(draft.entries) ? draft.entries : []);
              if (typeof draft.name === "string" && draft.name) setDeckName(draft.name);
            }
          }
        }
      } catch { /* corrupted draft — start fresh */ }
      draftLoadedRef.current = true;
    });
  }, []);

  useEffect(() => {
    if (!draftLoadedRef.current) return;
    const t = setTimeout(() => {
      try {
        if (!leader && deckEntries.length === 0) {
          localStorage.removeItem(DRAFT_KEY);
        } else {
          localStorage.setItem(
            DRAFT_KEY,
            JSON.stringify({ leader, entries: deckEntries, name: deckName })
          );
        }
      } catch { /* storage full or unavailable — non-fatal */ }
    }, 500);
    return () => clearTimeout(t);
  }, [leader, deckEntries, deckName]);

  /* ---- Deck-complete moment ---- */
  useEffect(() => {
    if (prevTotalRef.current < MAX_DECK_SIZE && totalCards === MAX_DECK_SIZE) {
      toast("Deck complete — draw your opening hand?", "success");
    }
    prevTotalRef.current = totalCards;
  }, [totalCards, toast]);

  /* ---- "/" focuses search ---- */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "/") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
      searchInputRef.current?.focus();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  /* ---- Deck operations ---- */
  const addToDeck = useCallback((card: CatalogCard, count = 1) => {
    setDeckEntries((prev) => {
      const existing = prev.find((e) => e.card.sku === card.sku);
      if (existing) {
        if (existing.quantity >= MAX_COPIES) {
          toast(`Max ${MAX_COPIES} copies of ${card.name}`, "warning");
          return prev;
        }
        const add = Math.min(count, MAX_COPIES - existing.quantity);
        return prev.map((e) =>
          e.card.sku === card.sku ? { ...e, quantity: e.quantity + add } : e
        );
      }
      const total = prev.reduce((sum, e) => sum + e.quantity, 0);
      if (total >= MAX_DECK_SIZE) {
        toast(`Deck is full (${MAX_DECK_SIZE} cards)`, "warning");
        return prev;
      }
      const add = Math.min(count, MAX_COPIES, MAX_DECK_SIZE - total);
      return [...prev, { card, quantity: add }];
    });
  }, [toast]);

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
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
    toast("Deck cleared", "info");
  }

  /* ---- Leader-search mode ---- */
  function enterLeaderMode() {
    prevRarityRef.current = activeRarity;
    setLeaderSearchMode(true);
    setActiveRarity("L");
    setOffset(0);
    requestAnimationFrame(() => {
      searchBarRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      searchInputRef.current?.focus();
    });
  }

  function exitLeaderMode() {
    setLeaderSearchMode(false);
    setActiveRarity(prevRarityRef.current);
    setOffset(0);
  }

  function selectLeader(card: CatalogCard) {
    setLeader(card);
    if (leaderSearchMode) exitLeaderMode();
    if (normalizeRarity(card.rarity) !== "L") {
      toast(`${card.name} set as Leader — note it isn't an L-rarity card`, "warning");
    } else {
      toast(`${card.name} set as Leader`, "success");
    }
  }

  /* ---- Save / Load ---- */
  async function saveDeck() {
    const name = deckName.trim() || "My Deck";
    const deck: SavedDeck = {
      name,
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
    // cases so reloading the page doesn't flash an empty list. A failed
    // server save still saves locally — and says so honestly.
    let synced = false;
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
            name,
            leader_sku: leader?.sku ?? null,
            entries: serverEntries,
            is_public: saveIsPublic,
            tags,
            notes: saveNotes.trim() || undefined,
          }),
        });
        if (res.ok) {
          synced = true;
        } else {
          const d = await res.json().catch(() => ({}));
          toast(d.error || "Server save failed — saved locally only", "warning");
        }
      } catch {
        toast("Network error — saved locally only", "warning");
      }
    }

    const updated = [...savedDecks.filter((d) => d.name !== name), deck];
    setSavedDecks(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    setShowSaveModal(false);
    if (!signedIn || synced) {
      toast(`Deck "${name}" saved${synced ? " (synced)" : ""}`, "success");
    }
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

  async function openLoadModal() {
    // Signed-in users get the server list (source of truth); anonymous
    // users re-read localStorage. Previously this always re-read local
    // storage, clobbering server-synced decks with a stale cache.
    if (signedIn) {
      try {
        const res = await fetch("/api/decks");
        if (res.ok) {
          const data = await res.json();
          setSavedDecks(mapServerDecks(data.decks ?? []));
        }
      } catch { /* keep what we have */ }
    } else {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) setSavedDecks(JSON.parse(stored));
      } catch { /* ignore */ }
    }
    setShowLoadModal(true);
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

  /* ---- Bulk import ---- */
  async function handleBulkImport(entries: ParsedEntry[]): Promise<{ added: number; notFound: string[] }> {
    // Aggregate duplicate card numbers before resolving — a pasted list
    // with "2x OP01-006" on two lines is one lookup, not two.
    const byNumber = new Map<string, ParsedEntry>();
    for (const p of entries) {
      const existing = byNumber.get(p.cardNumber);
      if (existing) {
        existing.quantity += p.quantity;
        existing.isLeader = existing.isLeader || p.isLeader;
      } else {
        byNumber.set(p.cardNumber, { ...p });
      }
    }
    const unique = Array.from(byNumber.values());

    // Resolve each card number to a catalog card — bounded concurrency,
    // search-by-card-number via the ?q= param (substring match on SKU).
    const resolved = await mapPool(unique, 6, async (p) => {
      try {
        const res = await fetch(
          `/api/market/catalog?game=one-piece&q=${encodeURIComponent(p.cardNumber)}&limit=5`,
        );
        if (!res.ok) return { parsed: p, card: null as CatalogCard | null };
        const d = await res.json();
        // Prefer exact card_number match when multiple cards come back
        const found: CatalogCard[] = d.cards ?? [];
        const exact = found.find((c) => c.card_number.toUpperCase() === p.cardNumber);
        return { parsed: p, card: exact ?? found[0] ?? null };
      } catch {
        return { parsed: p, card: null as CatalogCard | null };
      }
    });

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
        if (normalizeRarity(card.rarity) !== "L") {
          toast(`${card.name} set as Leader — note it isn't an L-rarity card`, "warning");
        }
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

  /* ---- Share ---- */
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

      toast("Loading shared deck...", "info");

      const skuQuantities = (data.c as string[]).map((s: string) => {
        const [sku, qty] = s.split(":");
        return { sku, quantity: parseInt(qty, 10) };
      });

      const allSkus = [...(data.l ? [data.l] : []), ...skuQuantities.map((sq) => sq.sku)];

      // Resolve SKUs with bounded concurrency (a 50-card deck shouldn't
      // fire 50 simultaneous requests).
      mapPool(allSkus as string[], 6, (sku) =>
        fetch(`/api/market/catalog?game=one-piece&q=${encodeURIComponent(sku)}&limit=1`)
          .then((r) => r.json())
          .then((d) => (d.cards?.[0] || null) as CatalogCard | null)
          .catch(() => null)
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

        // Drop the ?deck= param so edits autosave as a draft instead of
        // being reverted to the shared snapshot on the next reload.
        window.history.replaceState(null, "", "/deck-builder");

        const requested = allSkus.length;
        const loaded = (data.l && cardMap.has(data.l) ? 1 : 0) + entries.length;
        if (loaded === requested) {
          toast("Shared deck loaded", "success");
        } else {
          toast(`Loaded ${loaded} of ${requested} cards (${requested - loaded} unavailable)`, "warning");
        }
      });
    } catch {
      /* ignore invalid deck param */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---- Pagination ---- */
  const totalPages = Math.ceil(searchTotal / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  const pageNumbers: number[] = [];
  if (totalPages > 1) {
    let start = Math.max(1, currentPage - 2);
    const end = Math.min(totalPages, start + 4);
    start = Math.max(1, end - 4);
    for (let p = start; p <= end; p++) pageNumbers.push(p);
  }

  function goToPage(p: number) {
    setOffset(Math.max(0, (p - 1) * limit));
    searchBarRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const overwriting = savedDecks.some((d) => d.name === (deckName.trim() || "My Deck"));

  /* ---- Render ---- */
  return (
    <div className="min-h-screen bg-neutral-950">
      <div className="max-w-[1600px] mx-auto px-4 pt-8 pb-24 lg:pb-8">
        {/* ========== HEADER ========== */}
        <div className="mb-6">
          <h1 className="text-3xl font-black text-white mb-1">
            Deck Builder
          </h1>
          {/* Fun-only surface: the tagline teaches the two enforced rules
              and points at the simulator — no commerce nudges. */}
          <p className="text-neutral-400 text-sm">
            Build a 50-card One Piece TCG deck. Pick a Leader, add up to 4
            copies per card, and test your opening hands.
          </p>
        </div>

        {/* ========== LEADER SECTION ========== */}
        <div className="mb-6 bg-neutral-900 border border-neutral-800 rounded-xl p-4 relative overflow-hidden">
          {/* Ambient leader art — the Leader is the deck's identity, so
              let it tint the band. Decorative only. */}
          {leader?.image_url && (
            <Image
              src={leader.image_url}
              alt=""
              aria-hidden="true"
              fill
              sizes="100vw"
              className="object-cover object-[50%_20%] blur-2xl opacity-15 pointer-events-none"
            />
          )}
          <div className="relative z-10">
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
                  Remove leader
                </button>
              )}
            </div>

            {leader ? (
              <div className="flex items-center gap-4">
                {leader.image_url ? (
                  <Image
                    src={leader.image_url}
                    alt={leader.name}
                    width={630}
                    height={880}
                    sizes="112px"
                    className="w-28 h-auto object-cover rounded-lg shadow-lg shadow-amber-500/10"
                  />
                ) : (
                  <div className="w-28 h-40 bg-neutral-800 rounded-lg flex items-center justify-center">
                    <span className="text-neutral-600 text-[10px]">N/A</span>
                  </div>
                )}
                <div>
                  <h3 className="text-lg font-bold text-white">{leader.name}</h3>
                  <p className="text-xs text-neutral-400 font-mono">
                    {leader.card_number} &middot; {leader.set_code}
                  </p>
                  {rarityBadge(leader.rarity)}
                </div>
              </div>
            ) : (
              /* Compact empty state — the search grid and deck panel are
                 the working surface; don't push them below the fold. */
              <div className="flex items-center gap-4 py-1">
                <div className="w-14 h-20 shrink-0 rounded-lg border-2 border-dashed border-neutral-700 flex items-center justify-center">
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="text-neutral-600"
                    aria-hidden="true"
                  >
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 min-w-0">
                  <p className="text-sm text-neutral-400">
                    Select your Leader to start building
                  </p>
                  <button
                    onClick={enterLeaderMode}
                    className="px-4 py-2 bg-amber-500 text-black text-sm font-bold rounded-lg hover:bg-amber-400 transition self-start sm:self-auto"
                  >
                    Search for leader
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ========== MAIN LAYOUT: Search + Deck ========== */}
        <div className="flex flex-col lg:flex-row gap-6">
          {/* ======== LEFT: Card Search & Filter ======== */}
          <div className="flex-1 min-w-0">
            <h2 className="sr-only">Card search</h2>

            {/* Leader search mode banner */}
            {leaderSearchMode && (
              <div className="mb-4 bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3 flex items-center justify-between">
                <p className="text-sm text-amber-400 font-medium">
                  Selecting a Leader card — click a card to set it as your Leader
                </p>
                <button
                  onClick={exitLeaderMode}
                  className="text-xs text-amber-400 hover:text-amber-300 underline"
                >
                  Cancel
                </button>
              </div>
            )}

            {/* Search + Filters */}
            <div ref={searchBarRef} className="flex flex-col sm:flex-row gap-3 mb-4 scroll-mt-20">
              {/* Search input */}
              <div className="relative flex-1">
                <input
                  ref={searchInputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !loading && cards.length > 0) {
                      if (leaderSearchMode) selectLeader(cards[0]);
                      else addToDeck(cards[0]);
                    }
                  }}
                  placeholder="Search cards by name or card number..."
                  aria-label="Search cards"
                  className="w-full px-4 py-2.5 bg-neutral-900 border border-neutral-800 rounded-lg text-base sm:text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:border-amber-500/50 transition"
                />
                {query && (
                  <button
                    onClick={() => setQuery("")}
                    aria-label="Clear search"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white transition text-base p-1 -m-1"
                  >
                    &times;
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
                aria-label="Filter by set"
                className="px-3 py-2.5 bg-neutral-900 border border-neutral-800 rounded-lg text-white text-base sm:text-sm focus:outline-none focus:border-amber-500/50 transition min-w-[140px]"
              >
                <option value="">All Sets</option>
                {setsLoading && <option disabled>Loading...</option>}
                {sets.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.code} — {s.name}
                  </option>
                ))}
              </select>

              {/* Rarity filter — server-side, so pagination stays honest */}
              <select
                value={activeRarity}
                onChange={(e) => {
                  setActiveRarity(e.target.value);
                  setOffset(0);
                }}
                aria-label="Filter by rarity"
                className="px-3 py-2.5 bg-neutral-900 border border-neutral-800 rounded-lg text-white text-base sm:text-sm focus:outline-none focus:border-amber-500/50 transition min-w-[130px]"
              >
                {RARITY_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Results count — stays mounted so screen readers hear updates */}
            <p aria-live="polite" className="text-xs text-neutral-400 mb-3 flex items-center gap-2">
              {loading && cards.length === 0 ? (
                "Loading cards..."
              ) : (
                <>
                  Showing {cards.length} of {searchTotal.toLocaleString()} cards
                  {loading && (
                    <span
                      className="inline-block w-3 h-3 border border-neutral-600 border-t-amber-500 rounded-full animate-spin"
                      aria-hidden="true"
                    />
                  )}
                  {catalogSource?.kind === "snapshot" && (
                    <span
                      className="text-neutral-500"
                      title="Card data is a snapshot of the official Bandai cardlist, regenerated when new sets release — not a live database read."
                    >
                      · catalog snapshot {catalogSource.generated_at}
                    </span>
                  )}
                </>
              )}
            </p>

            {/* Loading skeletons — first load only; later fetches keep the
                grid mounted (dimmed) to avoid the full-page layout jump */}
            {loading && cards.length === 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
                {Array.from({ length: 12 }).map((_, i) => (
                  <SkeletonCard key={i} />
                ))}
              </div>
            )}

            {/* Empty state */}
            {!loading && cards.length === 0 && (
              <EmptyState
                title="No cards found"
                description="Try a different search term, set, or rarity filter."
                action={
                  (query || activeSet || activeRarity) ? (
                    <button
                      onClick={() => {
                        setQuery("");
                        setActiveSet(null);
                        setActiveRarity("");
                        setOffset(0);
                        setLeaderSearchMode(false);
                      }}
                      className="px-4 py-2 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400 transition text-sm"
                    >
                      Clear filters
                    </button>
                  ) : undefined
                }
              />
            )}

            {/* Card results grid */}
            {cards.length > 0 && (
              <div
                className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3 transition-opacity ${
                  loading ? "opacity-60 pointer-events-none" : ""
                }`}
              >
                {cards.map((card) => {
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
                      {/* Image — also the primary click target */}
                      <button
                        type="button"
                        onClick={(e) =>
                          leaderSearchMode
                            ? selectLeader(card)
                            : addToDeck(card, e.shiftKey ? MAX_COPIES : 1)
                        }
                        aria-label={
                          leaderSearchMode
                            ? `Set ${card.name} as leader`
                            : `Add ${card.name} to deck${inDeck ? `, ${inDeck.quantity} in deck` : ""}`
                        }
                        className="block w-full cursor-pointer rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                      >
                        {card.image_url ? (
                          <Image
                            src={card.image_url}
                            alt={card.name}
                            width={630}
                            height={880}
                            sizes="(max-width: 640px) 45vw, (max-width: 1280px) 22vw, 180px"
                            className="aspect-[2.5/3.5] w-full object-cover rounded-lg mb-2 group-hover:scale-[1.02] transition"
                          />
                        ) : (
                          <div className="aspect-[2.5/3.5] w-full bg-neutral-800 rounded-lg mb-2 flex items-center justify-center">
                            <span className="text-neutral-600 text-xs">
                              No Image
                            </span>
                          </div>
                        )}
                      </button>

                      {/* Quantity badge — re-keyed per count so each add pops */}
                      {inDeck && (
                        <div
                          key={inDeck.quantity}
                          className="absolute top-1 right-1 w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center animate-deck-pop"
                          aria-hidden="true"
                        >
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
                      <p className="text-xs font-semibold text-white truncate">
                        {card.name}
                      </p>
                      <p className="text-[10px] text-neutral-400 mb-1 truncate">
                        {card.card_number} &middot; {card.set_code}
                      </p>
                      <div className="flex items-center gap-1 mb-2">
                        {rarityBadge(card.rarity)}
                      </div>

                      {/* Action buttons */}
                      <div className="flex gap-1">
                        {leaderSearchMode ? (
                          <button
                            onClick={() => selectLeader(card)}
                            className="flex-1 py-2.5 lg:py-1.5 text-[11px] font-bold bg-amber-500 text-black rounded-lg hover:bg-amber-400 transition"
                          >
                            Set as leader
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={(e) => addToDeck(card, e.shiftKey ? MAX_COPIES : 1)}
                              aria-label={`Add ${card.name} to deck${inDeck ? `, ${inDeck.quantity} in deck` : ""}`}
                              title="Shift-click to add a playset (x4)"
                              className="flex-1 py-2.5 lg:py-1.5 text-[11px] font-bold bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 transition"
                            >
                              + Add
                            </button>
                            {!leader &&
                              normalizeRarity(card.rarity) === "L" && (
                                <button
                                  onClick={() => selectLeader(card)}
                                  className="py-2.5 lg:py-1.5 px-2 text-[11px] font-bold bg-amber-500 text-black rounded-lg hover:bg-amber-400 transition"
                                  aria-label={`Set ${card.name} as leader`}
                                  title="Set as leader"
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
            {totalPages > 1 && cards.length > 0 && (
              <nav aria-label="Search result pages" className="flex justify-center items-center gap-2 mt-6">
                <button
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={offset === 0 || loading}
                  className="px-3 py-2 min-h-11 lg:min-h-0 bg-neutral-900 text-neutral-300 rounded-lg hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed transition text-sm"
                >
                  Previous
                </button>
                {pageNumbers.map((p) => (
                  <button
                    key={p}
                    onClick={() => goToPage(p)}
                    disabled={loading}
                    aria-label={`Page ${p}`}
                    aria-current={p === currentPage ? "page" : undefined}
                    className={`w-11 h-11 lg:w-9 lg:h-9 rounded-lg text-sm transition ${
                      p === currentPage
                        ? "bg-amber-500 text-black font-bold"
                        : "bg-neutral-900 text-neutral-300 hover:bg-neutral-800"
                    }`}
                  >
                    {p}
                  </button>
                ))}
                <button
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage >= totalPages || loading}
                  className="px-3 py-2 min-h-11 lg:min-h-0 bg-neutral-900 text-neutral-300 rounded-lg hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed transition text-sm"
                >
                  Next
                </button>
              </nav>
            )}
          </div>

          {/* ======== RIGHT: Deck List ======== */}
          <div ref={deckPanelRef} className="lg:w-[380px] xl:w-[420px] shrink-0 scroll-mt-20">
            <div
              className={`${
                mobileShowDeck ? "block" : "hidden"
              } lg:block lg:sticky lg:top-20`}
            >
              <h2 className="sr-only">Your deck</h2>
              {/* Deck container — bounded to the viewport on desktop; the
                  deck list absorbs overflow so the toolbar and action row
                  never scroll out of reach. */}
              <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden lg:flex lg:flex-col lg:max-h-[calc(100vh-6rem)]">
                {/* Deck header */}
                <div className="px-4 py-3 border-b border-neutral-800 shrink-0">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <input
                      type="text"
                      value={deckName}
                      onChange={(e) => setDeckName(e.target.value)}
                      aria-label="Deck name"
                      className="bg-transparent text-white font-bold text-lg focus:outline-none border-b border-transparent focus:border-amber-500/50 transition min-w-0 flex-1"
                      placeholder="Deck name..."
                    />
                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={() => {
                          // Reset save-metadata state each time the modal opens.
                          setSaveIsPublic(false);
                          setSaveTagsRaw("");
                          setSaveNotes("");
                          setShowSaveModal(true);
                        }}
                        className="p-2.5 lg:p-1.5 text-neutral-400 hover:text-white transition rounded"
                        aria-label="Save deck"
                        title="Save deck"
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                          <path d="M13 5v8a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1h6l3 3z" />
                          <path d="M10 2v3h3" />
                          <path d="M6 9h4M6 11h2" />
                        </svg>
                      </button>
                      <button
                        onClick={openLoadModal}
                        className="p-2.5 lg:p-1.5 text-neutral-400 hover:text-white transition rounded"
                        aria-label="Load deck"
                        title="Load deck"
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                          <path d="M2 4h4l2 2h6v7a1 1 0 01-1 1H3a1 1 0 01-1-1V4z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => setShowSimulator(true)}
                        disabled={totalCards < 5}
                        className="p-2.5 lg:p-1.5 text-neutral-400 hover:text-amber-400 transition rounded disabled:opacity-30 disabled:cursor-not-allowed"
                        aria-label="Simulate opening hand"
                        title={totalCards < 5 ? "Add 5+ cards to simulate" : "Simulate opening hand"}
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                          <rect x="1" y="4" width="10" height="9" rx="1.5" />
                          <rect x="4" y="2" width="10" height="9" rx="1.5" />
                        </svg>
                      </button>
                      <button
                        onClick={() => setShowBulkImport(true)}
                        className="p-2.5 lg:p-1.5 text-neutral-400 hover:text-amber-400 transition rounded"
                        aria-label="Import decklist"
                        title="Paste a decklist to import"
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
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
                      key={totalCards}
                      className={`font-bold inline-block animate-deck-pop ${
                        totalCards === MAX_DECK_SIZE
                          ? "text-emerald-400"
                          : totalCards > MAX_DECK_SIZE
                          ? "text-red-400"
                          : "text-neutral-300"
                      }`}
                    >
                      {totalCards}/{MAX_DECK_SIZE} cards
                    </span>
                    <span className="text-neutral-500" aria-hidden="true">|</span>
                    <span
                      className="text-neutral-400"
                      title="Every deck plays exactly 10 DON!! — included automatically."
                    >
                      DON!! {DON_COUNT}/{DON_COUNT}
                    </span>
                  </div>
                </div>

                {/* Warnings */}
                {deckWarnings.length > 0 && (
                  <div className="px-4 py-2 bg-red-500/10 border-b border-red-500/20 shrink-0">
                    {deckWarnings.map((w, i) => (
                      <p key={i} className="text-[11px] text-red-400">
                        {w}
                      </p>
                    ))}
                  </div>
                )}

                {/* Deck list — before stats: these are the cards the user
                    is actively editing */}
                <div className="max-h-[50vh] lg:max-h-none lg:flex-1 lg:min-h-0 overflow-y-auto">
                  {deckEntries.length === 0 ? (
                    <div className="px-4 py-8 text-center">
                      <p className="text-neutral-400 text-sm">
                        No cards added yet
                      </p>
                      <p className="text-neutral-500 text-xs mt-1">
                        Search the catalog or paste a decklist to get started
                      </p>
                      <button
                        onClick={() => setShowBulkImport(true)}
                        className="mt-3 px-3 py-1.5 text-xs font-bold bg-neutral-800 text-neutral-300 rounded-lg hover:bg-neutral-700 transition"
                      >
                        Import decklist
                      </button>
                    </div>
                  ) : (
                    <ul className="divide-y divide-neutral-800/50">
                      {deckEntries.map((entry) => (
                        <li
                          key={entry.card.sku}
                          className="flex items-center gap-3 px-4 py-2 hover:bg-neutral-800/50 transition"
                        >
                          {/* Thumbnail */}
                          {entry.card.image_url ? (
                            <Image
                              src={entry.card.image_url}
                              alt={entry.card.name}
                              width={63}
                              height={88}
                              sizes="32px"
                              className="w-8 h-11 object-cover rounded shrink-0"
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
                            <p className="text-[10px] text-neutral-400">
                              {entry.card.card_number} &middot; {entry.card.set_code}
                            </p>
                          </div>

                          {/* Quantity controls */}
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => removeFromDeck(entry.card.sku)}
                              aria-label={`Remove one ${entry.card.name}`}
                              className="w-11 h-11 lg:w-6 lg:h-6 flex items-center justify-center bg-neutral-800 text-neutral-300 rounded hover:bg-red-500/20 hover:text-red-400 transition text-xs font-bold"
                            >
                              -
                            </button>
                            <span
                              key={entry.quantity}
                              className="w-6 text-center text-xs font-bold text-white inline-block animate-deck-pop"
                            >
                              {entry.quantity}
                            </span>
                            <button
                              onClick={() => addToDeck(entry.card)}
                              aria-label={`Add one ${entry.card.name}`}
                              className="w-11 h-11 lg:w-6 lg:h-6 flex items-center justify-center bg-neutral-800 text-neutral-300 rounded hover:bg-emerald-500/20 hover:text-emerald-400 transition text-xs font-bold"
                              disabled={entry.quantity >= MAX_COPIES}
                            >
                              +
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Deck Stats — below the list; the rookie guidance stays
                    visible without displacing the cards being edited */}
                {deckEntries.length > 0 && (
                  <div className="px-4 py-3 border-t border-neutral-800 shrink-0">
                    <h3 className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-2">
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

                {/* Action buttons */}
                <div className="px-4 py-3 border-t border-neutral-800 space-y-2 shrink-0">
                  {/* Yu 2026-05-14: "Buy Missing Cards" CTA removed —
                      play module is fun-only, no commerce nudges. Players
                      who want to acquire cards navigate to /catalog or
                      /market directly. The deck builder is for building. */}

                  {/* The simulator is the payoff loop — give it a real button,
                      not just a toolbar icon. */}
                  <button
                    onClick={() => setShowSimulator(true)}
                    disabled={totalCards < 5}
                    className="w-full py-2.5 border border-amber-500/40 text-amber-400 text-xs font-bold rounded-lg hover:bg-amber-500/10 disabled:opacity-40 disabled:cursor-not-allowed transition"
                    title={totalCards < 5 ? "Add 5+ cards to simulate" : undefined}
                  >
                    Test opening hand
                  </button>

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
          <div className="bg-neutral-900/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
            <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <span key={totalCards} className="text-sm font-bold text-white shrink-0 inline-block animate-deck-pop">
                  {totalCards}/{MAX_DECK_SIZE}
                </span>
              </div>
              <button
                onClick={() => {
                  const next = !mobileShowDeck;
                  setMobileShowDeck(next);
                  if (next) {
                    requestAnimationFrame(() => {
                      deckPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                    });
                  }
                }}
                className="px-4 py-2 bg-amber-500 text-black text-sm font-bold rounded-lg hover:bg-amber-400 transition shrink-0"
              >
                {mobileShowDeck ? "Hide deck" : "View deck"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ========== MODALS ========== */}

      {/* Clear confirm */}
      <ConfirmModal
        open={showClearConfirm}
        title="Clear deck"
        message="Remove all cards and the Leader from your deck? This cannot be undone."
        confirmLabel="Clear deck"
        cancelLabel="Keep"
        variant="danger"
        onConfirm={clearDeck}
        onCancel={() => setShowClearConfirm(false)}
      />

      {/* Delete saved deck confirm */}
      <ConfirmModal
        open={deleteTarget !== null}
        title="Delete deck"
        message={`Delete "${deleteTarget ?? ""}" from your saved decks? This cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Keep"
        variant="danger"
        onConfirm={() => {
          if (deleteTarget) deleteSavedDeck(deleteTarget);
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Save deck modal */}
      <Modal open={showSaveModal} onClose={() => setShowSaveModal(false)} title="Save deck">
        <div className="space-y-4">
          <Field label="Name" htmlFor="save-deck-name">
            <Input
              id="save-deck-name"
              type="text"
              value={deckName}
              onChange={(e) => setDeckName(e.target.value)}
              placeholder="Deck name..."
              className="text-base sm:text-sm"
            />
          </Field>

          {overwriting && (
            <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
              A deck named &ldquo;{deckName.trim() || "My Deck"}&rdquo; already
              exists — saving will overwrite it.
            </p>
          )}

          {signedIn && (
            <>
              <Field
                label="Tags"
                htmlFor="save-deck-tags"
                hint="Comma separated, max 10"
              >
                <Input
                  id="save-deck-tags"
                  type="text"
                  value={saveTagsRaw}
                  onChange={(e) => setSaveTagsRaw(e.target.value)}
                  placeholder="aggro, budget, tournament-ready"
                  className="text-base sm:text-sm"
                />
              </Field>

              <Field
                label="Notes"
                htmlFor="save-deck-notes"
                hint="Optional, 2000 character max"
              >
                <Textarea
                  id="save-deck-notes"
                  value={saveNotes}
                  onChange={(e) => setSaveNotes(e.target.value.slice(0, 2000))}
                  placeholder="Deck guide, mulligan priorities, tech choices..."
                  rows={4}
                  className="text-base sm:text-sm"
                />
              </Field>

              <label className="flex items-start gap-3 cursor-pointer select-none">
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
            <div className="bg-amber-900/20 border border-amber-700/40 text-amber-300 rounded-lg px-3 py-2 text-xs">
              Sign in to save to your account, publish publicly, and sync across devices.
            </div>
          )}

          <p className="text-xs text-neutral-500">
            {totalCards} cards
            {leader ? ` · Leader: ${leader.name}` : ""}
          </p>

          <div className="flex gap-3 pt-1">
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
              {saveIsPublic
                ? overwriting ? "Overwrite & publish" : "Save & publish"
                : overwriting ? "Overwrite" : "Save"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Load deck modal */}
      <Modal open={showLoadModal} onClose={() => setShowLoadModal(false)} title="Load deck">
        {savedDecks.length === 0 ? (
          <p className="text-sm text-neutral-400 py-4 text-center">
            No saved decks yet. Save your current deck to see it here.
          </p>
        ) : (
          <ul className="space-y-2 max-h-64 overflow-y-auto">
            {savedDecks.map((deck) => (
              <li
                key={deck.name}
                className="flex items-center justify-between p-3 bg-neutral-800 rounded-lg hover:bg-neutral-700/70 transition"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white truncate">
                    {deck.name}
                  </p>
                  <p className="text-[11px] text-neutral-400">
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
                    onClick={() => setDeleteTarget(deck.name)}
                    aria-label={`Delete deck ${deck.name}`}
                    className="px-2.5 py-1.5 bg-neutral-700 text-red-400 text-sm font-bold rounded hover:bg-red-500/20 transition"
                  >
                    &times;
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <button
          onClick={() => setShowLoadModal(false)}
          className="w-full mt-4 py-2.5 bg-neutral-800 text-neutral-300 text-sm font-medium rounded-lg hover:bg-neutral-700 transition"
        >
          Close
        </button>
      </Modal>

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
