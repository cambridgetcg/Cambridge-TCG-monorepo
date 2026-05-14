/**
 * Channel pricing — Manager page.
 *
 * Phase 3 of kingdom-049 (docs/pricing-current-state.md). The
 * `channel_pricing` table on wholesale RDS is the authoritative source
 * of channel multipliers (margin, flat fee, VAT, retail, round step).
 * This page is where operators edit those values.
 *
 * Substrate honesty: a `<Provenance kind="live" />` pill on the header
 * declares the page reads the table on every request. The status banner
 * surfaces fallback-to-defaults state if the runtime has ever fallen
 * back due to DB unreachability.
 *
 * Transparency: <WhyLink> next to the breakdown points at
 * /methodology/pricing (owned by kingdom-047) once that page ships.
 *
 * Auditability: every mutation runs through adminAction() which writes
 * to admin_actions_log and revalidates this page. Preview-before-save
 * shows the computed breakdown for a sample card so operators see the
 * downstream effect of a change before committing it.
 */

import { wsQuery } from "@/lib/admin/db";
import { fmtDateTime, fmtRelative } from "@/lib/format";
import {
  PageHeader,
  DataTable,
  SectionHeading,
  ActionBanner,
  Provenance,
  type Column,
} from "@/lib/admin/ui";
import { ChannelEditor } from "./_components";
import { getLoadStatusSafe } from "./_actions";

export const metadata = { title: "Channel pricing" };

interface ChannelRow {
  id: number;
  channel: string;
  label: string;
  description: string | null;
  margin_multiplier: string | null;
  flat_fee_singles: string | null;
  flat_fee_sealed: string | null;
  vat_multiplier: string | null;
  retail_multiplier: string | null;
  round_to: string | null;
  active: boolean;
  updated_at: string | null;
}

export default async function ChannelPricingPage() {
  const [rowsResult, status] = await Promise.all([
    wsQuery<ChannelRow>(
      `SELECT id, channel, label, description,
              margin_multiplier::text, flat_fee_singles::text,
              flat_fee_sealed::text, vat_multiplier::text,
              retail_multiplier::text, round_to::text,
              active, updated_at::text
         FROM channel_pricing
         ORDER BY channel ASC`,
    ),
    getLoadStatusSafe(),
  ]);

  const rows = rowsResult.rows;
  const inFallback = status.source === "fallback-defaults";

  const columns: Column<ChannelRow>[] = [
    {
      key: "channel",
      header: "Channel",
      render: (r) => (
        <div>
          <div className="text-sm font-medium text-white">{r.label}</div>
          <div className="text-xs text-neutral-500 font-mono">{r.channel}</div>
          {r.description && (
            <div className="text-xs text-neutral-400 mt-1">{r.description}</div>
          )}
        </div>
      ),
    },
    {
      key: "config",
      header: "Multipliers / fees",
      render: (r) => (
        <ChannelEditor
          channelId={r.id}
          channel={r.channel}
          marginMultiplier={parseFloat(r.margin_multiplier ?? "1")}
          flatFeeSingles={parseFloat(r.flat_fee_singles ?? "0")}
          flatFeeSealed={parseFloat(r.flat_fee_sealed ?? "0")}
          vatMultiplier={parseFloat(r.vat_multiplier ?? "1")}
          retailMultiplier={parseFloat(r.retail_multiplier ?? "1")}
          roundTo={parseFloat(r.round_to ?? "0.01")}
        />
      ),
    },
    {
      key: "active",
      header: "Active",
      align: "right",
      render: (r) => (
        <span
          className={
            r.active
              ? "text-emerald-400 text-xs uppercase tracking-wider"
              : "text-neutral-500 text-xs uppercase tracking-wider"
          }
        >
          {r.active ? "yes" : "no"}
        </span>
      ),
    },
    {
      key: "updated",
      header: "Updated",
      align: "right",
      render: (r) =>
        r.updated_at ? (
          <span className="text-xs text-neutral-400" title={r.updated_at}>
            {fmtRelative(r.updated_at)}
          </span>
        ) : (
          <span className="text-xs text-neutral-600">—</span>
        ),
    },
  ];

  return (
    <div className="max-w-6xl space-y-8">
      <PageHeader
        title="Channel pricing"
        description="Per-channel multipliers used by @cambridge-tcg/pricing.computePrice. The DB is authoritative; the package&#39;s JS DEFAULTS is seed-only."
        provenance={<Provenance kind="live" />}
      />

      {inFallback && (
        <ActionBanner tone="critical" title="Runtime is using fallback defaults">
          {status.lastError
            ? `Last load error: ${status.lastError.message}. Run apps/wholesale/drizzle/0010_seed_channel_pricing.sql.`
            : "Channel config DB load failed; runtime is using package SEED constants. Re-run the seed migration."}
        </ActionBanner>
      )}

      <section>
        <SectionHeading count={rows.length}>Channels</SectionHeading>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => String(r.id)}
        />
      </section>

      <section className="text-xs text-neutral-500 space-y-2 border-t border-neutral-800 pt-6">
        <p>
          Formula: <code className="text-neutral-300">price = round((base × margin + flatFee) × retail × VAT, roundTo)</code>
        </p>
        <p>
          Source code: <code className="text-neutral-300">packages/pricing/src/index.ts</code>.
          Plan: <code className="text-neutral-300">docs/pricing-current-state.md</code>.
          Connection: <code className="text-neutral-300">docs/connections/the-pricing-arrow.md</code> (S17).
        </p>
        <p>
          Phase 3 of kingdom-049: silent fallback to JS DEFAULTS removed.
          Missing channels and partial rows now throw. Run the seed
          migration <code className="text-neutral-300">0010_seed_channel_pricing.sql</code> on every wholesale RDS instance before deploying changes that depend on a new channel.
        </p>
      </section>
    </div>
  );
}
