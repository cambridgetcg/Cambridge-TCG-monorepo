"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

type AuctionType = "english" | "dutch" | "buy_now";

interface UploadedImage {
  id?: string;
  url: string;
  s3Key: string;
  order: number;
}

const TYPE_OPTIONS: { value: AuctionType; label: string; desc: string }[] = [
  { value: "english", label: "English", desc: "Ascending bids, highest wins" },
  { value: "dutch", label: "Dutch", desc: "Price drops over time" },
  { value: "buy_now", label: "Buy Now", desc: "Fixed price, optional offers" },
];

export default function NewAuctionPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [auctionType, setAuctionType] = useState<AuctionType>("english");

  // English fields
  const [startingPrice, setStartingPrice] = useState("");
  const [reservePrice, setReservePrice] = useState("");
  const [bidIncrement, setBidIncrement] = useState("1.00");
  const [buyNowPrice, setBuyNowPrice] = useState("");

  // Dutch fields
  const [dutchStartPrice, setDutchStartPrice] = useState("");
  const [dutchEndPrice, setDutchEndPrice] = useState("");
  const [dutchDropAmount, setDutchDropAmount] = useState("");
  const [dutchDropInterval, setDutchDropInterval] = useState("60");

  // Buy Now fields
  const [buyNowFixedPrice, setBuyNowFixedPrice] = useState("");
  const [allowBestOffer, setAllowBestOffer] = useState(false);

  // Timing
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");

  // Post-create image upload
  const [createdAuctionId, setCreatedAuctionId] = useState<string | null>(null);
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [uploading, setUploading] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/submissions")
      .then((res) => {
        if (res.ok) setAuthed(true);
      });
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError("");
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        setLoginError("Wrong password.");
        return;
      }
      setAuthed(true);
      setPassword("");
    } catch {
      setLoginError("Network error.");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const body: Record<string, unknown> = {
        title,
        description: description || undefined,
        auction_type: auctionType,
        starts_at: new Date(startsAt).toISOString(),
        ends_at: new Date(endsAt).toISOString(),
      };

      if (auctionType === "english") {
        body.starting_price = parseFloat(startingPrice);
        if (reservePrice) body.reserve_price = parseFloat(reservePrice);
        if (bidIncrement) body.bid_increment = parseFloat(bidIncrement);
        if (buyNowPrice) body.buy_now_price = parseFloat(buyNowPrice);
      } else if (auctionType === "dutch") {
        body.starting_price = parseFloat(dutchStartPrice);
        body.dutch_start_price = parseFloat(dutchStartPrice);
        body.dutch_end_price = parseFloat(dutchEndPrice);
        body.dutch_price_drop = parseFloat(dutchDropAmount);
        body.dutch_drop_interval_seconds = parseInt(dutchDropInterval, 10);
      } else {
        body.starting_price = parseFloat(buyNowFixedPrice);
        body.buy_now_price = parseFloat(buyNowFixedPrice);
        body.allow_best_offer = allowBestOffer;
      }

      const res = await fetch("/api/auctions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create auction");
      }

      const auction = await res.json();
      setCreatedAuctionId(auction.id);
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
          body: JSON.stringify({
            auctionId: createdAuctionId,
            contentType: file.type,
          }),
        });

        if (!presignRes.ok) throw new Error("Failed to get upload URL");
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

  async function handleRemoveImage(imageId: string, auctionId: string) {
    try {
      const res = await fetch(`/api/auctions/${auctionId}/images`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageId }),
      });
      if (res.ok) {
        setImages((prev) => prev.filter((img) => img.id !== imageId));
      }
    } catch {
      // ignore
    }
  }

  // ── Login Screen ──
  if (!authed) {
    return (
      <main className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <form onSubmit={handleLogin} className="w-full max-w-sm px-4">
          <h1 className="text-2xl font-bold text-white text-center mb-8">Admin</h1>
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            className="w-full px-4 py-3 bg-neutral-900 border border-neutral-800 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 mb-4"
          />
          {loginError && (
            <p className="text-sm text-red-400 mb-4">{loginError}</p>
          )}
          <button
            type="submit"
            className="w-full py-3 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400 transition"
          >
            Log In
          </button>
        </form>
      </main>
    );
  }

  // ── Post-create: Image upload ──
  if (createdAuctionId) {
    return (
      <main className="min-h-screen bg-neutral-950">
        <div className="max-w-2xl mx-auto px-4 py-8">
          <div className="bg-neutral-900 rounded-xl p-6 mb-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <span className="text-emerald-400 text-sm">&#10003;</span>
              </div>
              <h2 className="text-lg font-bold text-white">Auction Created</h2>
            </div>
            <p className="text-sm text-neutral-400">
              ID: <span className="font-mono text-amber-400">{createdAuctionId}</span>
            </p>
          </div>

          <div className="bg-neutral-900 rounded-xl p-6">
            <h3 className="text-lg font-bold text-white mb-4">Upload Images</h3>

            {/* Uploaded images */}
            {images.length > 0 && (
              <div className="grid grid-cols-3 gap-3 mb-4">
                {images.map((img) => (
                  <div key={img.s3Key} className="relative group">
                    <img
                      src={img.url}
                      alt=""
                      className="w-full aspect-square object-cover rounded-lg"
                    />
                    {img.id && (
                      <button
                        onClick={() => handleRemoveImage(img.id!, createdAuctionId)}
                        className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white text-xs rounded-full opacity-0 group-hover:opacity-100 transition"
                      >
                        &#10005;
                      </button>
                    )}
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
              className="w-full py-3 border-2 border-dashed border-neutral-700 rounded-lg text-neutral-400 hover:border-amber-500/50 hover:text-amber-400 transition disabled:opacity-50"
            >
              {uploading ? "Uploading..." : "Click to upload images"}
            </button>
          </div>

          <div className="flex gap-3 mt-6">
            <button
              onClick={() => router.push("/admin/auctions")}
              className="flex-1 py-3 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400 transition text-center"
            >
              Done — Back to Auctions
            </button>
          </div>
        </div>
      </main>
    );
  }

  // ── Create form ──
  return (
    <main className="min-h-screen bg-neutral-950">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-white">New Auction</h1>
          <button
            onClick={() => router.push("/admin/auctions")}
            className="px-4 py-2 bg-neutral-800 text-white text-sm rounded-lg hover:bg-neutral-700 transition"
          >
            Cancel
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Title */}
          <div>
            <label className="block text-sm text-neutral-400 mb-2">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="w-full px-4 py-3 bg-neutral-900 border border-neutral-800 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              placeholder="e.g. Charizard Base Set Holo"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm text-neutral-400 mb-2">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-4 py-3 bg-neutral-900 border border-neutral-800 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 resize-none"
              placeholder="Condition, details, etc."
            />
          </div>

          {/* Auction Type */}
          <div>
            <label className="block text-sm text-neutral-400 mb-2">Auction Type</label>
            <div className="grid grid-cols-3 gap-3">
              {TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setAuctionType(opt.value)}
                  className={`p-4 rounded-xl border text-left transition ${
                    auctionType === opt.value
                      ? "border-amber-500 bg-amber-500/10"
                      : "border-neutral-800 bg-neutral-900 hover:border-neutral-700"
                  }`}
                >
                  <p className={`text-sm font-bold ${auctionType === opt.value ? "text-amber-400" : "text-white"}`}>
                    {opt.label}
                  </p>
                  <p className="text-xs text-neutral-500 mt-1">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Conditional fields */}
          {auctionType === "english" && (
            <div className="bg-neutral-900 rounded-xl p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-neutral-400 mb-2">Starting Price</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={startingPrice}
                    onChange={(e) => setStartingPrice(e.target.value)}
                    required
                    className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-sm text-neutral-400 mb-2">Reserve Price</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={reservePrice}
                    onChange={(e) => setReservePrice(e.target.value)}
                    className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                    placeholder="Optional"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-neutral-400 mb-2">Bid Increment</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={bidIncrement}
                    onChange={(e) => setBidIncrement(e.target.value)}
                    required
                    className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                    placeholder="1.00"
                  />
                </div>
                <div>
                  <label className="block text-sm text-neutral-400 mb-2">Buy Now Price</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={buyNowPrice}
                    onChange={(e) => setBuyNowPrice(e.target.value)}
                    className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                    placeholder="Optional"
                  />
                </div>
              </div>
            </div>
          )}

          {auctionType === "dutch" && (
            <div className="bg-neutral-900 rounded-xl p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-neutral-400 mb-2">Start Price</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={dutchStartPrice}
                    onChange={(e) => setDutchStartPrice(e.target.value)}
                    required
                    className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                    placeholder="100.00"
                  />
                </div>
                <div>
                  <label className="block text-sm text-neutral-400 mb-2">End Price</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={dutchEndPrice}
                    onChange={(e) => setDutchEndPrice(e.target.value)}
                    required
                    className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                    placeholder="10.00"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-neutral-400 mb-2">Drop Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={dutchDropAmount}
                    onChange={(e) => setDutchDropAmount(e.target.value)}
                    required
                    className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                    placeholder="5.00"
                  />
                </div>
                <div>
                  <label className="block text-sm text-neutral-400 mb-2">Drop Interval (seconds)</label>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    value={dutchDropInterval}
                    onChange={(e) => setDutchDropInterval(e.target.value)}
                    required
                    className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                    placeholder="60"
                  />
                </div>
              </div>
            </div>
          )}

          {auctionType === "buy_now" && (
            <div className="bg-neutral-900 rounded-xl p-4 space-y-4">
              <div>
                <label className="block text-sm text-neutral-400 mb-2">Price</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={buyNowFixedPrice}
                  onChange={(e) => setBuyNowFixedPrice(e.target.value)}
                  required
                  className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                  placeholder="0.00"
                />
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowBestOffer}
                  onChange={(e) => setAllowBestOffer(e.target.checked)}
                  className="w-4 h-4 rounded bg-neutral-800 border-neutral-700 text-amber-500 focus:ring-amber-500/50"
                />
                <span className="text-sm text-neutral-300">Allow Best Offer</span>
              </label>
            </div>
          )}

          {/* Timing */}
          <div className="bg-neutral-900 rounded-xl p-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-neutral-400 mb-2">Starts At</label>
                <input
                  type="datetime-local"
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                  required
                  className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50 [color-scheme:dark]"
                />
              </div>
              <div>
                <label className="block text-sm text-neutral-400 mb-2">Ends At</label>
                <input
                  type="datetime-local"
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                  required
                  className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50 [color-scheme:dark]"
                />
              </div>
            </div>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400 transition disabled:opacity-50"
          >
            {submitting ? "Creating..." : "Create Auction"}
          </button>
        </form>
      </div>
    </main>
  );
}
