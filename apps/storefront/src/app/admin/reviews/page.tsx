"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface Review {
  id: string;
  trade_id: string;
  reviewer_id: string;
  reviewer_email: string | null;
  reviewer_name: string | null;
  reviewer_trust: number | null;
  reviewee_id: string;
  reviewee_email: string | null;
  reviewee_name: string | null;
  role: string;
  rating: number;
  comment: string | null;
  flagged: boolean;
  admin_hidden: boolean;
  appealed_at: string | null;
  appeal_reason: string | null;
  effective_weight: string | null;
  created_at: string;
}

const TABS = [
  { key: "flagged", label: "Flagged" },
  { key: "appealed", label: "Appealed" },
  { key: "hidden", label: "Hidden" },
] as const;

export default function AdminReviewsPage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [tab, setTab] = useState<typeof TABS[number]["key"]>("flagged");
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch(`/api/admin/reviews?tab=${tab}`);
    if (r.ok) setReviews((await r.json()).reviews ?? []);
    setLoading(false);
  }, [tab]);
  useEffect(() => { load(); }, [load]);

  async function act(id: string, action: "hide" | "unhide" | "resolve_appeal") {
    const reason = window.prompt(`Reason for ${action.replace("_", " ")}?`);
    if (reason == null) return;
    setActing(id);
    try {
      const r = await fetch("/api/admin/reviews", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewId: id, action, reason }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        alert(d.error || "Action failed");
        return;
      }
      load();
    } finally { setActing(null); }
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-baseline justify-between flex-wrap gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold">Review Moderation</h1>
            <p className="text-sm text-neutral-400">
              Triage flagged + appealed reviews. Hide drops the review from public view + recomputes the reviewee&apos;s score.
            </p>
          </div>
          <Link href="/admin/governance" className="text-xs text-amber-400 hover:text-amber-300 underline">
            Governance log →
          </Link>
        </div>

        <div className="flex gap-2 mb-4">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
                tab === t.key ? "bg-amber-500 text-black font-bold"
                  : "bg-neutral-900 text-neutral-400 hover:text-white hover:bg-neutral-800"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-neutral-500">Loading…</p>
        ) : reviews.length === 0 ? (
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 text-center text-neutral-500 text-sm">
            No reviews match this filter.
          </div>
        ) : (
          <div className="space-y-3">
            {reviews.map((r) => (
              <ReviewCard key={r.id} review={r} acting={acting === r.id} onAction={(a) => act(r.id, a)} tab={tab} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function ReviewCard({
  review: r, acting, onAction, tab,
}: {
  review: Review;
  acting: boolean;
  onAction: (a: "hide" | "unhide" | "resolve_appeal") => void;
  tab: string;
}) {
  return (
    <div className={`bg-neutral-900 rounded-xl p-4 border ${
      r.appealed_at ? "border-amber-500/30"
        : r.admin_hidden ? "border-neutral-800/60 opacity-70"
        : "border-neutral-800"
    }`}>
      <div className="flex items-baseline justify-between flex-wrap gap-2 mb-2">
        <div className="flex items-baseline gap-2">
          <span className={`text-lg font-bold ${
            r.rating >= 4 ? "text-emerald-400" : r.rating <= 2 ? "text-red-400" : "text-amber-400"
          }`}>
            {"★".repeat(r.rating)}
            <span className="text-neutral-700">{"★".repeat(5 - r.rating)}</span>
          </span>
          <span className="text-xs uppercase tracking-wider text-neutral-500">
            as {r.role}
          </span>
          {r.effective_weight && (
            <span className="text-[10px] text-neutral-600 font-mono">
              · weight {r.effective_weight}×
            </span>
          )}
          {r.flagged && (
            <span className="text-[10px] uppercase tracking-wider text-amber-400 font-bold">
              flagged
            </span>
          )}
          {r.admin_hidden && (
            <span className="text-[10px] uppercase tracking-wider text-red-400 font-bold">
              hidden
            </span>
          )}
        </div>
        <span className="text-xs text-neutral-500">
          {new Date(r.created_at).toLocaleString()}
        </span>
      </div>

      {r.comment && (
        <p className="text-sm text-neutral-200 mb-3 whitespace-pre-wrap">
          &ldquo;{r.comment}&rdquo;
        </p>
      )}

      <div className="flex items-center justify-between flex-wrap gap-3 text-xs text-neutral-500 border-t border-neutral-800 pt-2">
        <div>
          <span className="text-neutral-400">From:</span> {r.reviewer_name ?? r.reviewer_email ?? "(unknown)"}
          {r.reviewer_trust != null && <span className="ml-2">· trust {r.reviewer_trust}</span>}
        </div>
        <div>
          <span className="text-neutral-400">About:</span> {r.reviewee_name ?? r.reviewee_email ?? "(unknown)"}
        </div>
      </div>

      {r.appealed_at && r.appeal_reason && (
        <div className="mt-3 bg-amber-500/5 border border-amber-500/30 rounded p-2 text-xs">
          <p className="text-amber-400 font-bold mb-1">Appeal</p>
          <p className="text-neutral-300">{r.appeal_reason}</p>
          <p className="text-[10px] text-neutral-500 mt-1">
            Filed {new Date(r.appealed_at).toLocaleString()}
          </p>
        </div>
      )}

      <div className="mt-3 flex gap-2">
        {!r.admin_hidden && (
          <button onClick={() => onAction("hide")} disabled={acting}
            className="text-[11px] px-2 py-1 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 rounded disabled:opacity-50">
            Hide
          </button>
        )}
        {r.admin_hidden && (
          <button onClick={() => onAction("unhide")} disabled={acting}
            className="text-[11px] px-2 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 rounded disabled:opacity-50">
            Unhide
          </button>
        )}
        {tab === "appealed" && (
          <button onClick={() => onAction("resolve_appeal")} disabled={acting}
            className="text-[11px] px-2 py-1 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-300 rounded disabled:opacity-50">
            Dismiss appeal
          </button>
        )}
      </div>
    </div>
  );
}
