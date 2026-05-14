/**
 * /catalog/cards/classify/review — bulk classification queue
 * (kingdom-089).
 *
 * Manager archetype. Surfaces the same rows the
 * `audit:classifier-disagreement` Check 4 reports: stale low-confidence
 * heuristic winners — cards where the CardRush heuristic claimed
 * something more than 30 days ago, declared `confidence: 'low'`,
 * and no operator override or publisher feed has confirmed or
 * corrected it.
 *
 * Each row links to the per-card detail page where the operator
 * confirms, overrides, or escalates the claim.
 *
 * Substrate-honest: degrades to ErrorState when the migration
 * hasn't applied. Empty state is informative — no review backlog is
 * good news, not a bug.
 */

import Link from "next/link";
import {
  PageHeader,
  DataTable,
  EmptyState,
  ErrorState,
  Provenance,
  WhyLink,
  StatusBadge,
  type Column,
} from "@/lib/ui";
import { fmtDateTime } from "@/lib/format";
import { wsQuery } from "@/lib/db";
import { safe } from "@/lib/queries";

export const metadata = { title: "Classification review queue" };

type ReviewRow = {
  log_id: number;
  card_id: number;
  sku: string;
  card_name: string | null;
  set_code: string | null;
  rarity: string | null;
  attribute: string;
  next_value: string;
  confidence: string | null;
  claimed_at: string;
  evidence: Record<string, unknown> | null;
  age_days: number;
};

async function fetchSubstrateReady(): Promise<boolean> {
  const result = await safe(
    () =>
      wsQuery<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM information_schema.tables
           WHERE table_name = 'card_classification_log'`,
      ),
    { rows: [{ n: 0 }] },
  );
  return (result.rows[0]?.n ?? 0) > 0;
}

/**
 * The audit's Check 4 query, but joined with cards for the UI table.
 * DISTINCT ON gets the most recent claim per (card, attribute), then
 * the outer filter keeps only stale low-confidence heuristic winners.
 */
async function fetchReviewQueue(): Promise<ReviewRow[]> {
  const result = await safe(
    () =>
      wsQuery<ReviewRow>(`
        WITH latest AS (
          SELECT DISTINCT ON (card_id, attribute)
                 id, card_id, attribute, next_value, next_source,
                 confidence, shadowed, superseded_at, claimed_at, evidence
          FROM card_classification_log
          ORDER BY card_id, attribute, claimed_at DESC
        )
        SELECT l.id AS log_id, l.card_id, c.sku,
               COALESCE(c.name_en, c.name, c.card_number) AS card_name,
               c.set_code, c.rarity,
               l.attribute, l.next_value, l.confidence,
               l.claimed_at::text,
               l.evidence,
               EXTRACT(EPOCH FROM (now() - l.claimed_at)) / 86400 AS age_days
        FROM latest l
        JOIN cards c ON c.id = l.card_id
        WHERE l.next_source = 'heuristic'
          AND l.confidence = 'low'
          AND l.shadowed = false
          AND l.superseded_at IS NULL
          AND l.claimed_at < now() - INTERVAL '30 days'
        ORDER BY l.claimed_at ASC
        LIMIT 200
      `),
    { rows: [] },
  );
  return result.rows;
}

export default async function ClassifyReviewPage() {
  const ready = await fetchSubstrateReady();
  const queue = ready ? await fetchReviewQueue() : [];

  const columns: Column<ReviewRow>[] = [
    {
      key: "claimed_at",
      header: "Claimed",
      render: (r) => (
        <div className="text-xs">
          <div className="text-neutral-300">{fmtDateTime(r.claimed_at)}</div>
          <div className="text-neutral-500">
            {Math.floor(r.age_days)} days ago
          </div>
        </div>
      ),
    },
    {
      key: "sku",
      header: "Card",
      render: (r) => (
        <Link
          href={`/catalog/cards/classify/${encodeURIComponent(r.sku)}`}
          className="block text-blue-400 hover:underline"
        >
          <div className="font-mono text-xs">{r.sku}</div>
          {r.card_name && (
            <div className="text-neutral-300">{r.card_name}</div>
          )}
        </Link>
      ),
    },
    {
      key: "set_code",
      header: "Set / rarity",
      render: (r) => (
        <div className="text-xs">
          <div className="text-neutral-300">{r.set_code ?? "—"}</div>
          <div className="text-neutral-500">{r.rarity ?? "—"}</div>
        </div>
      ),
    },
    {
      key: "attribute",
      header: "Attribute",
      render: (r) => (
        <code className="text-xs text-neutral-300">{r.attribute}</code>
      ),
    },
    {
      key: "next_value",
      header: "Heuristic value",
      render: (r) => <span className="text-white">{r.next_value}</span>,
    },
    {
      key: "evidence",
      header: "Evidence",
      render: (r) => {
        const ev = r.evidence as
          | { rule?: string; marker?: string }
          | null;
        return (
          <div className="text-[10px] text-neutral-500">
            <div>
              <code className="text-neutral-400">{ev?.rule ?? "—"}</code>
            </div>
            {ev?.marker && (
              <div className="font-mono">{String(ev.marker)}</div>
            )}
          </div>
        );
      },
    },
    {
      key: "review",
      header: "Review",
      render: (r) => (
        <Link
          href={`/catalog/cards/classify/${encodeURIComponent(r.sku)}`}
          className="rounded-md border border-blue-700 bg-blue-950/40 px-3 py-1 text-xs font-medium text-blue-300 hover:bg-blue-950/60"
        >
          Open →
        </Link>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Classification review queue"
        description="Cards whose heuristic classification has stood unchallenged for >30 days at low confidence. Open each to confirm, override, or escalate."
      />

      <div className="flex flex-wrap items-center gap-3">
        <Provenance kind="live" source="card_classification_log" />
        <WhyLink
          href="https://cambridgetcg.com/methodology/edition-variants"
          label="how priority works"
        />
        <Link
          href="/catalog/cards/classify"
          className="text-sm text-blue-400 hover:underline"
        >
          ← back to classify
        </Link>
      </div>

      {!ready ? (
        <ErrorState
          title="Substrate not yet applied"
          description="The card_classification_log table does not exist in the wholesale RDS. Promote apps/wholesale/drizzle/drafts/0018_card_financial_attributes.sql.draft and run pnpm db:migrate from apps/wholesale/ to enable this surface."
        />
      ) : queue.length === 0 ? (
        <EmptyState
          title="No cards in the review queue."
          description="Either no heuristic has claimed a low-confidence value older than 30 days, or every such claim has been reviewed and either confirmed by operator or superseded. This is the resting state."
        />
      ) : (
        <>
          <div className="rounded-md border border-amber-900 bg-amber-950/30 p-3 text-xs text-amber-300">
            <StatusBadge status="amber" palette={{ amber: "amber" }} />
            <span className="ml-2">
              {queue.length} card{queue.length === 1 ? "" : "s"} awaiting
              operator review. Showing oldest first.
            </span>
          </div>
          <DataTable columns={columns} rows={queue} rowKey={(r) => r.log_id} />
        </>
      )}
    </div>
  );
}
