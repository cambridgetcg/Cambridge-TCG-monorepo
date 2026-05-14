/**
 * /catalog/cards/classify/[sku] — per-card classification detail
 * (kingdom-089).
 *
 * Two sections, one per classifiable attribute (edition_variant,
 * promo_origin). Each section shows:
 *   - current winner + source pill
 *   - override form (operator claim)
 *   - revert-override button (when current source is 'operator')
 *   - full history table from card_classification_log
 *
 * Manager archetype, detail level. The owned mutation is the operator
 * override + revoke; reads are joined views across cards +
 * card_classification_log.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import {
  PageHeader,
  DataTable,
  EmptyState,
  ErrorState,
  Provenance,
  StatusBadge,
  SectionHeading,
  WhyLink,
  type Column,
} from "@/lib/ui";
import { fmtDateTime } from "@/lib/format";
import { wsQuery } from "@/lib/db";
import { safe } from "@/lib/queries";
import {
  EDITION_VARIANT_VALUES,
  PROMO_ORIGIN_VALUES,
  type ClassifiableAttribute,
  type ClassificationSource,
} from "@cambridge-tcg/data-ingest";
import { ClassifyForm, RevokeButton } from "../_components";

interface PageProps {
  params: Promise<{ sku: string }>;
}

type Card = {
  id: number;
  sku: string;
  name: string | null;
  name_en: string | null;
  card_number: string;
  set_code: string | null;
  set_name: string | null;
  rarity: string | null;
  language: string;
  image_url: string | null;
  edition_variant: string;
  edition_variant_source: ClassificationSource;
  promo_origin: string | null;
  promo_origin_source: ClassificationSource;
};

type LogEntry = {
  id: number;
  prev_value: string | null;
  prev_source: string | null;
  next_value: string;
  next_source: ClassificationSource;
  shadowed: boolean;
  confidence: string | null;
  evidence: Record<string, unknown> | null;
  claimed_by: string;
  claimed_at: string;
  superseded_at: string | null;
};

async function fetchSubstrateReady(): Promise<boolean> {
  const result = await safe(
    () =>
      wsQuery<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM information_schema.columns
           WHERE table_name = 'cards' AND column_name = 'edition_variant'`,
      ),
    { rows: [{ n: 0 }] },
  );
  return (result.rows[0]?.n ?? 0) > 0;
}

async function fetchCard(sku: string): Promise<Card | null> {
  const result = await safe(
    () =>
      wsQuery<Card>(
        `SELECT id, sku, name, name_en, card_number, set_code, set_name,
                rarity, language, image_url,
                edition_variant, edition_variant_source,
                promo_origin, promo_origin_source
           FROM cards
          WHERE sku = $1`,
        [sku],
      ),
    { rows: [] },
  );
  return result.rows[0] ?? null;
}

async function fetchHistory(
  cardId: number,
  attribute: ClassifiableAttribute,
): Promise<LogEntry[]> {
  const result = await safe(
    () =>
      wsQuery<LogEntry>(
        `SELECT id, prev_value, prev_source, next_value, next_source,
                shadowed, confidence, evidence,
                claimed_by, claimed_at::text, superseded_at::text
           FROM card_classification_log
          WHERE card_id = $1 AND attribute = $2
          ORDER BY claimed_at DESC
          LIMIT 25`,
        [cardId, attribute],
      ),
    { rows: [] },
  );
  return result.rows;
}

const SOURCE_PALETTE = {
  heuristic: "amber",
  operator: "blue",
  publisher: "emerald",
  default: "neutral",
} as const;

const SECTION_DESCRIPTIONS = {
  edition_variant:
    "Visual / structural treatment of the printing. Strictly separate from promo_origin — a card can be alt-art and a pre-release promo simultaneously without conflict.",
  promo_origin:
    "Distribution channel (where this printing came from). Strictly separate from edition_variant.",
} as const;

function HistoryTable({ rows }: { rows: LogEntry[] }) {
  const columns: Column<LogEntry>[] = [
    {
      key: "claimed_at",
      header: "When",
      render: (r) => (
        <span className="text-neutral-400">{fmtDateTime(r.claimed_at)}</span>
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
        <StatusBadge status={r.next_source} palette={SOURCE_PALETTE} />
      ),
    },
    {
      key: "shadowed",
      header: "Status",
      render: (r) =>
        r.superseded_at ? (
          <span className="text-xs text-neutral-500">superseded</span>
        ) : r.shadowed ? (
          <span className="text-xs text-amber-400">shadowed</span>
        ) : (
          <span className="text-xs text-emerald-400">winner</span>
        ),
    },
    {
      key: "confidence",
      header: "Confidence",
      render: (r) =>
        r.confidence ? (
          <span className="text-xs text-neutral-400">{r.confidence}</span>
        ) : (
          <span className="text-xs text-neutral-600">—</span>
        ),
    },
    {
      key: "evidence",
      header: "Evidence",
      render: (r) =>
        r.evidence ? (
          <code className="text-[10px] text-neutral-500">
            {JSON.stringify(r.evidence).slice(0, 60)}
            {JSON.stringify(r.evidence).length > 60 ? "…" : ""}
          </code>
        ) : (
          <span className="text-xs text-neutral-600">—</span>
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
  if (rows.length === 0) {
    return (
      <EmptyState
        title="No claims yet."
        description="When a heuristic ingests this card or an operator submits an override, the history will populate here."
      />
    );
  }
  return <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} />;
}

export default async function ClassifyDetailPage({ params }: PageProps) {
  const { sku: rawSku } = await params;
  const sku = decodeURIComponent(rawSku);

  const ready = await fetchSubstrateReady();
  if (!ready) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={`Classify ${sku}`}
          description="Per-card classification detail."
        />
        <ErrorState
          title="Substrate not yet applied"
          description="The classification columns do not exist in the wholesale cards table yet. Promote apps/wholesale/drizzle/drafts/0018_card_financial_attributes.sql.draft and run pnpm db:migrate from apps/wholesale/ to enable this surface."
        />
      </div>
    );
  }

  const card = await fetchCard(sku);
  if (!card) notFound();

  const [editionHistory, promoHistory] = await Promise.all([
    fetchHistory(card.id, "edition_variant"),
    fetchHistory(card.id, "promo_origin"),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader
        title={`Classify · ${card.name_en ?? card.name ?? card.card_number}`}
        description="Override edition variant and promo origin for this card. Operator overrides outrank heuristics; publisher feeds (when wired) outrank operator. The log is append-only — shadowed claims are kept for audit."
      />

      <nav className="flex flex-wrap items-center gap-2 text-sm text-neutral-400">
        <Link href="/catalog/cards/classify" className="hover:text-white">
          ← All recent
        </Link>
        <span className="text-neutral-700">·</span>
        <Provenance kind="live" source="cards + card_classification_log" />
        <WhyLink
          href="https://cambridgetcg.com/methodology/edition-variants"
          label="how priority works"
        />
      </nav>

      <section className="rounded-md border border-neutral-800 bg-neutral-900 p-4">
        <div className="flex flex-wrap items-start gap-6">
          {card.image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={card.image_url}
              alt={card.name_en ?? card.name ?? card.card_number}
              className="h-32 w-auto rounded-md object-contain"
            />
          )}
          <dl className="grid flex-1 gap-x-6 gap-y-2 sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-wider text-neutral-500">
                SKU
              </dt>
              <dd className="font-mono text-sm text-white">{card.sku}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-neutral-500">
                Card number
              </dt>
              <dd className="text-sm text-white">{card.card_number}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-neutral-500">
                Set
              </dt>
              <dd className="text-sm text-white">
                {card.set_code}
                {card.set_name && (
                  <span className="ml-2 text-neutral-400">
                    {card.set_name}
                  </span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-neutral-500">
                Rarity / Language
              </dt>
              <dd className="text-sm text-white">
                {card.rarity ?? "—"}{" "}
                <span className="text-neutral-500">/</span>{" "}
                {card.language || "—"}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      {(["edition_variant", "promo_origin"] as const).map((attribute) => {
        const currentValue =
          attribute === "edition_variant"
            ? card.edition_variant
            : card.promo_origin;
        const currentSource =
          attribute === "edition_variant"
            ? card.edition_variant_source
            : card.promo_origin_source;
        const vocab =
          attribute === "edition_variant"
            ? EDITION_VARIANT_VALUES
            : PROMO_ORIGIN_VALUES;
        const history =
          attribute === "edition_variant" ? editionHistory : promoHistory;

        return (
          <section key={attribute} className="space-y-4">
            <SectionHeading>
              <code className="text-base">{attribute}</code>
            </SectionHeading>
            <p className="max-w-3xl text-sm text-neutral-400">
              {SECTION_DESCRIPTIONS[attribute]}
            </p>

            <div className="flex flex-wrap items-center gap-3 rounded-md border border-neutral-800 bg-neutral-950 p-3">
              <span className="text-xs uppercase tracking-wider text-neutral-500">
                Current
              </span>
              <span className="text-sm text-white">
                {currentValue ?? <span className="text-neutral-600">—</span>}
              </span>
              <StatusBadge status={currentSource} palette={SOURCE_PALETTE} />
              {currentSource === "operator" && (
                <RevokeButton sku={card.sku} attribute={attribute} />
              )}
            </div>

            <ClassifyForm
              sku={card.sku}
              attribute={attribute}
              currentValue={currentValue}
              vocab={vocab}
            />

            <details className="rounded-md border border-neutral-800 bg-neutral-950 p-3">
              <summary className="cursor-pointer text-xs uppercase tracking-wider text-neutral-400">
                History ({history.length})
              </summary>
              <div className="mt-3">
                <HistoryTable rows={history} />
              </div>
            </details>
          </section>
        );
      })}
    </div>
  );
}
