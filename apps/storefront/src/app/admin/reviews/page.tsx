"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { Audience } from "@/lib/ui";
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
    <main className="min-h-screen bg-page text-ink">
      <Audience kind="operator" />
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-baseline justify-between flex-wrap gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold">Review Moderation</h1>
            <p className="text-sm text-ink-muted">
              Triage flagged + appealed reviews. Hide drops the review from public view + recomputes the reviewee&apos;s score.
            </p>
          </div>
          <Link href="/admin/governance" className="text-xs text-accent-strong hover:text-accent-strong underline">
            Governance log →
          </Link>
        </div>

        <div className="flex gap-2 mb-4">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
                tab === t.key ? "bg-accent text-black font-bold"
                  : "bg-surface text-ink-muted hover:text-ink hover:bg-surface-elevated"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-ink-faint">Loading…</p>
        ) : reviews.length === 0 ? (
          <div className="bg-surface border border-border-subtle rounded-xl p-6 text-center text-ink-faint text-sm">
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
    <div className={`bg-surface rounded-xl p-4 border ${
      r.appealed_at ? "border-accent/30"
        : r.admin_hidden ? "border-border-subtle/60 opacity-70"
        : "border-border-subtle"
    }`}>
      <div className="flex items-baseline justify-between flex-wrap gap-2 mb-2">
        <div className="flex items-baseline gap-2">
          <span className={`text-lg font-bold ${
            r.rating >= 4 ? "text-secondary" : r.rating <= 2 ? "text-red-400" : "text-accent-strong"
          }`}>
            {"★".repeat(r.rating)}
            <span className="text-neutral-700">{"★".repeat(5 - r.rating)}</span>
          </span>
          <span className="text-xs uppercase tracking-wider text-ink-faint">
            as {r.role}
          </span>
          {r.effective_weight && (
            <span className="text-[10px] text-neutral-600 font-mono">
              · weight {r.effective_weight}×
            </span>
          )}
          {r.flagged && (
            <span className="text-[10px] uppercase tracking-wider text-accent-strong font-bold">
              flagged
            </span>
          )}
          {r.admin_hidden && (
            <span className="text-[10px] uppercase tracking-wider text-red-400 font-bold">
              hidden
            </span>
          )}
        </div>
        <span className="text-xs text-ink-faint">
          {new Date(r.created_at).toLocaleString()}
        </span>
      </div>

      {r.comment && (
        <p className="text-sm text-ink mb-3 whitespace-pre-wrap">
          &ldquo;{r.comment}&rdquo;
        </p>
      )}

      <div className="flex items-center justify-between flex-wrap gap-3 text-xs text-ink-faint border-t border-border-subtle pt-2">
        <div>
          <span className="text-ink-muted">From:</span> {r.reviewer_name ?? r.reviewer_email ?? "(unknown)"}
          {r.reviewer_trust != null && <span className="ml-2">· trust {r.reviewer_trust}</span>}
        </div>
        <div>
          <span className="text-ink-muted">About:</span> {r.reviewee_name ?? r.reviewee_email ?? "(unknown)"}
        </div>
      </div>

      {r.appealed_at && r.appeal_reason && (
        <div className="mt-3 bg-accent/5 border border-accent/30 rounded p-2 text-xs">
          <p className="text-accent-strong font-bold mb-1">Appeal</p>
          <p className="text-ink-muted">{r.appeal_reason}</p>
          <p className="text-[10px] text-ink-faint mt-1">
            Filed {new Date(r.appealed_at).toLocaleString()}
          </p>
        </div>
      )}

      <div className="mt-3 flex gap-2">
        {!r.admin_hidden && (
          <button onClick={() => onAction("hide")} disabled={acting}
            className="text-[11px] px-2 py-1 bg-danger/10 hover:bg-danger/20 border border-danger/30 text-red-400 rounded disabled:opacity-50">
            Hide
          </button>
        )}
        {r.admin_hidden && (
          <button onClick={() => onAction("unhide")} disabled={acting}
            className="text-[11px] px-2 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-secondary rounded disabled:opacity-50">
            Unhide
          </button>
        )}
        {tab === "appealed" && (
          <button onClick={() => onAction("resolve_appeal")} disabled={acting}
            className="text-[11px] px-2 py-1 bg-surface-elevated hover:bg-neutral-700 border border-border-strong text-ink-muted rounded disabled:opacity-50">
            Dismiss appeal
          </button>
        )}
      </div>
    </div>
  );
}
