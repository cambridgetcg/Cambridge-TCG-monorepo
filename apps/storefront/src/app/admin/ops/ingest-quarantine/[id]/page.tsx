/**
 * /admin/ops/ingest-quarantine/[id] — single quarantine row detail.
 *
 * Shows the full raw_payload (typically the truncated upstream HTML or
 * the raw record that failed to normalize), plus the metadata needed
 * for triage. The Resolution form lets the operator mark the row
 * `reprocess` / `discard` / `manual-fix` / `upstream-bug` with their
 * handle attached.
 *
 * Designed in `docs/connections/the-license-propagation.md` (kingdom-081
 * Phase 4.4).
 */

import { wsQuery } from "@/lib/admin/db";
import { fmtDateTime } from "@/lib/format";
import { PageHeader, Provenance, StatusBadge } from "@/lib/admin/ui";
import { notFound } from "next/navigation";
import { ResolutionForm } from "./_components";

export const metadata = { title: "Quarantine detail" };

interface QuarantineDetailRow {
  id: number;
  ingest_run_id: number;
  source_id: string;
  upstream_id: string | null;
  raw_payload: unknown;
  reason: string;
  as_of: string;
  retrieved_at: string;
  quarantined_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  resolution: string | null;
}

const RESOLUTION_PALETTE: Record<string, "amber" | "blue" | "neutral" | "purple" | "red"> = {
  unresolved: "amber",
  reprocess: "blue",
  discard: "neutral",
  "manual-fix": "purple",
  "upstream-bug": "red",
};
const RESOLUTION_LABELS: Record<string, string> = {
  unresolved: "unresolved",
  reprocess: "reprocess",
  discard: "discarded",
  "manual-fix": "manual fix",
  "upstream-bug": "upstream bug",
};

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idParam } = await params;
  const id = parseInt(idParam, 10);
  if (!Number.isFinite(id) || id <= 0) notFound();

  const result = await wsQuery<QuarantineDetailRow>(
    `SELECT
       id, ingest_run_id, source_id, upstream_id, raw_payload, reason,
       as_of::text             AS as_of,
       retrieved_at::text      AS retrieved_at,
       quarantined_at::text    AS quarantined_at,
       reviewed_at::text       AS reviewed_at,
       reviewed_by, resolution
     FROM ingest_quarantine
     WHERE id = $1
     LIMIT 1`,
    [id],
  );

  if (result.rows.length === 0) notFound();
  const row = result.rows[0]!;

  const status = row.reviewed_at === null
    ? "unresolved"
    : (row.resolution ?? "discard");

  // raw_payload pretty-print. The jsonb may have a top-level field that's
  // a truncated HTML string (cardrush case) — we surface the size and the
  // structure so the reviewer doesn't get flooded by an inline 100KB HTML.
  const payloadStr = JSON.stringify(row.raw_payload, null, 2);
  const payloadSize = payloadStr.length;
  const isLargePayload = payloadSize > 4096;

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        title={`Quarantine #${row.id}`}
        description={`Source: ${row.source_id} · Reason: ${row.reason}`}
      />

      <div className="flex items-center gap-3">
        <Provenance kind="live" source="wholesale-rds.ingest_quarantine" />
        <StatusBadge
          status={status}
          palette={RESOLUTION_PALETTE}
          label={RESOLUTION_LABELS[status]}
        />
      </div>

      <section className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 space-y-2 text-sm">
        <h2 className="text-sm font-semibold text-white mb-2">Metadata</h2>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <div className="text-neutral-500 uppercase tracking-wide text-[10px]">ingest_run_id</div>
            <div className="font-mono">#{row.ingest_run_id}</div>
          </div>
          <div>
            <div className="text-neutral-500 uppercase tracking-wide text-[10px]">upstream_id</div>
            <div className="font-mono text-neutral-300 break-all">{row.upstream_id ?? "—"}</div>
          </div>
          <div>
            <div className="text-neutral-500 uppercase tracking-wide text-[10px]">as_of</div>
            <div className="font-mono">{fmtDateTime(row.as_of)}</div>
          </div>
          <div>
            <div className="text-neutral-500 uppercase tracking-wide text-[10px]">retrieved_at</div>
            <div className="font-mono">{fmtDateTime(row.retrieved_at)}</div>
          </div>
          <div>
            <div className="text-neutral-500 uppercase tracking-wide text-[10px]">quarantined_at</div>
            <div className="font-mono">{fmtDateTime(row.quarantined_at)}</div>
          </div>
          <div>
            <div className="text-neutral-500 uppercase tracking-wide text-[10px]">reviewed_at</div>
            <div className="font-mono">{row.reviewed_at ? fmtDateTime(row.reviewed_at) : "—"}</div>
          </div>
          {row.reviewed_by && (
            <div>
              <div className="text-neutral-500 uppercase tracking-wide text-[10px]">reviewed_by</div>
              <div className="font-mono">{row.reviewed_by}</div>
            </div>
          )}
          {row.resolution && (
            <div>
              <div className="text-neutral-500 uppercase tracking-wide text-[10px]">resolution</div>
              <div className="font-mono">{row.resolution}</div>
            </div>
          )}
        </div>
      </section>

      <section className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
        <h2 className="text-sm font-semibold text-white mb-3">
          Raw payload <span className="text-xs text-neutral-500 ml-2">({payloadSize.toLocaleString()} chars)</span>
        </h2>
        {isLargePayload && (
          <p className="text-xs text-amber-400 mb-2">
            Large payload — only the first 16 KB is rendered inline. Use the API endpoint{" "}
            <code className="text-amber-300">/api/v1/ingest-quarantine/{row.id}</code>{" "}
            for the full body.
          </p>
        )}
        <pre className="bg-neutral-950 border border-neutral-800/60 rounded p-3 text-xs font-mono text-neutral-300 overflow-x-auto whitespace-pre-wrap break-words max-h-96">
          {isLargePayload ? payloadStr.slice(0, 16 * 1024) + "\n…[truncated]" : payloadStr}
        </pre>
      </section>

      <section className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
        <h2 className="text-sm font-semibold text-white mb-3">Resolution</h2>
        <ResolutionForm
          id={row.id}
          currentResolution={row.resolution}
          isReviewed={row.reviewed_at !== null}
        />
      </section>
    </div>
  );
}
