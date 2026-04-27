"use client";

import { useState } from "react";
import { useSellCart } from "@/context/SellCartContext";
import { formatPrice } from "@/lib/format";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function SubmitTradeInPage() {
  const { items, cashTotal, creditTotal, updateQty, removeItem } = useSellCart();
  const router = useRouter();

  const [step, setStep] = useState<1 | 2>(1);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "credit">("credit");
  const [deliveryMethod, setDeliveryMethod] = useState<"mail" | "instore">("mail");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [sortCode, setSortCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [provideBankLater, setProvideBankLater] = useState(false);
  const [conditionOk, setConditionOk] = useState(false);
  const [ageOk, setAgeOk] = useState(false);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const total = paymentMethod === "cash" ? cashTotal : creditTotal;
  const shippingContribution = total >= 100;

  async function handleSubmit() {
    setError("");

    if (!name.trim() || !email.trim()) {
      setError("Name and email are required.");
      return;
    }
    if (!conditionOk || !ageOk) {
      setError("You must confirm the condition and age declarations.");
      return;
    }
    if (paymentMethod === "cash" && !provideBankLater && (!sortCode.trim() || !accountNumber.trim())) {
      setError("Please provide bank details or check 'Provide later'.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/tradein/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((i) => ({
            sku: i.sku,
            card_number: i.card_number,
            name: i.name,
            set_code: i.set_code,
            quantity: i.quantity,
            cash_price: i.cash_price,
            credit_price: i.credit_price,
          })),
          customerName: name.trim(),
          customerEmail: email.trim().toLowerCase(),
          customerPhone: phone.trim() || undefined,
          paymentMethod,
          deliveryMethod,
          bankSortCode: paymentMethod === "cash" && !provideBankLater ? sortCode.trim() : undefined,
          bankAccountNumber: paymentMethod === "cash" && !provideBankLater ? accountNumber.trim() : undefined,
          isOver18: ageOk,
          conditionDeclaration: conditionOk,
          notes: notes.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Submission failed. Please try again.");
        setSubmitting(false);
        return;
      }

      router.push(`/trade-in/confirm/${data.reference}`);
    } catch {
      setError("Network error. Please try again.");
      setSubmitting(false);
    }
  }

  if (items.length === 0) {
    return (
      <main className="min-h-screen bg-neutral-950">
        <div className="max-w-2xl mx-auto px-4 py-20 text-center">
          <h1 className="text-2xl font-bold text-white mb-4">No Cards Selected</h1>
          <p className="text-neutral-400 mb-6">Add cards from the buylist first.</p>
          <Link
            href="/trade-in"
            className="px-6 py-3 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400 transition"
          >
            Browse Buylist
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-950">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Link href="/trade-in" className="text-sm text-neutral-400 hover:text-white transition mb-6 inline-block">
          ← Back to buylist
        </Link>

        <h1 className="text-2xl md:text-3xl font-bold text-white mb-8">
          Submit Trade-In
        </h1>

        {/* Progress */}
        <div className="flex items-center gap-3 mb-8">
          <div className={`flex items-center gap-2 ${step >= 1 ? "text-amber-400" : "text-neutral-600"}`}>
            <span className="w-7 h-7 rounded-full border-2 border-current flex items-center justify-center text-xs font-bold">1</span>
            <span className="text-sm font-medium">Review</span>
          </div>
          <div className="flex-1 h-px bg-neutral-800" />
          <div className={`flex items-center gap-2 ${step >= 2 ? "text-amber-400" : "text-neutral-600"}`}>
            <span className="w-7 h-7 rounded-full border-2 border-current flex items-center justify-center text-xs font-bold">2</span>
            <span className="text-sm font-medium">Details</span>
          </div>
        </div>

        {step === 1 && (
          <div>
            {/* Items */}
            <div className="space-y-3 mb-6">
              {items.map((item) => (
                <div key={item.sku} className="flex gap-3 bg-neutral-900 rounded-xl p-3">
                  <div className="relative w-12 h-16 rounded-lg overflow-hidden bg-neutral-800 shrink-0">
                    {item.image_url ? (
                      <Image src={item.image_url} alt={item.name} fill className="object-cover" sizes="48px" />
                    ) : (
                      <div className="w-full h-full bg-neutral-700" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate text-white">{item.name}</p>
                    <p className="text-xs text-neutral-500">{item.card_number}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <button onClick={() => updateQty(item.sku, item.quantity - 1)} className="w-9 h-9 bg-neutral-700 hover:bg-neutral-600 rounded text-sm font-bold transition">-</button>
                      <span className="text-sm font-medium w-5 text-center">{item.quantity}</span>
                      <button onClick={() => updateQty(item.sku, item.quantity + 1)} className="w-9 h-9 bg-neutral-700 hover:bg-neutral-600 rounded text-sm font-bold transition">+</button>
                      <button onClick={() => removeItem(item.sku)} className="ml-auto text-xs text-neutral-500 hover:text-red-400 transition">Remove</button>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-neutral-500">Cash</p>
                    <p className="text-sm text-amber-400">{formatPrice(item.cash_price * item.quantity)}</p>
                    <p className="text-xs text-neutral-500 mt-1">Credit</p>
                    <p className="text-sm text-amber-400">{formatPrice(item.credit_price * item.quantity)}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Payment method */}
            <div className="bg-neutral-900 rounded-xl p-4 mb-6">
              <h3 className="text-sm font-bold text-white mb-3">Payment Method</h3>
              <div className="flex flex-col sm:flex-row gap-3">
                <label className={`flex-1 cursor-pointer rounded-lg border-2 p-3 text-center transition ${paymentMethod === "credit" ? "border-amber-500 bg-amber-500/10" : "border-neutral-700 hover:border-neutral-600"}`}>
                  <input type="radio" name="payment" value="credit" checked={paymentMethod === "credit"} onChange={() => setPaymentMethod("credit")} className="sr-only" />
                  <p className="text-sm font-bold text-white">Store Credit</p>
                  <p className="text-lg font-bold text-amber-400 mt-1">{formatPrice(creditTotal)}</p>
                  <p className="text-xs text-neutral-400 mt-1">1 business day</p>
                </label>
                <label className={`flex-1 cursor-pointer rounded-lg border-2 p-3 text-center transition ${paymentMethod === "cash" ? "border-amber-500 bg-amber-500/10" : "border-neutral-700 hover:border-neutral-600"}`}>
                  <input type="radio" name="payment" value="cash" checked={paymentMethod === "cash"} onChange={() => setPaymentMethod("cash")} className="sr-only" />
                  <p className="text-sm font-bold text-white">Cash</p>
                  <p className="text-lg font-bold text-amber-400 mt-1">{formatPrice(cashTotal)}</p>
                  <p className="text-xs text-neutral-400 mt-1">2 business days</p>
                </label>
              </div>
            </div>

            {/* Totals */}
            <div className="bg-neutral-900 rounded-xl p-4 mb-6">
              <div className="flex justify-between text-lg font-bold">
                <span className="text-white">Total ({paymentMethod === "cash" ? "Cash" : "Credit"})</span>
                <span className="text-amber-400">{formatPrice(total)}</span>
              </div>
              {shippingContribution && (
                <p className="text-sm text-emerald-400 mt-2">
                  We will contribute £2.70 towards your shipping
                </p>
              )}
            </div>

            <button
              onClick={() => setStep(2)}
              className="w-full py-3 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400 transition"
            >
              Continue to Details
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <button
              onClick={() => setStep(1)}
              className="text-sm text-neutral-400 hover:text-white transition"
            >
              ← Back to Review
            </button>

            {/* Contact details */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-white">Your Details</h3>
              <input
                type="text"
                placeholder="Full name *"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-3 bg-neutral-900 border border-neutral-800 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              />
              <input
                type="email"
                placeholder="Email address *"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-neutral-900 border border-neutral-800 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              />
              <input
                type="tel"
                placeholder="Phone (optional)"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-4 py-3 bg-neutral-900 border border-neutral-800 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              />
            </div>

            {/* Bank details (cash only) */}
            {paymentMethod === "cash" && (
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-white">Bank Details</h3>
                {!provideBankLater && (
                  <>
                    <input
                      type="text"
                      placeholder="Sort code (e.g. 12-34-56)"
                      value={sortCode}
                      onChange={(e) => setSortCode(e.target.value)}
                      className="w-full px-4 py-3 bg-neutral-900 border border-neutral-800 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                    />
                    <input
                      type="text"
                      placeholder="Account number"
                      value={accountNumber}
                      onChange={(e) => setAccountNumber(e.target.value)}
                      className="w-full px-4 py-3 bg-neutral-900 border border-neutral-800 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                    />
                  </>
                )}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={provideBankLater}
                    onChange={(e) => setProvideBankLater(e.target.checked)}
                    className="w-4 h-4 accent-amber-500"
                  />
                  <span className="text-sm text-neutral-400">I&apos;ll provide bank details later</span>
                </label>
              </div>
            )}

            {/* Delivery */}
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-white">Delivery Method</h3>
              <div className="flex flex-col sm:flex-row gap-3">
                <label className={`flex-1 cursor-pointer rounded-lg border-2 p-3 transition ${deliveryMethod === "mail" ? "border-amber-500 bg-amber-500/10" : "border-neutral-700 hover:border-neutral-600"}`}>
                  <input type="radio" name="delivery" value="mail" checked={deliveryMethod === "mail"} onChange={() => setDeliveryMethod("mail")} className="sr-only" />
                  <p className="text-sm font-bold text-white">Mail-in</p>
                  <p className="text-xs text-neutral-400 mt-1">Post your cards to us</p>
                </label>
                <label className={`flex-1 cursor-pointer rounded-lg border-2 p-3 transition ${deliveryMethod === "instore" ? "border-amber-500 bg-amber-500/10" : "border-neutral-700 hover:border-neutral-600"}`}>
                  <input type="radio" name="delivery" value="instore" checked={deliveryMethod === "instore"} onChange={() => setDeliveryMethod("instore")} className="sr-only" />
                  <p className="text-sm font-bold text-white">In-store</p>
                  <p className="text-xs text-neutral-400 mt-1">Drop off in person</p>
                </label>
              </div>
            </div>

            {/* Notes */}
            <div>
              <h3 className="text-sm font-bold text-white mb-2">Notes (optional)</h3>
              <textarea
                placeholder="Any additional information..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full px-4 py-3 bg-neutral-900 border border-neutral-800 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 resize-none"
              />
            </div>

            {/* Declarations */}
            <div className="space-y-3 bg-neutral-900 rounded-xl p-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={conditionOk}
                  onChange={(e) => setConditionOk(e.target.checked)}
                  className="w-4 h-4 accent-amber-500 mt-0.5"
                />
                <span className="text-sm text-neutral-300">
                  All cards are in <strong>Near Mint (NM)</strong> condition. I understand cards that do not meet this standard may be rejected or graded lower.
                </span>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={ageOk}
                  onChange={(e) => setAgeOk(e.target.checked)}
                  className="w-4 h-4 accent-amber-500 mt-0.5"
                />
                <span className="text-sm text-neutral-300">
                  I am <strong>18 years of age or over</strong>.
                </span>
              </label>
            </div>

            {/* Summary */}
            <div className="bg-neutral-900 rounded-xl p-4">
              <div className="flex justify-between text-lg font-bold">
                <span className="text-white">{paymentMethod === "cash" ? "Cash" : "Credit"} Payout</span>
                <span className="text-amber-400">{formatPrice(total)}</span>
              </div>
              <p className="text-xs text-neutral-500 mt-1">
                {items.reduce((s, i) => s + i.quantity, 0)} cards · Quote locked for 24h after review
              </p>
              {shippingContribution && (
                <p className="text-sm text-emerald-400 mt-2">
                  Includes £2.70 shipping contribution
                </p>
              )}
            </div>

            {error && (
              <p className="text-sm text-red-400 bg-red-500/10 rounded-lg px-4 py-3">
                {error}
              </p>
            )}

            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full py-3 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "Submitting..." : "Submit Trade-In"}
            </button>

            <p className="text-xs text-neutral-500 text-center">
              By submitting you agree to our{" "}
              <Link href="/trade-in/terms" className="text-amber-400 hover:underline">
                trade-in terms
              </Link>
              .
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
