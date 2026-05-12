/**
 * Reviews — Moderation Manager (kingdom-025).
 *
 * Triage queue for trade_reviews. Three tabs (flagged / appealed / hidden)
 * accessed via ?tab= search param. Three mutations (hide / unhide /
 * resolve_appeal) wired through adminAction.
 *
 * Substrate honesty:
 *   - Reviews are live from storefront RDS.
 *   - The displayed `effective_weight` was stamped at review-creation time
 *     by `lib/reviews/weighting.ts` (storefront) — see /methodology/trust-score
 *     for the reviewer-trust × weight table.
 *   - Hide/unhide flips `admin_hidden`; the reviewee's trust score is
 *     recomputed asynchronously by the next maintenance cron sweep
 *     (substrate-honest: admin's mutation is the trigger, not the recompute
 *     itself).
 */

import * as React from "react";
import Link from "next/link";
import { sfQuery } from "@/lib/db";
import { fmtDateTime } from "@/lib/format";
import {
  PageHeader,
  FilterPills,
  SectionHeading,
  Provenance,
  WhyLink,
} from "@/lib/ui";
import { ReviewActions } from "./_components";

export const metadata = { title: "Reviews" };

type Tab = "flagged" | "appealed" | "hidden";
const TABS: Tab[] = ["flagged", "appealed", "hidden"];
const DEFAULT_TAB: Tab = "flagged";

interface ReviewRow {
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

interface CountRow {
  flagged: string;
  appealed: string;
  hidden: string;
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const sp = await searchParams;
  const tab: Tab = (TABS as string[]).includes(sp.tab ?? "")
    ? (sp.tab as Tab)
    : DEFAULT_TAB;

  const where =
    tab === "flagged"
      ? "WHERE r.flagged = true AND r.admin_hidden = false"
      : tab === "hidden"
        ? "WHERE r.admin_hidden = true"
        : "WHERE r.appealed_at IS NOT NULL AND r.appeal_resolved = false";

  const [rowsRes, countsRes] = await Promise.all([
    sfQuery<ReviewRow>(
      `SELECT r.id::text AS id, r.trade_id::text AS trade_id,
              r.reviewer_id::text AS reviewer_id,
              r.reviewee_id::text AS reviewee_id,
              r.role, r.rating, r.comment, r.flagged, r.admin_hidden,
              r.appealed_at::text AS appealed_at, r.appeal_reason,
              r.effective_weight::text AS effective_weight,
              r.created_at::text AS created_at,
              reviewer.email AS reviewer_email,
              reviewer.name AS reviewer_name,
              reviewee.email AS reviewee_email,
              reviewee.name AS reviewee_name,
              tp.trust_score AS reviewer_trust
         FROM trade_reviews r
         LEFT JOIN users reviewer ON reviewer.id = r.reviewer_id
         LEFT JOIN users reviewee ON reviewee.id = r.reviewee_id
         LEFT JOIN trust_profiles tp ON tp.user_id = r.reviewer_id
         ${where}
        ORDER BY COALESCE(r.appealed_at, r.created_at) DESC
        LIMIT 200`,
    ),
    sfQuery<CountRow>(
      `SELECT
         COUNT(*) FILTER (WHERE flagged = true AND admin_hidden = false)::text AS flagged,
         COUNT(*) FILTER (WHERE appealed_at IS NOT NULL AND appeal_resolved = false)::text AS appealed,
         COUNT(*) FILTER (WHERE admin_hidden = true)::text AS hidden
       FROM trade_reviews`,
    ),
  ]);

  const counts = countsRes.rows[0] ?? { flagged: "0", appealed: "0", hidden: "0" };

  const buildHref = (t: Tab) =>
    t === DEFAULT_TAB ? "/trust/reviews" : `/trust/reviews?tab=${t}`;

