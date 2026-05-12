/**
 * Rewards — Prize fulfilment queue (kingdom-023, money trinity, last chapel).
 *
 * Unifies physical-prize fulfilment across three sources:
 *   - raffles                 (winner_user_id IS NOT NULL AND prize_fulfilled = false)
 *   - mystery_box_opens       (reward_type = 'physical' AND fulfilled = false)
 *   - pack_opens              (cards JSON contains "reward_type":"physical")
 *
 * Operator workflow:
 *   1. Customer wins → "Awaiting customer address" until they enter shipping.
 *   2. Address submitted → "Ready to ship" (clustered by user+address — N prizes,
 *      one envelope is the common case).
 *   3. Operator ships (per prize OR bulk by cluster) → "Shipped — awaiting confirm".
 *   4. Operator marks fulfilled when the customer has acknowledged receipt.
 *
 * Substrate honesty:
 *   - Queue is live from storefront RDS.
 *   - Shipping address is a customer-supplied snapshot at the moment of
 *     prize-claim (substrate-honest about who set it).
 *   - Tracking + carrier are operator-stamped (not verified against carrier APIs).
 *
 * Scope V1:
 *   - ship single, bulk-ship cluster, mark fulfilled.
 *   - Undo deep-links to the legacy admin (the 30-min eligibility check
 *     lives in `@/lib/rewards/prize-fulfilment-log` on storefront and admin
 *     should not import storefront internals; a shared-package extraction
 *     is the follow-up).
 *   - Raffle / mystery-box / pack *config* still in legacy
 *     (`cambridgetcg.com/admin/rewards`); this chapel is fulfilment-only.
 *
 * Methodology: /methodology/prize-fulfillment.
 */

import * as React from "react";
import Link from "next/link";
import { sfQuery } from "@/lib/db";
import { fmtDate, fmtNumber } from "@/lib/format";
import {
  PageHeader,
  KpiGrid,
  KpiCard,
  SectionHeading,
  Provenance,
  WhyLink,
  ExternalLink,
} from "@/lib/ui";
import { PrizeActions, BulkClusterActions } from "./_components";

export const metadata = { title: "Rewards" };

interface PrizeRow {
  kind: "raffle" | "mystery_box" | "pack";
  id: string;
  label: string;
  prize_description: string | null;
  user_id: string;
  user_email: string;
  user_name: string | null;
  shipping_address: string | null;
  shipping_collected_at: string | null;
  tracking_number: string | null;
  carrier: string | null;
  shipped_at: string | null;
  fulfilled: boolean;
  won_at: string;
}

