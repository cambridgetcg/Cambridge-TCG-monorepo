"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { Audience } from "@/lib/ui";
import {
  PERSON_PUBLICATION_NOTICE,
  PERSON_PUBLICATION_NOTICE_PATH,
  PERSON_PUBLICATION_NOTICE_VERSION,
} from "@/lib/social/publication";
interface ReceivedReview {
  id: string;
  trade_id: string;
  role: string;
  rating: number;
  comment: string | null;
  is_public: boolean;
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
  is_public: boolean;
  publication_notice_version: string | null;
  published_at: string | null;
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

  async function setReviewPublication(reviewId: string, isPublic: boolean) {
    const r = await fetch("/api/account/reviews", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reviewId,
        isPublic,
        publicationNoticeVersion: isPublic
          ? PERSON_PUBLICATION_NOTICE_VERSION
          : undefined,
      }),
    });
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      alert(body.error || "Could not update review publication.");
      return;
    }
    await load();
  }

  if (loading || !data) return <div className="text-ink-faint">Loading…</div>;

  const list = tab === "received" ? data.received : data.given;
  const visibleReceived = data.received.filter((r) => r.is_public && !r.admin_hidden);
  const avgVisible = visibleReceived.length > 0
    ? visibleReceived.reduce((s, r) => s + r.rating, 0) / visibleReceived.length
    : 0;

  return (
    <div>
      <Audience kind="consumer" />
      <h1 className="text-2xl font-bold text-ink mb-2">My Reviews</h1>
      <p className="text-sm text-ink-muted mb-6">
        Reviews you&apos;ve received and given.{" "}
        Your average rating feeds 25% of your{" "}
        <Link href="/account/trust" className="text-accent underline">trust score</Link>.
      </p>

      {data.received.length > 0 && (
        <div className="bg-surface border border-border-subtle rounded-lg p-4 mb-6 flex items-center gap-4 flex-wrap">
          <div>
            <p className="text-3xl font-bold text-accent">
              {avgVisible.toFixed(2)}<span className="text-ink-faint text-lg">/5</span>
            </p>
            <p className="text-xs text-ink-faint">{visibleReceived.length} public reviews</p>
          </div>
          {data.received.length !== visibleReceived.length && (
            <p className="text-xs text-ink-faint">
              {data.received.length - visibleReceived.length} hidden — appeals available below
            </p>
          )}
        </div>
      )}

      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setTab("received")}
          className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
            tab === "received" ? "bg-ink text-page font-semibold"
              : "bg-surface text-ink-muted hover:text-ink hover:bg-surface-subtle"
          }`}
        >
          Received ({data.received.length})
        </button>
        <button
          onClick={() => setTab("given")}
          className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
            tab === "given" ? "bg-ink text-page font-semibold"
              : "bg-surface text-ink-muted hover:text-ink hover:bg-surface-subtle"
          }`}
        >
          Given ({data.given.length})
        </button>
      </div>

      {list.length === 0 ? (
        <div className="bg-surface border border-border-subtle rounded-lg p-6 text-center text-ink-faint text-sm">
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
              <div key={r.id} className={`bg-surface rounded-lg p-4 border ${
                r.admin_hidden ? "border-border-subtle opacity-70" : "border-border-subtle"
              }`}>
                <div className="flex items-baseline justify-between flex-wrap gap-2 mb-2">
                  <div>
                    <span className={`text-lg font-bold ${
                      r.rating >= 4 ? "text-ok" : r.rating <= 2 ? "text-danger" : "text-accent"
                    }`}>
                      {"★".repeat(r.rating)}<span className="text-border-strong">{"★".repeat(5 - r.rating)}</span>
                    </span>
                    <span className="text-xs text-ink-faint ml-2 capitalize">as {r.role}</span>
                    {isReceived && recv!.effective_weight && parseFloat(recv!.effective_weight) < 1 && (
                      <span className="text-[10px] text-ink-faint ml-2">
                        · counted as {recv!.effective_weight}× (reviewer trust tier)
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-ink-faint">
                    {new Date(r.created_at).toLocaleDateString("en-GB", {
                      day: "numeric", month: "short", year: "numeric",
                    })}
                  </span>
                </div>
                {r.comment && (
                  <p className="text-sm text-ink mb-3 whitespace-pre-wrap">
                    &ldquo;{r.comment}&rdquo;
                  </p>
                )}
                <div className="text-xs text-ink-faint">
                  {isReceived ? "From" : "About"}:{" "}
                  {counterpartyUsername ? (
                    <Link href={`/u/${counterpartyUsername}`} className="text-accent hover:text-accent-strong underline">
                      {counterparty}
                    </Link>
                  ) : counterparty}
                </div>
                {!isReceived && (
                  <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border-subtle pt-3">
                    <button
                      type="button"
                      onClick={() => setReviewPublication(r.id, !given!.is_public)}
                      className="rounded-md border border-border-subtle px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface-subtle"
                    >
                      {given!.is_public ? "Unpublish review" : "Publish review"}
                    </button>
                    <span className="text-xs text-ink-faint">
                      {given!.is_public ? PERSON_PUBLICATION_NOTICE.review : "Visible only to trade participants and account tools."}{" "}
                      <Link href={PERSON_PUBLICATION_NOTICE_PATH} className="text-accent underline">
                        Publication notice
                      </Link>
                    </span>
                  </div>
                )}

                {isReceived && r.admin_hidden && (
                  <div className="mt-3 bg-accent-wash border border-accent/30 rounded p-3 text-xs">
                    <p className="text-accent font-bold mb-1">This review is hidden from public view</p>
                    {appealedAlready ? (
                      <p className="text-ink-muted">
                        You&apos;ve filed an appeal — admin will review and update by email.
                        {recv!.appeal_resolved && <span className="text-ink-faint"> (Appeal closed)</span>}
                      </p>
                    ) : canAppeal ? (
                      <button
                        onClick={() => appeal(r.id)}
                        disabled={appealing === r.id}
                        className="mt-1 text-xs bg-accent-wash hover:bg-accent-wash text-accent rounded px-3 py-1.5 disabled:opacity-50"
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
