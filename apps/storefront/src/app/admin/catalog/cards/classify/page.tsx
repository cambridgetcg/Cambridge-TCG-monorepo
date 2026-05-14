/**
 * /admin/catalog/cards/classify — landing page (kingdom-089).
 *
 * Manager archetype, lean: SKU search box + recent-activity table.
 * The owned data is the classification log; the table reflects what
 * operators and heuristics have written across all cards.
 *
 * Substrate-honest: degrades to an "awaiting migration" banner when
 * the card_classification_log table doesn't exist yet (i.e., when
 * drafts/0018_card_financial_attributes.sql.draft hasn't been promoted
 * and applied).
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
} from "@/lib/admin/ui";
import { fmtDateTime } from "@/lib/format";
import { wsQuery } from "@/lib/admin/db";
import { safe } from "@/lib/admin/queries";
import { SkuLookupForm } from "./_components";

export const metadata = { title: "Classify card editions" };

type LogEntry = {
  id: number;
  card_id: number;
  attribute: string;
  next_value: string;
  next_source: string;
  shadowed: boolean;
  claimed_by: string;
  claimed_at: string;
  sku: string;
  card_name: string | null;
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

async function fetchRecentLog(): Promise<LogEntry[]> {
  const result = await safe(
    () =>
      wsQuery<LogEntry>(`
        SELECT l.id, l.card_id, l.attribute, l.next_value, l.next_source,
               l.shadowed, l.claimed_by, l.claimed_at::text,
               c.sku, COALESCE(c.name_en, c.name, c.card_number) AS card_name
        FROM card_classification_log l
        JOIN cards c ON c.id = l.card_id
        ORDER BY l.claimed_at DESC
        LIMIT 50
      `),
    { rows: [] },
  );
  return result.rows;
}

export default async function ClassifyLandingPage() {
  const ready = await fetchSubstrateReady();
  const recent = ready ? await fetchRecentLog() : [];

  const columns: Column<LogEntry>[] = [
    {
      key: "claimed_at",
      header: "When",
      render: (r) => (
        <span className="text-neutral-400">{fmtDateTime(r.claimed_at)}</span>
      ),
    },
    {
      key: "sku",
      header: "Card",
      render: (r) => (
        <Link
          href={`/admin/catalog/cards/classify/${encodeURIComponent(r.sku)}`}
          className="text-blue-400 hover:underline"
        >
          <span className="font-mono text-xs">{r.sku}</span>
          {r.card_name && (
            <span className="ml-2 text-neutral-300">{r.card_name}</span>
          )}
        </Link>
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
      header: "Value",
      render: (r) => <span className="text-white">{r.next_value}</span>,
    },
    {
      key: "next_source",
      header: "Source",
      render: (r) => (
        <StatusBadge
          status={r.next_source}
          palette={{
            heuristic: "amber",
            operator: "blue",
            publisher: "emerald",
            default: "neutral",
          }}
        />
      ),
    },
    {
      key: "shadowed",
      header: "Promoted?",
      render: (r) =>
        r.shadowed ? (
          <span className="text-xs text-amber-400">shadowed</span>
        ) : (
          <span className="text-xs text-emerald-400">winner</span>
        ),
    },
    {
      key: "claimed_by",
      header: "Actor",
      render: (r) => (
        <span className="font-mono text-xs text-neutral-400">
          {r.claimed_by}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Classify card editions"
        description="Override edition variant and promo origin classifications. Operator overrides outrank heuristics; publisher feeds (when wired) outrank operator. The log is append-only — shadowed claims are kept for audit."
      />

      <div className="flex flex-wrap items-center gap-3">
        <Provenance kind="live" source="card_classification_log" />
        <WhyLink
          href="https://cambridgetcg.com/methodology/edition-variants"
          label="how priority works"
        />
      </div>

      {!ready ? (
        <ErrorState
          title="Substrate not yet applied"
          description="The card_classification_log table does not exist in the wholesale RDS. Promote apps/wholesale/drizzle/drafts/0018_card_financial_attributes.sql.draft and run pnpm db:migrate from apps/wholesale/ to enable this surface."
        />
      ) : (
        <>
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-400">
              Open a card to classify
            </h2>
            <SkuLookupForm />
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-400">
              Recent activity ({recent.length})
            </h2>
            {recent.length === 0 ? (
              <EmptyState
                title="No classification activity yet."
                description="As CardRush ingest and operator overrides write claims, they will appear here. Open a known SKU above to make the first one."
              />
            ) : (
              <DataTable columns={columns} rows={recent} rowKey={(r) => r.id} />
            )}
          </section>
        </>
      )}
    </div>
  );
}
