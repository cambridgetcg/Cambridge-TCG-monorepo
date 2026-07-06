"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { SELLER_COMMISSION_RATE } from "@/lib/auction/types";
import { computeCommissionAmount } from "@cambridge-tcg/pricing";
import { formatPrice } from "@/lib/format";
import { WhyLink } from "@/lib/ui";

type AuctionType = "english" | "buy_now";

interface UploadedImage {
  id?: string;
  url: string;
  s3Key: string;
  order: number;
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

  // Commission preview price
  const previewPrice =
    auctionType === "buy_now"
      ? parseFloat(buyNowFixedPrice) || 0
      : parseFloat(startingPrice) || 0;
  // Apply the per-item commission cap (the fairness fix) so the preview a
  // seller sees matches what they'll actually be charged. See /methodology/fees.
  const commissionPreview = computeCommissionAmount(previewPrice, SELLER_COMMISSION_RATE);
  const commission = commissionPreview.amount;
  const payout = previewPrice - commission;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      // starts_at and ends_at are placeholders; server will set actual times on approval
      const now = new Date();
      const startsAt = now.toISOString();
      const endsAt = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000).toISOString();

      const body: Record<string, unknown> = {
        title,
        description: description || undefined,
        auction_type: auctionType,
        starts_at: startsAt,
        ends_at: endsAt,
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
            List your trading cards on Cambridge TCG and reach collectors across the UK. We handle
            verification, escrow, and delivery so you can sell with confidence.
          </p>
        </div>

        {/* How it works */}
        <div className="bg-surface rounded-lg p-5 mb-8 border border-border-subtle">
          <h2 className="text-sm font-bold text-accent uppercase tracking-wider mb-3">How It Works</h2>
          <div className="space-y-2 text-sm text-ink-muted">
            <div className="flex gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full bg-accent-wash text-accent text-xs flex items-center justify-center font-bold">1</span>
              <span>List your card with photos and a starting price</span>
            </div>
            <div className="flex gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full bg-accent-wash text-accent text-xs flex items-center justify-center font-bold">2</span>
              <span>We review and approve your listing</span>
            </div>
            <div className="flex gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full bg-accent-wash text-accent text-xs flex items-center justify-center font-bold">3</span>
              <span>Your auction goes live and buyers bid</span>
            </div>
            <div className="flex gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full bg-accent-wash text-accent text-xs flex items-center justify-center font-bold">4</span>
              <span>Winner pays, you ship to CTCG for verification</span>
            </div>
            <div className="flex gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full bg-accent-wash text-accent text-xs flex items-center justify-center font-bold">5</span>
              <span>We verify, forward to buyer, and you get paid (Auction rail: 12%, capped at £50/item<WhyLink href="/methodology/fees" tooltip="How is the commission and its cap decided?" />)</span>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Title */}
          <div>
            <label className="block text-sm text-ink-muted mb-2">Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="w-full px-4 py-3 bg-surface border border-border-subtle rounded-lg text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/50"
              placeholder="e.g. Charizard Base Set Holo PSA 9"
            />
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

          {/* Commission preview */}
          {previewPrice > 0 && (
            <div className="bg-surface rounded-lg p-4 border border-border-subtle">
              <h3 className="text-sm font-bold text-ink-muted mb-3">Commission Preview</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-ink-muted">Sale price</span>
                  <span className="text-ink font-medium">{formatPrice(previewPrice)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-muted">
                    {commissionPreview.capped
                      ? `Auction rail: 12% (capped at ${formatPrice(commissionPreview.capGbp)})`
                      : "Auction rail: 12%"}
                    <WhyLink href="/methodology/fees" tooltip="How is the commission and its cap decided?" />
                  </span>
                  <span className="text-danger">-{formatPrice(commission)}</span>
                </div>
                {commissionPreview.capped && (
                  <p className="text-xs text-ok">
                    Per-item cap applied — without it the 12% fee would have been{" "}
                    {formatPrice(commissionPreview.uncapped)}. We never charge more than{" "}
                    {formatPrice(commissionPreview.capGbp)} on a single sale.
                  </p>
                )}
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
            disabled={submitting}
            className="w-full py-3 bg-ink text-page font-bold rounded-lg hover:opacity-90 transition disabled:opacity-50"
          >
            {submitting ? "Submitting..." : "Submit Auction for Review"}
          </button>
        </form>
      </div>
    </div>
  );
}
