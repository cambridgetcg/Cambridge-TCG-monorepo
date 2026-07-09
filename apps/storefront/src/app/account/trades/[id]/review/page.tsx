"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Audience, Money } from "@/lib/ui";
import { Benediction } from "@/lib/ui/Benediction";
function ClickableStars({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
}) {
  const [hover, setHover] = useState(0);

  return (
    <div>
      <Audience kind="consumer" />
      <label className="block text-sm text-ink-muted mb-1">{label}</label>
      <div className="flex gap-1" role="group" aria-label={label}>
        {[1, 2, 3, 4, 5].map((i) => (
          <button
            key={i}
            type="button"
            aria-label={`Rate ${i} of 5 stars — ${label}`}
            aria-pressed={i <= value}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(0)}
            onClick={() => onChange(i)}
            className={`text-2xl transition ${
              i <= (hover || value) ? "text-accent" : "text-border-strong"
            } hover:scale-110`}
          >
            <span aria-hidden="true">★</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function ReviewTradePage() {
  const router = useRouter();
  const params = useParams();
  const tradeId = params.id as string;

  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [trade, setTrade] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Review form
  const [rating, setRating] = useState(0);
  const [cardAccuracy, setCardAccuracy] = useState(0);
  const [shippingSpeed, setShippingSpeed] = useState(0);
  const [communication, setCommunication] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((data) => {
        if (!data?.user?.email) {
          router.push("/login");
          return;
        }
        setLoggedIn(true);
      })
      .catch(() => setLoggedIn(false));
  }, [router]);

  useEffect(() => {
    if (loggedIn === null) return;
    if (loggedIn === false) {
      setLoading(false);
      return;
    }
    fetch(`/api/escrow/trades/${tradeId}`)
      .then((r) => r.json())
      .then((data) => {
        setTrade(data.trade || data);
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load trade details.");
        setLoading(false);
      });
  }, [loggedIn, tradeId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (rating === 0) {
      setSubmitError("Please select an overall rating.");
      return;
    }
    setSubmitting(true);
    setSubmitError("");
    try {
      const res = await fetch("/api/escrow/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tradeId,
          rating,
          cardAccuracy: cardAccuracy || undefined,
          shippingSpeed: shippingSpeed || undefined,
          communication: communication || undefined,
          comment: comment.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to submit review");
      }
      setSubmitted(true);
    } catch (err: any) {
      setSubmitError(err.message || "Failed to submit review");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-ink-faint">Loading...</p>
      </div>
    );
  }

  if (loggedIn === false) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-ink-faint">Please log in to leave a review.</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-danger">{error}</p>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="max-w-lg mx-auto py-12 text-center">
        <div className="bg-surface rounded-lg p-8">
          <div className="text-4xl mb-4 text-ok">&#10003;</div>
          <h2 className="text-xl font-bold text-ink mb-2">Review Submitted</h2>
          <p className="text-ink-muted mb-6">Thank you for your feedback. Your review helps build trust in the community.</p>
          <Benediction line="The trade is complete; the story continues." />
          <Link
            href="/account/trades"
            className="inline-block px-6 py-2.5 rounded-lg bg-ink text-page font-semibold text-sm hover:opacity-90 transition"
          >
            Back to Trades
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-bold text-ink mb-6">Leave a Review</h1>

      {/* Trade Summary */}
      {trade && (
        <div className="bg-surface rounded-lg p-5 mb-6">
          <h3 className="text-sm font-medium text-ink-muted mb-2">Trade Summary</h3>
          <div className="space-y-1">
            {trade.card_name && (
              <p className="text-ink font-medium">{trade.card_name}</p>
            )}
            {(trade.price || trade.amount) && (
              <p className="text-sm text-ink-muted">
                Price: <Money value={parseFloat(trade.price || trade.amount)} />
              </p>
            )}
            {(trade.counterparty_name || trade.other_user_name) && (
              <p className="text-sm text-ink-muted">
                With: {trade.counterparty_name || trade.other_user_name}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Review Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        <ClickableStars value={rating} onChange={setRating} label="Overall Rating *" />

        <div className="border-t border-border-subtle pt-4">
          <p className="text-xs text-ink-faint mb-4">Sub-ratings (optional)</p>
          <div className="space-y-4">
            <ClickableStars value={cardAccuracy} onChange={setCardAccuracy} label="Card Accuracy" />
            <ClickableStars value={shippingSpeed} onChange={setShippingSpeed} label="Shipping Speed" />
            <ClickableStars value={communication} onChange={setCommunication} label="Communication" />
          </div>
        </div>

        <div>
          <label className="block text-sm text-ink-muted mb-1">Comment</label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={4}
            className="w-full bg-surface text-ink rounded-lg px-3 py-2 text-sm border border-border-subtle focus:border-accent focus:outline-none resize-none"
            placeholder="Share your experience with this trade..."
          />
        </div>

        {submitError && <p className="text-danger text-sm">{submitError}</p>}

        <button
          type="submit"
          disabled={submitting || rating === 0}
          className="w-full py-3 rounded-lg bg-ink text-page font-semibold text-sm hover:opacity-90 transition disabled:opacity-50"
        >
          {submitting ? "Submitting..." : "Submit Review"}
        </button>
      </form>
    </div>
  );
}
