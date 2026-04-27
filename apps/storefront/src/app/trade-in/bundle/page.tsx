"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";

interface BundleImage {
  url: string;
  s3Key: string;
  file?: File;
}

export default function BundleTradeInPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [estimatedCards, setEstimatedCards] = useState("");
  const [game, setGame] = useState("one-piece");
  const [condition, setCondition] = useState("mixed");
  const [paymentMethod, setPaymentMethod] = useState<"credit" | "cash">("credit");
  const [deliveryMethod, setDeliveryMethod] = useState<"mail" | "instore">("mail");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [images, setImages] = useState<BundleImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleImageUpload(files: FileList) {
    setUploading(true);
    const newImages: BundleImage[] = [];

    for (let i = 0; i < Math.min(files.length, 20); i++) {
      const file = files[i];
      try {
        const presignRes = await fetch("/api/quotes/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contentType: file.type }),
        });
        if (!presignRes.ok) continue;

        const { uploadUrl, imageUrl, s3Key } = await presignRes.json();
        const uploadRes = await fetch(uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!uploadRes.ok) continue;

        newImages.push({ url: imageUrl, s3Key });
      } catch {
        // Skip failed uploads
      }
    }

    if (newImages.length > 0) {
      setImages((prev) => [...prev, ...newImages]);
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeImage(index: number) {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit() {
    setError("");

    if (!title.trim()) { setError("Give your bundle a title (e.g. 'OP01 complete set' or '200+ One Piece cards')."); return; }
    if (!name.trim() || !email.trim()) { setError("Name and email are required."); return; }
    if (images.length === 0) { setError("Please upload at least one photo of your cards."); return; }

    setSubmitting(true);
    try {
      const res = await fetch("/api/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: name.trim(),
          customerEmail: email.trim().toLowerCase(),
          customerPhone: phone.trim() || undefined,
          paymentMethod,
          deliveryMethod,
          notes: [
            `BUNDLE SUBMISSION`,
            `Title: ${title.trim()}`,
            `Estimated cards: ${estimatedCards || "not specified"}`,
            `Game: ${game}`,
            `Overall condition: ${condition}`,
            notes.trim() ? `Notes: ${notes.trim()}` : "",
          ].filter(Boolean).join("\n"),
          items: [{
            description: title.trim(),
            game: game === "other" ? undefined : game,
            condition: "NM",
            quantity: parseInt(estimatedCards) || 1,
            customer_notes: `Bundle/bulk submission. Overall condition: ${condition}. ${notes.trim()}`,
            imageUrls: images.map(img => ({ url: img.url, s3Key: img.s3Key })),
          }],
        }),
      });

      const data = await res.json();
      if (!res.ok) { setError(data.error || "Submission failed."); setSubmitting(false); return; }

      router.push(`/trade-in/quote/${data.reference}`);
    } catch {
      setError("Network error. Please try again.");
      setSubmitting(false);
    }
  }

  const inputClass = "w-full px-4 py-3 bg-neutral-900 border border-neutral-800 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50";

  return (
    <main className="min-h-screen bg-neutral-950">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Link href="/trade-in" className="text-sm text-neutral-400 hover:text-white transition mb-6 inline-block">
          &larr; Back to trade-in
        </Link>

        <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">
          Sell a Bundle or Collection
        </h1>
        <p className="text-neutral-400 mb-8">
          Have a large collection, complete set, or bulk cards to sell? Upload photos of everything and we&apos;ll send you an offer for the lot.
        </p>

        {/* How it works */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 mb-8">
          <h3 className="text-sm font-bold text-white mb-3">How Bundle Trade-In Works</h3>
          <div className="grid gap-3 sm:grid-cols-3 text-sm">
            <div className="flex gap-3">
              <span className="shrink-0 w-6 h-6 bg-amber-500/20 text-amber-400 rounded-full flex items-center justify-center text-xs font-bold">1</span>
              <p className="text-neutral-300">Upload photos of your cards — front, back, overview shots</p>
            </div>
            <div className="flex gap-3">
              <span className="shrink-0 w-6 h-6 bg-amber-500/20 text-amber-400 rounded-full flex items-center justify-center text-xs font-bold">2</span>
              <p className="text-neutral-300">We review and send you an offer within 1-2 business days</p>
            </div>
            <div className="flex gap-3">
              <span className="shrink-0 w-6 h-6 bg-amber-500/20 text-amber-400 rounded-full flex items-center justify-center text-xs font-bold">3</span>
              <p className="text-neutral-300">Accept the offer, send your cards, get paid</p>
            </div>
          </div>
        </div>

        {/* Bundle details */}
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-bold text-white mb-2">What are you selling? *</label>
            <input
              type="text"
              placeholder="e.g. 'OP01 Romance Dawn complete set' or '200+ One Piece cards'"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={inputClass}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-medium text-neutral-400 mb-1">Game</label>
              <select value={game} onChange={(e) => setGame(e.target.value)} className={inputClass}>
                <option value="one-piece">One Piece</option>
                <option value="pokemon">Pokémon</option>
                <option value="dragon-ball">Dragon Ball</option>
                <option value="yugioh">Yu-Gi-Oh</option>
                <option value="mixed">Mixed / Multiple</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-400 mb-1">Estimated Cards</label>
              <input
                type="number"
                placeholder="e.g. 50"
                value={estimatedCards}
                onChange={(e) => setEstimatedCards(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-400 mb-1">Overall Condition</label>
              <select value={condition} onChange={(e) => setCondition(e.target.value)} className={inputClass}>
                <option value="mint">All MINT (pack-fresh)</option>
                <option value="nm">All Near Mint</option>
                <option value="mixed">Mixed conditions</option>
                <option value="lp">Mostly Light Play</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-white mb-2">Description</label>
            <textarea
              placeholder="Tell us about your collection — sets included, notable cards, overall condition, anything else..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className={`${inputClass} resize-none`}
            />
          </div>

          {/* Photo upload */}
          <div>
            <label className="block text-sm font-bold text-white mb-2">Photos * <span className="text-neutral-500 font-normal">(up to 20)</span></label>
            <p className="text-xs text-neutral-500 mb-3">
              Upload overview shots of your collection, close-ups of valuable cards, and any graded slabs. More photos = better offer.
            </p>

            {images.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 mb-3">
                {images.map((img, i) => (
                  <div key={i} className="relative aspect-square rounded-lg overflow-hidden bg-neutral-800 group">
                    <Image src={img.url} alt={`Photo ${i + 1}`} fill className="object-cover" sizes="100px" />
                    <button
                      onClick={() => removeImage(i)}
                      className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs opacity-0 group-hover:opacity-100 transition flex items-center justify-center"
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => e.target.files && handleImageUpload(e.target.files)}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || images.length >= 20}
              className="w-full py-3 border-2 border-dashed border-neutral-700 rounded-lg text-neutral-400 hover:border-amber-500/50 hover:text-white transition disabled:opacity-50"
            >
              {uploading ? "Uploading..." : images.length >= 20 ? "Maximum 20 photos" : `Upload Photos (${images.length}/20)`}
            </button>
          </div>

          <hr className="border-neutral-800" />

          {/* Customer details */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-white">Your Details</h3>
            <input type="text" placeholder="Full name *" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
            <input type="email" placeholder="Email address *" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
            <input type="tel" placeholder="Phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
          </div>

          {/* Payment + delivery */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <h3 className="text-sm font-bold text-white mb-3">Payment Preference</h3>
              <div className="flex gap-3">
                <label className={`flex-1 cursor-pointer rounded-lg border-2 p-3 text-center transition ${paymentMethod === "credit" ? "border-purple-500 bg-purple-500/10" : "border-neutral-700 hover:border-neutral-600"}`}>
                  <input type="radio" name="payment" value="credit" checked={paymentMethod === "credit"} onChange={() => setPaymentMethod("credit")} className="sr-only" />
                  <p className="text-sm font-bold text-white">Credit</p>
                  <p className="text-xs text-neutral-400">Up to 100%</p>
                </label>
                <label className={`flex-1 cursor-pointer rounded-lg border-2 p-3 text-center transition ${paymentMethod === "cash" ? "border-emerald-500 bg-emerald-500/10" : "border-neutral-700 hover:border-neutral-600"}`}>
                  <input type="radio" name="payment" value="cash" checked={paymentMethod === "cash"} onChange={() => setPaymentMethod("cash")} className="sr-only" />
                  <p className="text-sm font-bold text-white">Cash</p>
                  <p className="text-xs text-neutral-400">Up to 85%</p>
                </label>
              </div>
            </div>
            <div>
              <h3 className="text-sm font-bold text-white mb-3">Delivery Method</h3>
              <div className="flex gap-3">
                <label className={`flex-1 cursor-pointer rounded-lg border-2 p-3 text-center transition ${deliveryMethod === "mail" ? "border-amber-500 bg-amber-500/10" : "border-neutral-700 hover:border-neutral-600"}`}>
                  <input type="radio" name="delivery" value="mail" checked={deliveryMethod === "mail"} onChange={() => setDeliveryMethod("mail")} className="sr-only" />
                  <p className="text-sm font-bold text-white">Mail-in</p>
                  <p className="text-xs text-neutral-400">Post to us</p>
                </label>
                <label className={`flex-1 cursor-pointer rounded-lg border-2 p-3 text-center transition ${deliveryMethod === "instore" ? "border-amber-500 bg-amber-500/10" : "border-neutral-700 hover:border-neutral-600"}`}>
                  <input type="radio" name="delivery" value="instore" checked={deliveryMethod === "instore"} onChange={() => setDeliveryMethod("instore")} className="sr-only" />
                  <p className="text-sm font-bold text-white">In-store</p>
                  <p className="text-xs text-neutral-400">Drop off</p>
                </label>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-white mb-2">Additional Notes</label>
            <textarea
              placeholder="Anything else we should know..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className={`${inputClass} resize-none`}
            />
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-500/10 rounded-lg px-4 py-3">{error}</p>
          )}

          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full py-3 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400 transition disabled:opacity-50"
          >
            {submitting ? "Submitting..." : "Submit Bundle for Quote"}
          </button>

          <p className="text-xs text-neutral-500 text-center">
            We&apos;ll review your photos and send you an offer within 1-2 business days.
            By submitting you agree to our{" "}
            <Link href="/trade-in/terms" className="text-amber-400 hover:underline">trade-in terms</Link>.
          </p>
        </div>
      </div>
    </main>
  );
}