  const pills = TABS.map((t) => ({
    value: t,
    label: t.charAt(0).toUpperCase() + t.slice(1),
    count: counts[t],
    href: buildHref(t),
  }));

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title="Reviews"
        provenance={<Provenance kind="live" source="Storefront RDS" />}
        description={
          <>
            Triage flagged + appealed reviews. Hide drops a review from public
            view; the reviewee&apos;s trust score recomputes on the next
            maintenance sweep.{" "}
            <WhyLink
              href="https://cambridgetcg.com/methodology/trust-score"
              label="reviewer-trust weighting"
            />
          </>
        }
        action={
          <Link
            href="/system/audit"
            className="text-xs text-amber-400 hover:text-amber-300 underline whitespace-nowrap"
          >
            Governance log →
          </Link>
        }
      />

      <FilterPills selected={tab} pills={pills} />

      <SectionHeading count={rowsRes.rows.length}>
        {tab.charAt(0).toUpperCase() + tab.slice(1)}
      </SectionHeading>

      {rowsRes.rows.length === 0 ? (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-6 text-center text-sm text-neutral-500">
          No reviews match this filter.
        </div>
      ) : (
        <div className="space-y-3">
          {rowsRes.rows.map((r) => (
            <ReviewCard key={r.id} review={r} tab={tab} />
          ))}
        </div>
      )}
    </div>
  );
}

function ReviewCard({ review: r, tab }: { review: ReviewRow; tab: Tab }) {
  const ratingTone =
    r.rating >= 4
      ? "text-emerald-400"
      : r.rating <= 2
        ? "text-red-400"
        : "text-amber-400";

  return (
    <div
      className={[
        "rounded-xl bg-neutral-900 p-4 border",
        r.appealed_at
          ? "border-amber-500/30"
          : r.admin_hidden
            ? "border-neutral-800/60 opacity-70"
            : "border-neutral-800",
      ].join(" ")}
    >
      <div className="flex items-baseline justify-between flex-wrap gap-2 mb-2">
        <div className="flex items-baseline gap-2">
          <span className={`text-lg font-bold ${ratingTone}`}>
            {"★".repeat(r.rating)}
            <span className="text-neutral-700">
              {"★".repeat(5 - r.rating)}
            </span>
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
          {fmtDateTime(r.created_at)}
        </span>
      </div>

      {r.comment && (
        <p className="text-sm text-neutral-200 mb-3 whitespace-pre-wrap">
          &ldquo;{r.comment}&rdquo;
        </p>
      )}

      <div className="flex items-center justify-between flex-wrap gap-3 text-xs text-neutral-500 border-t border-neutral-800 pt-2">
        <div>
          <span className="text-neutral-400">From:</span>{" "}
          <Link
            href={`/catalog/users/${r.reviewer_id}`}
            className="text-neutral-200 hover:text-white"
          >
            {r.reviewer_name ?? r.reviewer_email ?? "(unknown)"}
          </Link>
          {r.reviewer_trust != null && (
            <span className="ml-2">· trust {r.reviewer_trust}</span>
          )}
        </div>
        <div>
          <span className="text-neutral-400">About:</span>{" "}
          <Link
            href={`/catalog/users/${r.reviewee_id}`}
            className="text-neutral-200 hover:text-white"
          >
            {r.reviewee_name ?? r.reviewee_email ?? "(unknown)"}
          </Link>
        </div>
      </div>

      {r.appealed_at && r.appeal_reason && (
        <div className="mt-3 bg-amber-500/5 border border-amber-500/30 rounded p-2 text-xs">
          <p className="text-amber-400 font-bold mb-1">Appeal</p>
          <p className="text-neutral-300">{r.appeal_reason}</p>
          <p className="text-[10px] text-neutral-500 mt-1">
            Filed {fmtDateTime(r.appealed_at)}
          </p>
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <ReviewActions
          review={{
            id: r.id,
            hidden: r.admin_hidden,
            appealed: !!r.appealed_at,
          }}
          tab={tab}
        />
      </div>
    </div>
  );
}
