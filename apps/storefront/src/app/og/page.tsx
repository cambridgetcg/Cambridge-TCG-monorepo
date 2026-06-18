"use client";

import { useState } from "react";
import Link from "next/link";

type ClaimStep = "form" | "submitting" | "success" | "error";

export default function OGClaimPage() {
  const [step, setStep] = useState<ClaimStep>("form");
  const [email, setEmail] = useState("");
  const [platform, setPlatform] = useState("");
  const [orderRef, setOrderRef] = useState("");
  const [username, setUsername] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!email.trim() || !email.includes("@")) { setError("Valid email required."); return; }
    if (!platform) { setError("Select which platform you purchased from."); return; }
    if (!orderRef.trim() && !username.trim()) { setError("Provide an order reference or your username on the platform."); return; }

    setStep("submitting");

    try {
      const res = await fetch("/api/og/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          platform,
          orderRef: orderRef.trim(),
          username: username.trim(),
          notes: notes.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Submission failed.");
        setStep("form");
        return;
      }

      setStep("success");
    } catch {
      setError("Network error. Please try again.");
      setStep("form");
    }
  }

  if (step === "success") {
    return (
      <main className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <div className="max-w-md px-4 text-center">
          <div className="text-5xl mb-5">👑</div>
          <h1 className="text-2xl font-bold text-white mb-3">Thank You, OG</h1>
          <p className="text-neutral-400 mb-4">
            Your claim has been submitted. We&apos;ll verify your purchase history and activate your OG status within 1-2 business days.
          </p>
          <p className="text-neutral-400 mb-6">
            You&apos;ll receive an email at <span className="text-white font-medium">{email}</span> once confirmed — with all your perks ready to go.
          </p>
          <p className="text-sm text-neutral-500 mb-8">
            You were here before the hype. That means everything to us.
          </p>
          <Link
            href="/"
            className="px-6 py-3 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400 transition inline-block"
          >
            Back to Shop
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-950">
      <div className="max-w-xl mx-auto px-4 py-12">
        {/* Hero */}
        <div className="text-center mb-10">
          <div className="text-5xl mb-4">👑</div>
          <h1 className="text-3xl md:text-4xl font-black text-white">
            Claim Your <span className="text-amber-400">OG Status</span>
          </h1>
          <p className="text-neutral-400 mt-4 max-w-lg mx-auto leading-relaxed">
            You were here at the very start of the journey. When no one was paying attention to One Piece TCG. Before the hype, before the prices, before the mainstream caught on.
          </p>
          <p className="text-neutral-400 mt-3 max-w-lg mx-auto leading-relaxed">
            You are the true fans. The true collectors. The ones who stayed through the highs and lows — not for the money, but for the cards, the art, the community.
          </p>
          <p className="text-white mt-3 max-w-lg mx-auto leading-relaxed font-medium">
            We are grateful to have had you from the beginning. You deserve the best, and this is our way of saying thank you.
          </p>
        </div>

        {/* Letter */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 mb-8 text-sm text-neutral-300 leading-relaxed">
          <p>If you&apos;ve ever purchased from Cambridge TCG — on eBay, Cardmarket, our Shopify store, in person, or anywhere else — you qualify for <strong className="text-amber-400">permanent OG membership</strong>.</p>
          <p className="mt-3">OG status cannot be bought. It cannot be earned through spending. It is reserved exclusively for those who believed in us and in the One Piece TCG community before anyone else did.</p>
          <p className="mt-3">This is forever. No subscriptions. No renewals. Just our gratitude, built into your account.</p>
        </div>

        {/* What you get */}
        <div className="bg-gradient-to-r from-amber-500/10 to-yellow-500/10 border border-amber-500/20 rounded-xl p-5 mb-8">
          <h2 className="text-white font-bold mb-3 flex items-center gap-2">
            <span>👑</span> OG Member Perks
          </h2>
          <div className="grid gap-2 sm:grid-cols-2 text-sm">
            <div className="flex items-center gap-2 text-neutral-300">
              <span className="text-emerald-400">&#10003;</span> 7% store discount
            </div>
            <div className="flex items-center gap-2 text-neutral-300">
              <span className="text-emerald-400">&#10003;</span> 7% cashback on cash
            </div>
            <div className="flex items-center gap-2 text-neutral-300">
              <span className="text-emerald-400">&#10003;</span> 7x Berries multiplier
            </div>
            <div className="flex items-center gap-2 text-neutral-300">
              <span className="text-emerald-400">&#10003;</span> 0% P2P commission
            </div>
            <div className="flex items-center gap-2 text-neutral-300">
              <span className="text-emerald-400">&#10003;</span> 0% auction fees
            </div>
            <div className="flex items-center gap-2 text-neutral-300">
              <span className="text-emerald-400">&#10003;</span> Priority everything
            </div>
          </div>
          <p className="text-xs text-amber-400/70 mt-3">Free forever. Cannot be purchased. Exclusive to original customers.</p>
        </div>

        {/* Claim form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-bold text-white mb-2">Your email *</label>
            <p className="text-xs text-neutral-500 mb-2">Use the same email you&apos;ll sign in with on Cambridge TCG. If you don&apos;t have an account yet, one will be created.</p>
            <input
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-3 bg-neutral-900 border border-neutral-800 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-white mb-2">Where did you buy from us? *</label>
            <div className="grid gap-2 grid-cols-2 sm:grid-cols-3">
              {[
                { value: "ebay", label: "eBay", icon: "🏷️" },
                { value: "cardmarket", label: "Cardmarket", icon: "🃏" },
                { value: "shopify", label: "Shopify Store", icon: "🛒" },
                { value: "etsy", label: "Etsy", icon: "🧵" },
                { value: "instore", label: "In-Store", icon: "🏪" },
                { value: "other", label: "Other", icon: "📦" },
              ].map((p) => (
                <label
                  key={p.value}
                  className={`cursor-pointer rounded-lg border-2 p-3 text-center transition ${
                    platform === p.value
                      ? "border-amber-500 bg-amber-500/10"
                      : "border-neutral-700 hover:border-neutral-600"
                  }`}
                >
                  <input
                    type="radio"
                    name="platform"
                    value={p.value}
                    checked={platform === p.value}
                    onChange={() => setPlatform(p.value)}
                    className="sr-only"
                  />
                  <span className="text-lg block">{p.icon}</span>
                  <span className="text-xs text-white font-medium">{p.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-white mb-2">Order reference or transaction ID</label>
            <p className="text-xs text-neutral-500 mb-2">Any order number, eBay transaction ID, or Cardmarket order reference. Helps us verify faster.</p>
            <input
              type="text"
              placeholder="e.g. eBay order #12-34567-89012"
              value={orderRef}
              onChange={(e) => setOrderRef(e.target.value)}
              className="w-full px-4 py-3 bg-neutral-900 border border-neutral-800 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-white mb-2">Your username on that platform</label>
            <p className="text-xs text-neutral-500 mb-2">Your eBay username, Cardmarket handle, etc. We can look up your purchase history.</p>
            <input
              type="text"
              placeholder="e.g. card_collector_2024"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-3 bg-neutral-900 border border-neutral-800 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-white mb-2">Anything else (optional)</label>
            <textarea
              placeholder="Approximate date of purchase, what you bought, your name on the order..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full px-4 py-3 bg-neutral-900 border border-neutral-800 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 resize-none"
            />
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-500/10 rounded-lg px-4 py-3">{error}</p>
          )}

          <button
            type="submit"
            disabled={step === "submitting"}
            className="w-full py-3 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400 transition disabled:opacity-50"
          >
            {step === "submitting" ? "Submitting..." : "Claim OG Status"}
          </button>

          <p className="text-xs text-neutral-500 text-center">
            We&apos;ll verify your purchase history and activate OG status within 1-2 business days.
            One claim per person. Fraudulent claims will be rejected.
          </p>
        </form>
      </div>
    </main>
  );
}