export default async function Page() {
  const r = await sfQuery<PrizeRow>(
    `SELECT * FROM (
       SELECT 'raffle'::text AS kind, r.id::text AS id, r.title AS label,
              r.prize_description,
              u.id::text AS user_id, u.email AS user_email, u.name AS user_name,
              r.shipping_address, r.shipping_collected_at::text AS shipping_collected_at,
              r.tracking_number, r.carrier, r.shipped_at::text AS shipped_at,
              r.prize_fulfilled AS fulfilled,
              r.winner_drawn_at::text AS won_at
         FROM raffles r
         JOIN users u ON u.id = r.winner_user_id
        WHERE r.winner_user_id IS NOT NULL AND r.prize_fulfilled = false
       UNION ALL
       SELECT 'mystery_box'::text AS kind, mbo.id::text AS id, mb.title AS label,
              mr.description AS prize_description,
              u.id::text AS user_id, u.email AS user_email, u.name AS user_name,
              mbo.shipping_address, mbo.shipping_collected_at::text AS shipping_collected_at,
              mbo.tracking_number, mbo.carrier, mbo.shipped_at::text AS shipped_at,
              mbo.fulfilled,
              mbo.created_at::text AS won_at
         FROM mystery_box_opens mbo
         JOIN mystery_box_rewards mr ON mr.id = mbo.reward_id
         JOIN mystery_boxes mb ON mb.id = mbo.box_id
         JOIN users u ON u.id = mbo.user_id
        WHERE mr.reward_type = 'physical' AND mbo.fulfilled = false
       UNION ALL
       SELECT 'pack'::text AS kind, po.id::text AS id, p.title AS label,
              'Physical card pulls'::text AS prize_description,
              u.id::text AS user_id, u.email AS user_email, u.name AS user_name,
              po.shipping_address, po.shipping_collected_at::text AS shipping_collected_at,
              po.tracking_number, po.carrier, po.shipped_at::text AS shipped_at,
              po.fulfilled,
              po.created_at::text AS won_at
         FROM pack_opens po
         JOIN reward_packs p ON p.id = po.pack_id
         JOIN users u ON u.id = po.user_id
        WHERE po.fulfilled = false
          AND po.cards::text ILIKE '%"reward_type":"physical"%'
     ) AS prizes
     ORDER BY won_at ASC
     LIMIT 200`,
  );

  const prizes = r.rows;
  const readyToShip = prizes.filter(
    (p) => p.shipping_collected_at && !p.shipped_at,
  );
  const shipped = prizes.filter((p) => p.shipped_at && !p.fulfilled);
  const awaitingAddress = prizes.filter((p) => !p.shipping_collected_at);

  // Cluster ready-to-ship by (user_id, address) — same user + same address
  // = one envelope. Sorted oldest-first within cluster.
  const clusterMap = new Map<string, PrizeRow[]>();
  for (const p of readyToShip) {
    const key = `${p.user_id}::${(p.shipping_address ?? "").trim()}`;
    const arr = clusterMap.get(key) ?? [];
    arr.push(p);
    clusterMap.set(key, arr);
  }
  const clusters = [...clusterMap.values()].map((arr) =>
    arr.slice().sort(
      (a, b) => new Date(a.won_at).getTime() - new Date(b.won_at).getTime(),
    ),
  );

  // KPIs
  const totalUnfulfilled = prizes.length;
  const readyCount = readyToShip.length;
  const inTransit = shipped.length;
  const awaitingCount = awaitingAddress.length;
  // The oldest unfulfilled — the operator's "longest waiting" debt.
  const oldestWaiting = prizes[0];
  const oldestDays = oldestWaiting
    ? Math.floor(
        (Date.now() - new Date(oldestWaiting.won_at).getTime()) / 86_400_000,
      )
    : 0;

  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader
        title="Rewards"
        provenance={<Provenance kind="live" source="Storefront RDS" />}
        description={
          <>
            Physical-prize fulfilment queue across raffles, mystery boxes, and
            reward packs. Address-collected prizes cluster by user+address so
            multiple wins ship in one envelope.{" "}
            <WhyLink
              href="https://cambridgetcg.com/methodology/prize-fulfillment"
              label="ordering rules"
            />
          </>
        }
        action={
          <ExternalLink
            href="https://cambridgetcg.com/admin/rewards"
            variant="primary"
          >
            Raffle / box config
          </ExternalLink>
        }
      />

      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-2 text-xs text-amber-200/80">
        Raffle and mystery-box <em>configuration</em> (creating a new draw,
        adding rewards, drawing a winner) still happens in the legacy admin.
        This chapel is fulfilment-only — ship, bulk-ship, mark fulfilled. Undo
        a recent ship via the legacy admin&apos;s 30-minute window.
      </div>

      <KpiGrid cols={4}>
        <KpiCard
          label="Unfulfilled"
          value={fmtNumber(totalUnfulfilled)}
          urgency={totalUnfulfilled > 0 ? "warning" : "ok"}
          sub={oldestWaiting ? `oldest: ${oldestDays}d` : undefined}
        />
        <KpiCard
          label="Ready to ship"
          value={fmtNumber(readyCount)}
          urgency={readyCount > 0 ? "critical" : "ok"}
          sub={`${clusters.length} ${clusters.length === 1 ? "cluster" : "clusters"}`}
        />
        <KpiCard
          label="Shipped (awaiting confirm)"
          value={fmtNumber(inTransit)}
          urgency={inTransit > 0 ? "info" : "ok"}
        />
        <KpiCard
          label="Awaiting address"
          value={fmtNumber(awaitingCount)}
          urgency="neutral"
        />
      </KpiGrid>

      {clusters.length > 0 && (
        <section>
          <SectionHeading count={readyCount}>Ready to ship</SectionHeading>
          <div className="space-y-3">
            {clusters.map((cluster) => {
              const head = cluster[0]!;
              const isBundle = cluster.length > 1;
              return (
                <div
                  key={`${head.user_id}::${head.shipping_address ?? ""}`}
                  className={[
                    "rounded-xl bg-neutral-900 p-4 border",
                    isBundle ? "border-amber-500/30" : "border-neutral-800",
                  ].join(" ")}
                >
                  <div className="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
                    <div className="min-w-0">
                      {isBundle && (
                        <span className="text-xs bg-amber-500/15 text-amber-400 rounded px-2 py-0.5 font-bold uppercase tracking-wider mr-2">
                          {cluster.length} prizes · one envelope
                        </span>
                      )}
                      <Link
                        href={`/catalog/users/${head.user_id}`}
                        className="text-xs text-neutral-200 hover:text-white"
                      >
                        {head.user_name ?? head.user_email}
                      </Link>
                    </div>
                    {isBundle && (
                      <BulkClusterActions
                        cluster={cluster.map((p) => ({
                          kind: p.kind,
                          id: p.id,
                          label: p.label,
                        }))}
                        userLabel={head.user_name ?? head.user_email}
                      />
                    )}
                  </div>

                  {head.shipping_address && (
                    <p className="text-xs text-neutral-400 mb-3 whitespace-pre-wrap">
                      {head.shipping_address}
                    </p>
                  )}

                  <div className="space-y-2">
                    {cluster.map((p) => (
                      <div
                        key={`${p.kind}:${p.id}`}
                        className="flex items-start gap-3 p-2 rounded bg-neutral-950/60"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] text-neutral-500 capitalize">
                            {p.kind.replace("_", " ")}
                          </p>
                          <p className="text-sm font-bold text-white truncate">
                            {p.label}
                          </p>
                          {p.prize_description && (
                            <p className="text-xs text-neutral-400 truncate">
                              {p.prize_description}
                            </p>
                          )}
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-[10px] text-neutral-500">
                            won {fmtDate(p.won_at)}
                          </p>
                          <div className="mt-1">
                            <PrizeActions
                              prize={{
                                kind: p.kind,
                                id: p.id,
                                label: p.label,
                                state: "ready",
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {shipped.length > 0 && (
        <section>
          <SectionHeading count={shipped.length}>
            Shipped — awaiting confirmation
          </SectionHeading>
          <div className="rounded-xl bg-neutral-900 border border-neutral-800 divide-y divide-neutral-800">
            {shipped.map((p) => {
              const shippedMs = p.shipped_at
                ? new Date(p.shipped_at).getTime()
                : 0;
              const ageMin = Math.floor((Date.now() - shippedMs) / 60_000);
              const undoable = ageMin < 30;
              return (
                <div key={`${p.kind}:${p.id}`} className="p-4">
                  <div className="flex items-baseline justify-between mb-1 gap-3">
                    <div className="min-w-0">
                      <p className="text-[10px] text-neutral-500 capitalize">
                        {p.kind.replace("_", " ")}
                      </p>
                      <p className="text-sm font-bold text-white truncate">
                        {p.label}
                      </p>
                      {p.prize_description && (
                        <p className="text-xs text-neutral-400 truncate">
                          {p.prize_description}
                        </p>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <Link
                        href={`/catalog/users/${p.user_id}`}
                        className="text-xs text-neutral-200 hover:text-white"
                      >
                        {p.user_name ?? p.user_email}
                      </Link>
                      <p className="text-[10px] text-neutral-500">
                        shipped {fmtDate(p.shipped_at)}
                      </p>
                    </div>
                  </div>
                  {p.tracking_number && (
                    <p className="text-xs text-emerald-400 mt-2 font-mono">
                      {p.carrier && (
                        <span className="text-neutral-500 mr-1">
                          {p.carrier}
                        </span>
                      )}
                      {p.tracking_number}
                    </p>
                  )}
                  <div className="mt-3 flex items-center gap-2">
                    <PrizeActions
                      prize={{
                        kind: p.kind,
                        id: p.id,
                        label: p.label,
                        state: "shipped",
                      }}
                    />
                    {undoable && (
                      <a
                        href="https://cambridgetcg.com/admin/prizes"
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Undo within 30 min — handled in legacy admin"
                        className="text-xs text-amber-400 hover:text-amber-300 underline"
                      >
                        Undo (legacy) ↗
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {awaitingAddress.length > 0 && (
        <section>
          <SectionHeading count={awaitingAddress.length}>
            Awaiting customer address
          </SectionHeading>
          <div className="rounded-xl bg-neutral-900 border border-neutral-800 divide-y divide-neutral-800">
            {awaitingAddress.map((p) => (
              <div
                key={`${p.kind}:${p.id}`}
                className="p-4 flex items-baseline justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-[10px] text-neutral-500 capitalize">
                    {p.kind.replace("_", " ")}
                  </p>
                  <p className="text-sm font-bold text-white truncate">
                    {p.label}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <Link
                    href={`/catalog/users/${p.user_id}`}
                    className="text-xs text-neutral-200 hover:text-white"
                  >
                    {p.user_name ?? p.user_email}
                  </Link>
                  <p className="text-[10px] text-neutral-500">
                    won {fmtDate(p.won_at)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {prizes.length === 0 && (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-8 text-center">
          <p className="text-sm text-neutral-400">
            No unfulfilled prizes. The queue is empty.
          </p>
        </div>
      )}
    </div>
  );
}
