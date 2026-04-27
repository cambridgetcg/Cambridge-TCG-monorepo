"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface CardImage {
  url: string;
  s3Key: string;
}

interface CardEntry {
  id: string;
  description: string;
  game: string;
  set_name: string;
  condition: string;
  quantity: number;
  notes: string;
  images: CardImage[];
}

function createCard(): CardEntry {
  return {
    id: crypto.randomUUID(),
    description: "",
    game: "",
    set_name: "",
    condition: "NM",
    quantity: 1,
    notes: "",
    images: [],
  };
}

const GAMES = ["One Piece", "Pokémon", "Dragon Ball", "Yu-Gi-Oh", "Other"];
const CONDITIONS = ["NM", "LP", "MP", "HP"];

const inputClass =
  "w-full px-4 py-3 bg-neutral-900 border border-neutral-800 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50";

export default function CustomQuotePage() {
  const router = useRouter();
  const [cards, setCards] = useState<CardEntry[]>([createCard()]);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "credit">("credit");
  const [deliveryMethod, setDeliveryMethod] = useState<"mail" | "instore">("mail");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [uploadingCardId, setUploadingCardId] = useState<string | null>(null);
  const fileInputRefs = useRef<Map<string, HTMLInputElement>>(new Map());

  function updateCard(id: string, patch: Partial<CardEntry>) {
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  function removeCard(id: string) {
    setCards((prev) => prev.filter((c) => c.id !== id));
  }

  function addCard() {
    setCards((prev) => [...prev, createCard()]);
  }

  async function handleImageUpload(cardId: string, files: FileList) {
    setUploadingCardId(cardId);
    const card = cards.find((c) => c.id === cardId);
    if (!card) return;

    const newImages: CardImage[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        // Step 1: Get presigned URL
        const presignRes = await fetch("/api/quotes/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contentType: file.type }),
        });

        if (!presignRes.ok) {
          console.error("Failed to get upload URL");
          continue;
        }

        const { uploadUrl, imageUrl, s3Key } = await presignRes.json();

        // Step 2: Upload file directly to S3
        const uploadRes = await fetch(uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });

        if (!uploadRes.ok) {
          console.error("Failed to upload file");
          continue;
        }

        newImages.push({ url: imageUrl, s3Key });
      } catch (err) {
        console.error("Upload error:", err);
      }
    }

    if (newImages.length > 0) {
      setCards((prev) =>
        prev.map((c) =>
          c.id === cardId ? { ...c, images: [...c.images, ...newImages] } : c
        )
      );
    }
    setUploadingCardId(null);
  }

  function removeImage(cardId: string, imageIndex: number) {
    setCards((prev) =>
      prev.map((c) =>
        c.id === cardId
          ? { ...c, images: c.images.filter((_, i) => i !== imageIndex) }
          : c
      )
    );
  }

  async function handleSubmit() {
    setError("");

    // Validate cards
    for (let i = 0; i < cards.length; i++) {
      if (!cards[i].description.trim()) {
        setError(`Card #${i + 1}: Description is required.`);
        return;
      }
      if (!cards[i].condition) {
        setError(`Card #${i + 1}: Condition is required.`);
        return;
      }
    }

    if (!customerName.trim()) {
      setError("Name is required.");
      return;
    }
    if (!customerEmail.trim()) {
      setError("Email is required.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: customerName.trim(),
          customerEmail: customerEmail.trim().toLowerCase(),
          customerPhone: customerPhone.trim() || undefined,
          paymentMethod,
          deliveryMethod,
          notes: notes.trim() || undefined,
          items: cards.map((c) => ({
            description: c.description.trim(),
            game: c.game || undefined,
            set_name: c.set_name.trim() || undefined,
            condition: c.condition,
            quantity: c.quantity,
            notes: c.notes.trim() || undefined,
            imageUrls: c.images,
          })),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Submission failed. Please try again.");
        setSubmitting(false);
        return;
      }

      router.push(`/trade-in/quote/${data.reference}`);
    } catch {
      setError("Network error. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-neutral-950">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Link
          href="/trade-in"
          className="text-sm text-neutral-400 hover:text-white transition mb-6 inline-block"
        >
          &larr; Back to trade-in
        </Link>

        <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">
          Custom Quote Request
        </h1>
        <p className="text-neutral-400 text-sm mb-8">
          Can&apos;t find your card on the buylist? Describe it here and we&apos;ll
          send you a personalised offer.
        </p>

        {/* Card entries */}
        <div className="space-y-6 mb-8">
          {cards.map((card, index) => (
            <div
              key={card.id}
              className="bg-neutral-900 rounded-xl p-5 relative"
            >
              {/* Card number badge */}
              <div className="flex items-center justify-between mb-4">
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-500 text-black text-xs font-bold">
                  #{index + 1}
                </span>
                {cards.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeCard(card.id)}
                    className="w-7 h-7 flex items-center justify-center rounded-full text-neutral-500 hover:text-red-400 hover:bg-neutral-800 transition"
                    aria-label={`Remove card ${index + 1}`}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                )}
              </div>

              <div className="space-y-4">
                {/* Description */}
                <div>
                  <label className="block text-xs font-medium text-neutral-400 mb-1">
                    Card Description *
                  </label>
                  <input
                    type="text"
                    placeholder='e.g. "Luffy OP01-001 Alt Art"'
                    value={card.description}
                    onChange={(e) =>
                      updateCard(card.id, { description: e.target.value })
                    }
                    className={inputClass}
                  />
                </div>

                {/* Game & Set — side by side */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-neutral-400 mb-1">
                      Game
                    </label>
                    <select
                      value={card.game}
                      onChange={(e) =>
                        updateCard(card.id, { game: e.target.value })
                      }
                      className={inputClass}
                    >
                      <option value="">Select game...</option>
                      {GAMES.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-400 mb-1">
                      Set Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Romance Dawn"
                      value={card.set_name}
                      onChange={(e) =>
                        updateCard(card.id, { set_name: e.target.value })
                      }
                      className={inputClass}
                    />
                  </div>
                </div>

                {/* Condition & Quantity — side by side */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-neutral-400 mb-1">
                      Condition *
                    </label>
                    <select
                      value={card.condition}
                      onChange={(e) =>
                        updateCard(card.id, { condition: e.target.value })
                      }
                      className={inputClass}
                    >
                      {CONDITIONS.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-400 mb-1">
                      Quantity
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={card.quantity}
                      onChange={(e) =>
                        updateCard(card.id, {
                          quantity: Math.max(1, parseInt(e.target.value) || 1),
                        })
                      }
                      className={inputClass}
                    />
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-xs font-medium text-neutral-400 mb-1">
                    Notes
                  </label>
                  <textarea
                    placeholder="Any details about this card..."
                    value={card.notes}
                    onChange={(e) =>
                      updateCard(card.id, { notes: e.target.value })
                    }
                    rows={2}
                    className={`${inputClass} resize-none`}
                  />
                </div>

                {/* Photo upload */}
                <div>
                  <label className="block text-xs font-medium text-neutral-400 mb-2">
                    Photos
                  </label>

                  {/* Thumbnails */}
                  {card.images.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {card.images.map((img, imgIdx) => (
                        <div
                          key={imgIdx}
                          className="relative w-16 h-16 rounded-lg overflow-hidden bg-neutral-800 group"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={img.url}
                            alt={`Card ${index + 1} photo ${imgIdx + 1}`}
                            className="w-full h-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => removeImage(card.id, imgIdx)}
                            className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition"
                            aria-label="Remove photo"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="w-4 h-4 text-red-400"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={2}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M6 18L18 6M6 6l12 12"
                              />
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <input
                    ref={(el) => {
                      if (el) fileInputRefs.current.set(card.id, el);
                    }}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        handleImageUpload(card.id, e.target.files);
                        e.target.value = "";
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      fileInputRefs.current.get(card.id)?.click()
                    }
                    disabled={uploadingCardId === card.id}
                    className="px-4 py-2 text-sm border border-neutral-700 text-neutral-300 rounded-lg hover:border-neutral-600 hover:text-white transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {uploadingCardId === card.id
                      ? "Uploading..."
                      : "Upload Photos"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Add another card */}
        <button
          type="button"
          onClick={addCard}
          className="w-full py-3 border-2 border-dashed border-neutral-700 text-neutral-400 rounded-xl hover:border-amber-500/50 hover:text-amber-400 transition font-medium mb-10"
        >
          + Add Another Card
        </button>

        {/* Customer details */}
        <div className="bg-neutral-900 rounded-xl p-5 mb-6">
          <h2 className="text-lg font-bold text-white mb-4">Your Details</h2>
          <div className="space-y-4">
            <input
              type="text"
              placeholder="Full name *"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className={inputClass}
            />
            <input
              type="email"
              placeholder="Email address *"
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
              className={inputClass}
            />
            <input
              type="tel"
              placeholder="Phone (optional)"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        {/* Payment preference */}
        <div className="bg-neutral-900 rounded-xl p-5 mb-6">
          <h3 className="text-sm font-bold text-white mb-3">
            Payment Preference
          </h3>
          <div className="flex gap-3">
            <label
              className={`flex-1 cursor-pointer rounded-lg border-2 p-3 text-center transition ${
                paymentMethod === "credit"
                  ? "border-amber-500 bg-amber-500/10"
                  : "border-neutral-700 hover:border-neutral-600"
              }`}
            >
              <input
                type="radio"
                name="payment"
                value="credit"
                checked={paymentMethod === "credit"}
                onChange={() => setPaymentMethod("credit")}
                className="sr-only"
              />
              <p className="text-sm font-bold text-white">Store Credit</p>
            </label>
            <label
              className={`flex-1 cursor-pointer rounded-lg border-2 p-3 text-center transition ${
                paymentMethod === "cash"
                  ? "border-amber-500 bg-amber-500/10"
                  : "border-neutral-700 hover:border-neutral-600"
              }`}
            >
              <input
                type="radio"
                name="payment"
                value="cash"
                checked={paymentMethod === "cash"}
                onChange={() => setPaymentMethod("cash")}
                className="sr-only"
              />
              <p className="text-sm font-bold text-white">Cash</p>
            </label>
          </div>
        </div>

        {/* Delivery method */}
        <div className="bg-neutral-900 rounded-xl p-5 mb-6">
          <h3 className="text-sm font-bold text-white mb-3">
            Delivery Method
          </h3>
          <div className="flex gap-3">
            <label
              className={`flex-1 cursor-pointer rounded-lg border-2 p-3 transition ${
                deliveryMethod === "mail"
                  ? "border-amber-500 bg-amber-500/10"
                  : "border-neutral-700 hover:border-neutral-600"
              }`}
            >
              <input
                type="radio"
                name="delivery"
                value="mail"
                checked={deliveryMethod === "mail"}
                onChange={() => setDeliveryMethod("mail")}
                className="sr-only"
              />
              <p className="text-sm font-bold text-white">Mail-in</p>
              <p className="text-xs text-neutral-400 mt-1">
                Post your cards to us
              </p>
            </label>
            <label
              className={`flex-1 cursor-pointer rounded-lg border-2 p-3 transition ${
                deliveryMethod === "instore"
                  ? "border-amber-500 bg-amber-500/10"
                  : "border-neutral-700 hover:border-neutral-600"
              }`}
            >
              <input
                type="radio"
                name="delivery"
                value="instore"
                checked={deliveryMethod === "instore"}
                onChange={() => setDeliveryMethod("instore")}
                className="sr-only"
              />
              <p className="text-sm font-bold text-white">In-store</p>
              <p className="text-xs text-neutral-400 mt-1">
                Drop off in person
              </p>
            </label>
          </div>
        </div>

        {/* Notes */}
        <div className="bg-neutral-900 rounded-xl p-5 mb-6">
          <h3 className="text-sm font-bold text-white mb-2">
            Additional Notes
          </h3>
          <textarea
            placeholder="Anything else you'd like us to know..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className={`${inputClass} resize-none`}
          />
        </div>

        {/* Error */}
        {error && (
          <p className="text-sm text-red-400 bg-red-500/10 rounded-lg px-4 py-3 mb-6">
            {error}
          </p>
        )}

        {/* Submit */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full py-3 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? "Submitting..." : "Request Quote"}
        </button>

        <p className="text-xs text-neutral-500 text-center mt-4">
          We&apos;ll review your cards and email you an offer, usually within 24
          hours.
        </p>
      </div>
    </main>
  );
}
