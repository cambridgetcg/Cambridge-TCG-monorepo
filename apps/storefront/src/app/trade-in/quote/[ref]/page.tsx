"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Badge, Palettes } from "@/lib/ui";

interface QuoteImage {
  url: string;
  s3Key: string;
}

interface QuoteItem {
  description: string;
  game?: string;
  set_name?: string;
  condition: string;
  quantity: number;
  notes?: string;
  imageUrls: QuoteImage[];
  offeredPrice?: number;
}

interface QuoteData {
  reference: string;
  status: "pending" | "quoted" | "accepted" | "declined" | "expired" | "cancelled";
  createdAt: string;
  customerName: string;
  paymentMethod: "cash" | "credit";
  deliveryMethod: "mail" | "instore";
  notes?: string;
  items: QuoteItem[];
  total?: number;
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending Review",
  quoted: "Quote Ready",
  accepted: "Accepted",
  declined: "Declined",
  expired: "Expired",
  cancelled: "Cancelled",
};

export default function QuoteStatusPage() {
  const params = useParams();
  const ref = params.ref as string;

  const [data, setData] = useState<QuoteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/quotes/${encodeURIComponent(ref)}`);
        if (!res.ok) {
          setError("Quote not found. Please check your reference number.");
          setLoading(false);
          return;
        }
        const json = await res.json();
        setData(json);
      } catch {
        setError("Failed to load quote details.");
      }
      setLoading(false);
    }
    load();
  }, [ref]);

  async function handleAction(action: "accept" | "decline") {
    if (!data) return;
    setActionError("");
    setActionLoading(true);
    try {
      const res = await fetch(`/api/quotes/${encodeURIComponent(ref)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (!res.ok) {
        setActionError(json.error || "Action failed. Please try again.");
        setActionLoading(false);
        return;
      }
      setData(json);
    } catch {
      setActionError("Network error. Please try again.");
    }
    setActionLoading(false);
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-page flex items-center justify-center">
        <div className="text-ink-muted">Loading...</div>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="min-h-screen bg-page">
        <div className="max-w-2xl mx-auto px-4 py-20 text-center">
          <h1 className="text-2xl font-bold text-ink mb-4">Not Found</h1>
          <p className="text-ink-muted mb-6">{error}</p>
          <Link
            href="/trade-in"
            className="px-6 py-3 bg-accent text-black font-bold rounded-lg hover:bg-accent-strong transition"
          >
            Back to Trade-In
          </Link>
        </div>
      </main>
    );
  }

  const submittedDate = new Date(data.createdAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <main className="min-h-screen bg-page">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Link
          href="/trade-in"
          className="text-sm text-ink-muted hover:text-ink transition mb-6 inline-block"
        >
          &larr; Back to trade-in
        </Link>

        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start justify-between gap-2 mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-ink">
              Quote {data.reference}
            </h1>
            <p className="text-sm text-ink-muted mt-1">
              Submitted {submittedDate}
            </p>
          </div>
          <Badge status={data.status} palette={Palettes.QuoteStatusPalette} labels={STATUS_LABELS} size="md" />
        </div>

        {/* Status message */}
        {data.status === "pending" && (
          <div className="bg-accent/10 border border-accent/20 rounded-xl p-5 mb-6">
            <h2 className="text-sm font-bold text-accent-strong mb-1">
              We&apos;re Reviewing Your Cards
            </h2>
            <p className="text-sm text-ink-muted">
              Our team is evaluating your submission. You&apos;ll receive an email
              with our offer, usually within 24 hours.
            </p>
          </div>
        )}

        {data.status === "accepted" && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-5 mb-6">
            <div className="flex items-center gap-2 mb-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="w-5 h-5 text-secondary"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
              <h2 className="text-sm font-bold text-secondary">
                Quote Accepted
              </h2>
            </div>
            {data.deliveryMethod === "mail" ? (
              <div className="space-y-3">
                <p className="text-sm text-ink-muted">
                  Please send your cards to:
                </p>
                <div className="bg-surface-elevated rounded-lg p-3 text-sm text-ink">
                  <p>Cambridge TCG</p>
                  <p>PO Box 1637</p>
                  <p>CAMBRIDGE</p>
                  <p>CB1 0PD</p>
                </div>
                <p className="text-xs text-ink-faint">
                  Include your reference number{" "}
                  <strong className="text-accent-strong">{data.reference}</strong> on
                  the package.
                </p>
              </div>
            ) : (
              <div>
                <p className="text-sm text-ink-muted">
                  Bring your cards to our shop and quote your reference:
                </p>
                <p className="text-lg font-bold text-accent-strong mt-2">
                  {data.reference}
                </p>
              </div>
            )}
          </div>
        )}

        {data.status === "declined" && (
          <div className="bg-danger/10 border border-danger/20 rounded-xl p-5 mb-6">
            <h2 className="text-sm font-bold text-red-400 mb-1">
              Quote Declined
            </h2>
            <p className="text-sm text-ink-muted">
              You&apos;ve declined this quote. If you change your mind, you can
              submit a new request.
            </p>
          </div>
        )}

        {data.status === "expired" && (
          <div className="bg-surface-elevated border border-border-strong rounded-xl p-5 mb-6">
            <h2 className="text-sm font-bold text-ink-muted mb-1">
              Quote Expired
            </h2>
            <p className="text-sm text-ink-muted">
              This quote has expired. Please submit a new request for updated
              pricing.
            </p>
          </div>
        )}

        {data.status === "cancelled" && (
          <div className="bg-surface-elevated border border-border-strong rounded-xl p-5 mb-6">
            <h2 className="text-sm font-bold text-ink-muted mb-1">
              Quote Cancelled
            </h2>
            <p className="text-sm text-ink-muted">
              This quote has been cancelled. Please contact us if you have any
              questions.
            </p>
          </div>
        )}

        {/* Items */}
        <div className="space-y-4 mb-6">
          <h3 className="text-sm font-bold text-ink">
            Items ({data.items.length})
          </h3>
          {data.items.map((item, idx) => (
            <div key={idx} className="bg-surface rounded-xl p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink">
                    {item.quantity > 1 && (
                      <span className="text-accent-strong">{item.quantity}x </span>
                    )}
                    {item.description}
                  </p>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {item.game && (
                      <span className="text-xs bg-surface-elevated text-ink-muted px-2 py-0.5 rounded">
                        {item.game}
                      </span>
                    )}
                    {item.set_name && (
                      <span className="text-xs bg-surface-elevated text-ink-muted px-2 py-0.5 rounded">
                        {item.set_name}
                      </span>
                    )}
                    <span className="text-xs bg-surface-elevated text-ink-muted px-2 py-0.5 rounded">
                      {item.condition}
                    </span>
                  </div>
                  {item.notes && (
                    <p className="text-xs text-ink-faint mt-2">
                      {item.notes}
                    </p>
                  )}
                </div>

                {data.status === "quoted" &&
                  item.offeredPrice !== undefined && (
                    <p className="text-lg font-bold text-accent-strong ml-4 shrink-0">
                      &pound;{(item.offeredPrice * item.quantity).toFixed(2)}
                    </p>
                  )}
              </div>

              {/* Photos */}
              {item.imageUrls && item.imageUrls.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {item.imageUrls.map((img, imgIdx) => (
                    <div
                      key={imgIdx}
                      className="w-16 h-16 rounded-lg overflow-hidden bg-surface-elevated"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={img.url}
                        alt={`${item.description} photo ${imgIdx + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Quoted total + actions */}
        {data.status === "quoted" && data.total !== undefined && (
          <div className="bg-surface rounded-xl p-5 mb-6">
            <div className="flex justify-between items-center mb-4">
              <span className="text-ink font-bold text-lg">
                Total Offer ({data.paymentMethod === "cash" ? "Cash" : "Store Credit"})
              </span>
              <span className="text-accent-strong font-bold text-2xl">
                &pound;{data.total.toFixed(2)}
              </span>
            </div>

            {actionError && (
              <p className="text-sm text-red-400 bg-danger/10 rounded-lg px-4 py-3 mb-4">
                {actionError}
              </p>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => handleAction("accept")}
                disabled={actionLoading}
                className="flex-1 py-3 bg-emerald-500 text-black font-bold rounded-lg hover:bg-emerald-400 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {actionLoading ? "Processing..." : "Accept Offer"}
              </button>
              <button
                type="button"
                onClick={() => handleAction("decline")}
                disabled={actionLoading}
                className="flex-1 py-3 bg-surface-elevated text-ink font-medium rounded-lg hover:bg-neutral-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Decline
              </button>
            </div>
          </div>
        )}

        {/* Back action */}
        <div className="flex flex-col sm:flex-row gap-3 mt-8">
          <Link
            href="/trade-in/custom-quote"
            className="flex-1 text-center px-4 sm:px-6 py-3 bg-accent text-black font-bold rounded-lg hover:bg-accent-strong transition"
          >
            Submit Another Quote
          </Link>
          <Link
            href="/trade-in"
            className="flex-1 text-center px-4 sm:px-6 py-3 bg-surface-elevated text-ink font-medium rounded-lg hover:bg-neutral-700 transition"
          >
            Back to Trade-In
          </Link>
        </div>
      </div>
    </main>
  );
}
