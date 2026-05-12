"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { Audience } from "@/lib/ui";
interface ReceivedReview {
  id: string;
  trade_id: string;
  role: string;
  rating: number;
  comment: string | null;
  admin_hidden: boolean;
  flagged: boolean;
  appealed_at: string | null;
  appeal_resolved: boolean;
  effective_weight: string | null;
  created_at: string;
  reviewer_name: string | null;
  reviewer_username: string | null;
}

interface GivenReview {
  id: string;
  trade_id: string;
  role: string;
  rating: number;
  comment: string | null;
  admin_hidden: boolean;
  flagged: boolean;
  created_at: string;
  reviewee_name: string | null;
  reviewee_username: string | null;
}

interface Response {
  received: ReceivedReview[];
  given: GivenReview[];
}

export default function AccountReviewsPage() {
  const [data, setData] = useState<Response | null>(null);
  const [tab, setTab] = useState<"received" | "given">("received");
  const [loading, setLoading] = useState(true);
  const [appealing, setAppealing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch("/api/account/reviews");
    if (r.ok) setData(await r.json());
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function appeal(reviewId: string) {
    const reason = window.prompt(
      "Tell us why this review should be reconsidered (min 10 characters):",
    );
    if (!reason || reason.trim().length < 10) {
      if (reason !== null) alert("Please provide a longer explanation.");
      return;
    }
    setAppealing(reviewId);
    try {
      const r = await fetch("/api/account/reviews", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewId, reason: reason.trim() }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { alert(d.error || "Appeal failed"); return; }
      alert("Appeal filed — we'll review and respond by email.");
      load();
    } finally { setAppealing(null); }
  }

  if (loading || !data) return <div className="text-neutral-500">Loading…</div>;

  const list = tab === "received" ? data.received : data.given;
  const visibleReceived = data.received.filter((r) => !r.admin_hidden);
  const avgVisible = visibleReceived.length > 0
    ? visibleReceived.reduce((s, r) => s + r.rating, 0) / visibleReceived.length
    : 0;

  return (
    <div>
      <Audience kind="consumer" />
      <h1 className="text-2xl font-bold text-white mb-2">My Reviews</h1>
      <p className="text-sm text-neutral-400 mb-6">
        Reviews you&apos;ve received and given.{" "}
        Your average rating feeds 25% of your{" "}
        <Link href="/account/trust" className="text-amber-400 underline">trust score</Link>.
      </p>

      {data.received.length > 0 && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 mb-6 flex items-center gap-4 flex-wrap">
          <div>
            <p className="text-3xl font-bold text-amber-400">
              {avgVisible.toFixed(2)}<span className="text-neutral-600 text-lg">/5</span>
            </p>
            <p className="text-xs text-neutral-500">{visibleReceived.length} public reviews</p>
          </div>
          {data.received.length !== visibleReceived.length && (
            <p className="text-xs text-neutral-500">
              {data.received.length - visibleReceived.length} hidden — appeals available below
            </p>
          )}
        </div>
      )}

      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setTab("received")}
          className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
            tab === "received" ? "bg-amber-500 text-black font-bold"
              : "bg-neutral-900 text-neutral-400 hover:text-white hover:bg-neutral-800"
          }`}
        >
          Received ({data.received.length})
        </button>
        <button
          onClick={() => setTab("given")}
          className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
            tab === "given" ? "bg-amber-500 text-black font-bold"
              : "bg-neutral-900 text-neutral-400 hover:text-white hover:bg-neutral-800"
          }`}
        >
          Given ({data.given.length})
        </button>
      </div>

      {list.length === 0 ? (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 text-center text-neutral-500 text-sm">
          {tab === "received"
            ? "No reviews yet. Complete a trade to receive your first."
            : "You haven't left any reviews yet."}
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((r) => {
            const isReceived = tab === "received";
            const recv = isReceived ? (r as ReceivedReview) : null;
            const given = !isReceived ? (r as GivenReview) : null;
            const counterparty = isReceived
              ? (recv!.reviewer_name ?? recv!.reviewer_username ?? "—")
              : (given!.reviewee_name ?? given!.reviewee_username ?? "—");
            const counterpartyUsername = isReceived ? recv!.reviewer_username : given!.reviewee_username;
            const canAppeal = isReceived && recv!.admin_hidden && !recv!.appealed_at;
            const appealedAlready = isReceived && recv!.appealed_at;

            return (
              <div key={r.id} className={`bg-neutral-900 rounded-xl p-4 border ${
                r.admin_hidden ? "border-neutral-800/60 opacity-70" : "border-neutral-800"
              }`}>
                <div className="flex items-baseline justify-between flex-wrap gap-2 mb-2">
                  <div>
                    <span className={`text-lg font-bold ${
                      r.rating >= 4 ? "text-emerald-400" : r.rating <= 2 ? "text-red-400" : "text-amber-400"
                    }`}>
                      {"★".repeat(r.rating)}<span className="text-neutral-700">{"★".repeat(5 - r.rating)}</span>
                    </span>
                    <span className="text-xs text-neutral-500 ml-2 capitalize">as {r.role}</span>
                    {isReceived && recv!.effective_weight && parseFloat(recv!.effective_weight) < 1 && (
                      <span className="text-[10px] text-neutral-600 ml-2">
                        · counted as {recv!.effective_weight}× (reviewer trust tier)
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-neutral-500">
                    {new Date(r.created_at).toLocaleDateString("en-GB", {
                      day: "numeric", month: "short", year: "numeric",
                    })}
                  </span>
                </div>
                {r.comment && (
                  <p className="text-sm text-neutral-200 mb-3 whitespace-pre-wrap">
                    &ldquo;{r.comment}&rdquo;
                  </p>
                )}
                <div className="text-xs text-neutral-500">
                  {isReceived ? "From" : "About"}:{" "}
                  {counterpartyUsername ? (
                    <Link href={`/u/${counterpartyUsername}`} className="text-amber-400 hover:text-amber-300 underline">
                      {counterparty}
                    </Link>
                  ) : counterparty}
                </div>

                {isReceived && r.admin_hidden && (
                  <div className="mt-3 bg-amber-500/5 border border-amber-500/30 rounded p-3 text-xs">
                    <p className="text-amber-400 font-bold mb-1">This review is hidden from public view</p>
                    {appealedAlready ? (
                      <p className="text-neutral-400">
                        You&apos;ve filed an appeal — admin will review and update by email.
                        {recv!.appeal_resolved && <span className="text-neutral-500"> (Appeal closed)</span>}
                      </p>
                    ) : canAppeal ? (
                      <button
                        onClick={() => appeal(r.id)}
                        disabled={appealing === r.id}
                        className="mt-1 text-xs bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 rounded px-3 py-1.5 disabled:opacity-50"
                      >
                        Appeal this hide
                      </button>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
