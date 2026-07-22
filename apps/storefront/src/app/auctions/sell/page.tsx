"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { formatPrice } from "@/lib/format";
import { WhyLink } from "@/lib/ui";
import {
  buildCatalogSearch,
  parseCatalogError,
  DEFAULT_GAME,
  type CatalogCard,
  type CatalogSource,
} from "@/components/market/catalog";
import { CONDITIONS, type Condition } from "@/components/market/listing-draft";

type AuctionType = "english" | "buy_now";

interface UploadedImage {
  id?: string;
  url: string;
  s3Key: string;
  order: number;
}

interface SearchState {
  status: "idle" | "loading" | "ok" | "error";
  results: CatalogCard[];
  source: CatalogSource | null;
  message?: string;
}

const TYPE_OPTIONS: { value: AuctionType; label: string; desc: string }[] = [
  { value: "english", label: "English Auction", desc: "Ascending bids, highest wins" },
  { value: "buy_now", label: "Buy Now", desc: "Fixed price, optional offers" },
];

const DURATION_OPTIONS = [
  { days: 3, label: "3 days" },
  { days: 5, label: "5 days" },
  { days: 7, label: "7 days" },
  { days: 14, label: "14 days" },
];

export default function SellAuctionPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState(false);

  // Card identity (P0) — the catalogue card-picker replaces the free-text
  // title as the source of truth, so the auction resolves an exact printing
  // + condition (sku) and can carry a reference price / appear on its own
  // card's market page. Reuses the market catalog search verbatim.
  const [picked, setPicked] = useState<CatalogCard | null>(null);
  const [condition, setCondition] = useState<Condition>("NM");
  const [searchInput, setSearchInput] = useState("");
  const [searchNonce, setSearchNonce] = useState(0); // bumped by "Try again"
  const [search, setSearch] = useState<SearchState>({ status: "idle", results: [], source: null });
  // The title auto-fills from the picked card; once the seller edits it we
  // stop overwriting it on re-pick.
  const [titleEdited, setTitleEdited] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [auctionType, setAuctionType] = useState<AuctionType>("english");

  // English fields
  const [startingPrice, setStartingPrice] = useState("");
  const [reservePrice, setReservePrice] = useState("");
  const [bidIncrement, setBidIncrement] = useState("1.00");

  // Buy Now fields
  const [buyNowFixedPrice, setBuyNowFixedPrice] = useState("");
  const [allowBestOffer, setAllowBestOffer] = useState(false);

  // Duration
  const [durationDays, setDurationDays] = useState(7);

  // Post-create image upload
  const [createdAuctionId, setCreatedAuctionId] = useState<string | null>(null);
  // The full auction object the API returned — its approval_status / message
  // drive the success copy (Area A owns the API branch; this page renders
  // whichever message it returns rather than hardcoding "Submitted for Review").
  const [createdAuction, setCreatedAuction] = useState<
    { id: string; approval_status?: string; status?: string; message?: string } | null
  >(null);
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [uploading, setUploading] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((data) => {
        if (!data?.user?.email) {
          router.push("/login");
          return;
        }
        setAuthed(true);
        setLoading(false);
      });
  }, [router]);

  // ── Catalogue search (reused from the market listing wizard) ──
  const runSearch = useCallback(
    async (q: string, limit = 12): Promise<{ cards: CatalogCard[]; source: CatalogSource } | { error: string }> => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch(
          `/api/market/catalog?${buildCatalogSearch({ game: DEFAULT_GAME, q, set: null, sort: "name_asc", page: 1, view: "table" }, limit)}`,
          { signal: controller.signal },
        );
        const body = await res.json().catch(() => null);
        if (!res.ok) return { error: parseCatalogError(body).message };
        return {
          cards: (body?.cards ?? []) as CatalogCard[],
          source: (body?.source as CatalogSource) ?? "unavailable",
        };
      } catch (err) {
        if ((err as Error).name === "AbortError") return { error: "__aborted__" };
        return { error: "Network problem while searching — try again." };
      }
    },
    [],
  );

  // Debounced search-as-you-type — only while no card is picked.
  useEffect(() => {
    if (picked) return;
    const q = searchInput.trim();
    if (q.length < 2) {
      setSearch({ status: "idle", results: [], source: null });
      return;
    }
    const t = setTimeout(async () => {
      setSearch((s) => ({ ...s, status: "loading" }));
      const r = await runSearch(q);
      if ("error" in r) {
        if (r.error !== "__aborted__") setSearch({ status: "error", results: [], source: null, message: r.error });
        return;
      }
      setSearch({ status: "ok", results: r.cards, source: r.source });
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput, picked, runSearch, searchNonce]);

  function pickCard(card: CatalogCard) {
    setPicked(card);
    // Auto-fill the title from the card name unless the seller already
    // typed their own — they can still edit it after.
    if (!titleEdited || !title.trim()) {
      setTitle(card.name);
      setTitleEdited(false);
    }
    setError("");
  }

  function changeCard() {
    setPicked(null);
    setSearchInput("");
    setSearch({ status: "idle", results: [], source: null });
  }

  // Commission preview price
  const previewPrice =
    auctionType === "buy_now"
      ? parseFloat(buyNowFixedPrice) || 0
      : parseFloat(startingPrice) || 0;
  // Cambridge TCG takes no commission, so the seller receives the full sale
  // price. See /methodology/fees.
  const payout = previewPrice;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    // Card identity is required — an auction with no sku has no reference
    // price and can never appear on its own card's market page.
    if (!picked) {
      setError("Pick the card you're selling from the catalogue first.");
      return;
    }

    setSubmitting(true);

    try {
      // starts_at and ends_at are placeholders; server will set actual times on approval
      const now = new Date();
      const startsAt = now.toISOString();
      const endsAt = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000).toISOString();

      const body: Record<string, unknown> = {
        title: title.trim() || picked.name,
        description: description || undefined,
        auction_type: auctionType,
        starts_at: startsAt,
        ends_at: endsAt,
        // Card identity resolved from the catalogue picker — the create API
        // (Area A) persists these to auctions.sku / .condition.
        sku: picked.sku,
        condition,
      };

      if (auctionType === "english") {
        body.starting_price = parseFloat(startingPrice);
        if (reservePrice) body.reserve_price = parseFloat(reservePrice);
        if (bidIncrement) body.bid_increment = parseFloat(bidIncrement);
      } else {
        body.starting_price = parseFloat(buyNowFixedPrice);
        body.buy_now_price = parseFloat(buyNowFixedPrice);
        body.allow_best_offer = allowBestOffer;
      }

      const res = await fetch("/api/auctions/my", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create auction");
      }

      // The route wraps the row as { auction }; tolerate a bare object too.
      const data = await res.json();
      const created = data?.auction ?? data;
      setCreatedAuction(created);
      setCreatedAuctionId(created?.id ?? null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleImageUpload(files: FileList) {
    if (!createdAuctionId) return;
    setUploading(true);

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        // 1. Get presigned URL
        const presignRes = await fetch("/api/auctions/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ auctionId: createdAuctionId, contentType: file.type }),
        });

        if (!presignRes.ok) {
          // Surface the server's real message (e.g. "S3 client unavailable —
          // AWS credentials not configured") when it sends one; fall back to a
          // human line when the error body isn't JSON. The seller can still
          // finish without photos — the auction is already created.
          let msg = "Photo upload isn't available right now — you can still list without photos.";
          try {
            const body = await presignRes.json();
            if (body?.error) msg = body.error;
          } catch {
            /* non-JSON error body — keep the friendly fallback */
          }
          throw new Error(msg);
        }
        const { uploadUrl, imageUrl, s3Key } = await presignRes.json();

        // 2. Upload to S3
        const uploadRes = await fetch(uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });

        if (!uploadRes.ok) throw new Error("Failed to upload to S3");

        // 3. Register image in DB
        const order = images.length + i;
        const imgRes = await fetch(`/api/auctions/${createdAuctionId}/images`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: imageUrl, s3Key, order }),
        });

        if (!imgRes.ok) throw new Error("Failed to register image");
        const img = await imgRes.json();

        setImages((prev) => [...prev, { id: img.id, url: imageUrl, s3Key, order }]);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Image upload failed");
    } finally {
      setUploading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-page flex items-center justify-center">
        <p className="text-ink-faint">Loading...</p>
      </div>
    );
  }

  if (!authed) return null;

  // ── Success: image upload ──
  if (createdAuctionId) {
    // Success copy is driven by whatever the API returned — a live auction
    // gets live copy, a queued one gets review copy — so the page never
    // promises a review that didn't happen. Area A owns the API branch.
    const isLive =
      createdAuction?.approval_status === "approved" ||
      createdAuction?.status === "live" ||
      createdAuction?.status === "active";
    const successHeading = isLive ? "Your auction is live" : "Auction submitted for review";
    const successBody =
      createdAuction?.message ??
      (isLive
        ? "Buyers can bid on it now. Add photos below to help it sell — or you're all set."
        : "We'll email you when it's approved and goes live.");
    return (
      <div className="min-h-screen bg-page">
        <div className="max-w-2xl mx-auto px-4 py-8">
          <div className="bg-surface border border-border-subtle rounded-lg p-6 mb-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-ok/15 flex items-center justify-center">
                <span className="text-ok text-lg">&#10003;</span>
              </div>
              <div>
                <h2 className="text-lg font-bold text-ink">{successHeading}</h2>
                <p className="text-sm text-ink-muted mt-1">{successBody}</p>
              </div>
            </div>
          </div>

          <div className="bg-surface border border-border-subtle rounded-lg p-6">
            <h3 className="text-lg font-bold text-ink mb-2">Add photos (optional)</h3>
            <p className="text-sm text-ink-muted mb-4">
              Clear, well-lit images help sell faster — but they&apos;re not
              required. Your listing is already created; you can add photos now
              or later, or list without them.
            </p>

            {error && (
              <div className="bg-danger/10 border border-danger/20 rounded-lg p-3 mb-4">
                <p className="text-sm text-danger">{error}</p>
                <p className="text-xs text-ink-muted mt-1">
                  You can still finish without photos — the button below lists
                  your auction as-is.
                </p>
              </div>
            )}

            {images.length > 0 && (
              <div className="grid grid-cols-3 gap-3 mb-4">
                {images.map((img) => (
                  <div key={img.s3Key} className="relative group">
                    <img
                      src={img.url}
                      alt=""
                      className="w-full aspect-square object-cover rounded-lg"
                    />
                  </div>
                ))}
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleImageUpload(e.target.files);
                  e.target.value = "";
                }
              }}
            />

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="w-full py-3 border-2 border-dashed border-border-subtle rounded-lg text-ink-muted hover:border-accent/50 hover:text-accent-strong transition disabled:opacity-50"
            >
              {uploading ? "Uploading..." : "Click to upload images"}
            </button>
          </div>

          <div className="flex gap-3 mt-6">
            <button
              onClick={() => router.push("/account/auctions")}
              className="flex-1 py-3 bg-ink text-page font-bold rounded-lg hover:opacity-90 transition text-center"
            >
              {images.length > 0 ? "Done — View My Auctions" : "List without photos →"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Sell form ──
  return (
    <div className="min-h-screen bg-page">
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Hero */}
        <div className="mb-8">
          <h1 className="text-3xl font-display font-semibold text-ink">Sell Your Cards at Auction</h1>
          <p className="text-ink-muted mt-2">
            List your trading cards on Cambridge TCG and reach collectors across the UK. Payment runs
            through secure checkout; you ship directly to the winner once they&rsquo;ve paid.
          </p>
        </div>

        {/* How it works */}
        <div className="bg-surface rounded-lg p-5 mb-8 border border-border-subtle">
          <h2 className="text-sm font-bold text-accent uppercase tracking-wider mb-3">How It Works</h2>
          <div className="space-y-2 text-sm text-ink-muted">
            <div className="flex gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full bg-accent-wash text-accent text-xs flex items-center justify-center font-bold">1</span>
              <span>Pick the exact card from the catalogue, then set your price and photos</span>
            </div>
            <div className="flex gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full bg-accent-wash text-accent text-xs flex items-center justify-center font-bold">2</span>
              <span>New listings are reviewed before going live — instant if your account is set for it</span>
            </div>
            <div className="flex gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full bg-accent-wash text-accent text-xs flex items-center justify-center font-bold">3</span>
              <span>Your auction goes live and collectors bid</span>
            </div>
            <div className="flex gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full bg-accent-wash text-accent text-xs flex items-center justify-center font-bold">4</span>
              <span>The winner pays through secure checkout</span>
            </div>
            <div className="flex gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full bg-accent-wash text-accent text-xs flex items-center justify-center font-bold">5</span>
              <span>You ship directly to the winner (their address appears once payment clears); you&rsquo;re paid after they confirm receipt — with no commission, so you keep 100% of the sale<WhyLink href="/methodology/fees" tooltip="How the free platform works" /></span>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Card identity — the catalogue card-picker (P0) */}
          <div>
            <label className="block text-sm text-ink-muted mb-2">Which card are you selling? *</label>

            {!picked ? (
              <div>
                <div className="relative">
                  <input
                    type="search"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="Card name, number, or SKU…"
                    aria-label="Search for the card to sell"
                    className="w-full px-4 py-3 bg-surface border border-border-subtle rounded-lg text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/50"
                  />
                </div>

                {search.status === "idle" && (
                  <p className="text-xs text-ink-faint mt-2">
                    Type at least two characters — the set and card art help you confirm the exact printing.
                  </p>
                )}

                {search.status === "loading" && (
                  <div className="space-y-2 mt-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="h-[64px] bg-surface border border-border-subtle rounded-lg animate-pulse" />
                    ))}
                  </div>
                )}

                {search.status === "error" && (
                  <div className="mt-3 bg-danger/10 border border-danger/20 rounded-lg p-3">
                    <p className="text-sm text-danger">{search.message}</p>
                    <button
                      type="button"
                      onClick={() => setSearchNonce((n) => n + 1)}
                      className="mt-2 text-xs text-accent hover:text-accent-strong underline decoration-dotted underline-offset-2"
                    >
                      Try again
                    </button>
                  </div>
                )}

                {search.status === "ok" && search.results.length === 0 && (
                  <p className="text-sm text-ink-muted mt-3">
                    No cards match. Try the exact card number (e.g. OP01-001) or a shorter part of the name.
                  </p>
                )}

                {search.status === "ok" && search.results.length > 0 && (
                  <ul className="space-y-2 mt-3">
                    {search.results.map((card) => (
                      <li key={card.sku}>
                        <button
                          type="button"
                          onClick={() => pickCard(card)}
                          className="w-full bg-surface border border-border-subtle rounded-lg p-3 flex items-center gap-3 text-left hover:border-border-strong transition"
                        >
                          {card.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={card.image_url} alt="" className="w-10 h-14 object-cover rounded border border-border-subtle shrink-0" />
                          ) : (
                            <span className="w-10 h-14 bg-surface-subtle border border-border-subtle rounded flex items-center justify-center shrink-0 text-[8px] text-ink-faint">N/A</span>
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-semibold text-ink truncate">{card.name}</span>
                            <span className="block text-xs text-ink-faint font-mono truncate">
                              {card.card_number} · {card.set_name}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <div className="bg-surface border border-border-subtle rounded-lg p-4 flex items-center gap-4">
                {picked.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={picked.image_url} alt="" className="w-14 h-20 object-cover rounded border border-border-subtle shrink-0" />
                ) : (
                  <span className="w-14 h-20 bg-surface-subtle border border-border-subtle rounded flex items-center justify-center shrink-0 text-[10px] text-ink-faint">N/A</span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink truncate">{picked.name}</p>
                  <p className="text-xs text-ink-faint font-mono truncate">
                    {picked.card_number} · {picked.set_name} ({picked.set_code})
                  </p>
                  <button
                    type="button"
                    onClick={changeCard}
                    className="mt-2 text-xs text-accent hover:text-accent-strong underline decoration-dotted underline-offset-2"
                  >
                    Not this card? Search again
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Condition — only once a card is picked */}
          {picked && (
            <div>
              <label className="block text-sm text-ink-muted mb-2">Condition *</label>
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value as Condition)}
                className="w-full px-4 py-3 bg-surface border border-border-subtle rounded-lg text-ink focus:outline-none focus:ring-2 focus:ring-accent/50"
              >
                {CONDITIONS.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
          )}

          {/* Title — auto-filled from the card, editable */}
          <div>
            <label className="block text-sm text-ink-muted mb-2">Listing title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => { setTitle(e.target.value); setTitleEdited(true); }}
              required
              className="w-full px-4 py-3 bg-surface border border-border-subtle rounded-lg text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/50"
              placeholder="Auto-filled from the card — add grading or notable details"
            />
            <p className="text-xs text-ink-faint mt-1.5">
              Auto-filled from the card you picked. Edit to add grading (e.g. PSA 9) or other notable details.
            </p>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm text-ink-muted mb-2">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="w-full px-4 py-3 bg-surface border border-border-subtle rounded-lg text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/50 resize-none"
              placeholder="Condition, set, grading info, any notable details..."
            />
          </div>

          {/* Auction Type */}
          <div>
            <label className="block text-sm text-ink-muted mb-2">Listing Type</label>
            <div className="grid grid-cols-2 gap-3">
              {TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setAuctionType(opt.value)}
                  className={`p-4 rounded-lg border text-left transition ${
                    auctionType === opt.value
                      ? "border-accent bg-accent-wash"
                      : "border-border-subtle bg-surface hover:border-border-strong"
                  }`}
                >
                  <p className={`text-sm font-bold ${auctionType === opt.value ? "text-accent" : "text-ink"}`}>
                    {opt.label}
                  </p>
                  <p className="text-xs text-ink-faint mt-1">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* English fields */}
          {auctionType === "english" && (
            <div className="bg-surface border border-border-subtle rounded-lg p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-ink-muted mb-2">Starting Price *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={startingPrice}
                    onChange={(e) => setStartingPrice(e.target.value)}
                    required
                    className="w-full px-4 py-3 bg-surface-subtle border border-border-subtle rounded-lg text-ink focus:outline-none focus:ring-2 focus:ring-accent/50"
                    placeholder="0.99"
                  />
                </div>
                <div>
                  <label className="block text-sm text-ink-muted mb-2">Reserve Price</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={reservePrice}
                    onChange={(e) => setReservePrice(e.target.value)}
                    className="w-full px-4 py-3 bg-surface-subtle border border-border-subtle rounded-lg text-ink focus:outline-none focus:ring-2 focus:ring-accent/50"
                    placeholder="Optional minimum"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-ink-muted mb-2">Bid Increment</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={bidIncrement}
                  onChange={(e) => setBidIncrement(e.target.value)}
                  required
                  className="w-full px-4 py-3 bg-surface-subtle border border-border-subtle rounded-lg text-ink focus:outline-none focus:ring-2 focus:ring-accent/50"
                  placeholder="1.00"
                />
              </div>
            </div>
          )}

          {/* Buy Now fields */}
          {auctionType === "buy_now" && (
            <div className="bg-surface border border-border-subtle rounded-lg p-4 space-y-4">
              <div>
                <label className="block text-sm text-ink-muted mb-2">Price *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={buyNowFixedPrice}
                  onChange={(e) => setBuyNowFixedPrice(e.target.value)}
                  required
                  className="w-full px-4 py-3 bg-surface-subtle border border-border-subtle rounded-lg text-ink focus:outline-none focus:ring-2 focus:ring-accent/50"
                  placeholder="25.00"
                />
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowBestOffer}
                  onChange={(e) => setAllowBestOffer(e.target.checked)}
                  className="w-4 h-4 rounded bg-surface-subtle border-border-subtle text-accent focus:ring-accent/50"
                />
                <span className="text-sm text-ink-muted">Allow Best Offer</span>
              </label>
            </div>
          )}

          {/* Duration */}
          <div>
            <label className="block text-sm text-ink-muted mb-2">Auction Duration</label>
            <div className="grid grid-cols-4 gap-3">
              {DURATION_OPTIONS.map((opt) => (
                <button
                  key={opt.days}
                  type="button"
                  onClick={() => setDurationDays(opt.days)}
                  className={`py-3 rounded-lg border text-sm font-medium transition ${
                    durationDays === opt.days
                      ? "border-accent bg-accent-wash text-accent"
                      : "border-border-subtle bg-surface text-ink-muted hover:border-border-strong"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-ink-faint mt-2">
              Duration starts when your listing is approved and goes live.
            </p>
          </div>

          {/* Payout preview — Cambridge TCG takes no commission */}
          {previewPrice > 0 && (
            <div className="bg-surface rounded-lg p-4 border border-border-subtle">
              <h3 className="text-sm font-bold text-ink-muted mb-3">Payout preview</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-ink-muted">Sale price</span>
                  <span className="text-ink font-medium">{formatPrice(previewPrice)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-muted">
                    Commission — none
                    <WhyLink href="/methodology/fees" tooltip="How the free platform works" />
                  </span>
                  <span className="text-ok">{formatPrice(0)}</span>
                </div>
                <div className="border-t border-border-subtle pt-2 flex justify-between">
                  <span className="text-ink-muted font-medium">You receive</span>
                  <span className="text-ok font-bold">{formatPrice(payout)}</span>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="bg-danger/10 border border-danger/20 rounded-lg p-3">
              <p className="text-sm text-danger">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !picked}
            className="w-full py-3 bg-ink text-page font-bold rounded-lg hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Submitting..." : !picked ? "Pick a card to continue" : "Submit Auction"}
          </button>
        </form>
      </div>
    </div>
  );
}
