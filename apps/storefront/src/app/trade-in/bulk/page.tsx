"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatPrice } from "@/lib/format";

export default function BulkTradeInPage() {
  const router = useRouter();
  const PRICE_PER_CARD = 0.02; // 2p per card

  const [cardCount, setCardCount] = useState("");
  const [game, setGame] = useState("one-piece");
  const [deliveryMethod, setDeliveryMethod] = useState<"mail" | "instore">("mail");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const count = parseInt(cardCount) || 0;
  const baseTotal = count * PRICE_PER_CARD;

  async function handleSubmit() {
    setError("");
    if (count < 50) { setError("Minimum 50 cards for bulk trade-in."); return; }
    if (!name.trim() || !email.trim()) { setError("Name and email are required."); return; }

    setSubmitting(true);
    try {
      const res = await fetch("/api/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: name.trim(),
          customerEmail: email.trim().toLowerCase(),
          customerPhone: phone.trim() || undefined,
          paymentMethod: "credit",
          deliveryMethod,
          notes: [
            "BULK TRADE-IN",
            `Estimated cards: ${count}`,
            `Game: ${game}`,
            `Base rate: 2p per card`,
            `Estimated base total: £${baseTotal.toFixed(2)}`,
            notes.trim() ? `Customer notes: ${notes.trim()}` : "",
            "",
            "Note: Valuable cards found in bulk will be paid at 85% market value instead of the 2p rate.",
          ].filter(Boolean).join("\n"),
          items: [{
            description: `Bulk C/UC/R cards (${count} cards at 2p each)`,
            game: game === "other" ? undefined : game,
            condition: "NM",
            quantity: count,
            customer_notes: `Bulk trade-in. ${count} cards at 2p/card base rate. Valuable cards paid at 85% market.`,
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

  const inputClass = "w-full px-4 py-3 bg-neutral-900 border border-neutral-800 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50";

  return (
    <main className="min-h-screen bg-neutral-950">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Link href="/trade-in" className="text-sm text-neutral-400 hover:text-white transition mb-6 inline-block">
          &larr; Back to trade-in
        </Link>

        <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">
          Bulk Card Trade-In
        </h1>
        <p className="text-neutral-400 mb-8">
          Got stacks of commons, uncommons, and rares? We buy them all. No sorting needed — just count and send.
        </p>

        {/* How it works */}
        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-5 mb-8">
          <h3 className="text-sm font-bold text-white mb-4">How Bulk Trade-In Works</h3>

          <div className="space-y-4 text-sm">
            <div className="flex items-start gap-3">
              <span className="shrink-0 w-14 text-right font-bold text-emerald-400">2p</span>
              <p className="text-neutral-300">
                <span className="text-white font-semibold">Fixed rate for every C, UC, and R card.</span> No need to look up individual prices. Just count your cards and send them in.
              </p>
            </div>

            <div className="flex items-start gap-3">
              <span className="shrink-0 w-14 text-right font-bold text-amber-400">85%</span>
              <p className="text-neutral-300">
                <span className="text-white font-semibold">If we find something valuable in your bulk, we pay 85% of market value</span> instead of the 2p rate. The value of C/UC/R cards varies hugely — some &quot;rare&quot; cards are worth £50+. We check every card and pay you fairly for any gems.
              </p>
            </div>

            <div className="flex items-start gap-3">
              <span className="shrink-0 w-14 text-right font-bold text-purple-400">Credit</span>
              <p className="text-neutral-300">
                Paid in <span className="text-white font-semibold">store credit</span>. Use it to buy cards you actually want from our shop. Bulk + credit = the best way to turn unused cards into cards you love.
              </p>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-emerald-500/10">
            <p className="text-xs text-neutral-500">
              This service is designed for non-players and casual collectors who want to clear out bulk without going through every card. We do the sorting for you. Minimum 50 cards.
            </p>
          </div>
        </div>

        {/* Calculator */}
        <div className="bg-neutral-900 rounded-xl p-5 mb-8">
          <h3 className="text-sm font-bold text-white mb-4">Quick Calculator</h3>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="block text-xs text-neutral-400 mb-1">Number of cards</label>
              <input
                type="number"
                placeholder="e.g. 500"
                value={cardCount}
                onChange={(e) => setCardCount(e.target.value)}
                min={50}
                className={inputClass}
              />
            </div>
            <div className="text-center pt-5">
              <span className="text-neutral-500">=</span>
            </div>
            <div className="flex-1 text-center pt-5">
              <p className="text-2xl font-bold text-emerald-400">{formatPrice(baseTotal)}</p>
              <p className="text-xs text-neutral-500">base value (+ bonuses for gems)</p>
            </div>
          </div>
          {count > 0 && count < 50 && (
            <p className="text-xs text-amber-400 mt-2">Minimum 50 cards for bulk trade-in.</p>
          )}
        </div>

        {/* Example value tiers */}
        <div className="bg-neutral-900 rounded-xl p-5 mb-8">
          <h3 className="text-sm font-bold text-white mb-3">Example Payouts</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-neutral-500 text-xs uppercase tracking-wide border-b border-neutral-800">
                  <th className="text-left py-2">Cards</th>
                  <th className="text-right py-2">Base (2p each)</th>
                  <th className="text-right py-2">If 5 gems found</th>
                </tr>
              </thead>
              <tbody className="text-neutral-300">
                <tr className="border-b border-neutral-800">
                  <td className="py-2">100 cards</td>
                  <td className="text-right text-emerald-400">£2.00</td>
                  <td className="text-right text-amber-400">£2.00 + gems bonus</td>
                </tr>
                <tr className="border-b border-neutral-800">
                  <td className="py-2">500 cards</td>
                  <td className="text-right text-emerald-400">£10.00</td>
                  <td className="text-right text-amber-400">£10.00 + gems bonus</td>
                </tr>
                <tr className="border-b border-neutral-800">
                  <td className="py-2">1,000 cards</td>
                  <td className="text-right text-emerald-400">£20.00</td>
                  <td className="text-right text-amber-400">£20.00 + gems bonus</td>
                </tr>
                <tr>
                  <td className="py-2">5,000 cards</td>
                  <td className="text-right text-emerald-400">£100.00</td>
                  <td className="text-right text-amber-400">£100.00 + gems bonus</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-neutral-500 mt-3">
            &quot;Gems&quot; are cards worth significantly more than 2p — alt art rares, valuable uncommons, tournament staples. We pay 85% of market value for these, credited separately on top of the base payout.
          </p>
        </div>

        {/* Form */}
        <div className="space-y-6">
          <hr className="border-neutral-800" />

          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-neutral-400 mb-1">Game</label>
              <select value={game} onChange={(e) => setGame(e.target.value)} className={inputClass}>
                <option value="one-piece">One Piece</option>
                <option value="pokemon">Pokémon</option>
                <option value="dragon-ball">Dragon Ball</option>
                <option value="yugioh">Yu-Gi-Oh</option>
                <option value="mixed">Mixed games</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-400 mb-1">Delivery</label>
              <div className="flex gap-3">
                <label className={`flex-1 cursor-pointer rounded-lg border-2 p-3 text-center transition ${deliveryMethod === "mail" ? "border-emerald-500 bg-emerald-500/10" : "border-neutral-700 hover:border-neutral-600"}`}>
                  <input type="radio" name="delivery" value="mail" checked={deliveryMethod === "mail"} onChange={() => setDeliveryMethod("mail")} className="sr-only" />
                  <p className="text-sm font-bold text-white">Mail-in</p>
                </label>
                <label className={`flex-1 cursor-pointer rounded-lg border-2 p-3 text-center transition ${deliveryMethod === "instore" ? "border-emerald-500 bg-emerald-500/10" : "border-neutral-700 hover:border-neutral-600"}`}>
                  <input type="radio" name="delivery" value="instore" checked={deliveryMethod === "instore"} onChange={() => setDeliveryMethod("instore")} className="sr-only" />
                  <p className="text-sm font-bold text-white">In-store</p>
                </label>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-bold text-white">Your Details</h3>
            <input type="text" placeholder="Full name *" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
            <input type="email" placeholder="Email address *" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
            <input type="tel" placeholder="Phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
          </div>

          <div>
            <label className="block text-sm font-bold text-white mb-2">Notes (optional)</label>
            <textarea
              placeholder="Anything else we should know — sets included, storage method, etc."
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
            disabled={submitting || count < 50}
            className="w-full py-3 bg-emerald-500 text-black font-bold rounded-lg hover:bg-emerald-400 transition disabled:opacity-50"
          >
            {submitting ? "Submitting..." : count >= 50 ? `Submit ${count.toLocaleString()} Cards — Base Value ${formatPrice(baseTotal)}` : "Enter at least 50 cards"}
          </button>

          <p className="text-xs text-neutral-500 text-center">
            After submission, we&apos;ll confirm your details and provide shipping instructions.
            Final payout may be higher than the base value if valuable cards are found.
            By submitting you agree to our{" "}
            <Link href="/trade-in/terms" className="text-amber-400 hover:underline">trade-in terms</Link>.
          </p>
        </div>
      </div>
    </main>
  );
}
