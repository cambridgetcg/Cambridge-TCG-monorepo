import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { getSwapForUser, getSwapLifecycle } from "@/lib/swaps/db";
import { SwapStatusLabels, SwapStatusPalette } from "@/lib/ui/status-palettes";
import type { SwapItem, SwapProposal } from "@/lib/swaps/types";
import { Audience, Badge, Card, PageHeader, Provenance, WhyLink } from "@/lib/ui";
import { fmtGBP, formatDateTime, formatTimeUntil } from "@/lib/format";
import SwapActions from "./SwapActions";

// /account/swaps/[id] — one swap, participant-only, server-rendered.
// Every non-live number on this page is a snapshot from proposal time
// and is labelled as such; the platform records and witnesses — cash and
// shipping settle between the parties directly.

const ACTION_LABELS: Record<string, string> = {
  created: "Draft created",
  proposed: "Proposal sent",
  countered: "Superseded by a counter-proposal",
  accepted: "Accepted",
  declined: "Declined",
  cancelled: "Cancelled",
  cancel_requested: "Cancellation requested (needs both parties)",
  expired: "Expired without a response",
  address_set: "Ship-to address entered",
  shipping: "Both addresses in — shipping began",
  shipped: "Cards shipped",
  receipt_confirmed: "Receipt confirmed",
  completed: "Swap completed",
};

function partyLabel(swap: SwapProposal, side: "proposer" | "recipient", meId: string): string {
  const isMe = (side === "proposer" ? swap.proposer_id : swap.recipient_id) === meId;
  if (isMe) return "You";
  const username = side === "proposer" ? swap.proposer_username : swap.recipient_username;
  const name = side === "proposer" ? swap.proposer_name : swap.recipient_name;
  return username ? `@${username}` : name || "The other collector";
}

function sideTotalPence(items: SwapItem[], side: "proposer" | "recipient"): { total: number; unpriced: number } {
  let total = 0;
  let unpriced = 0;
  for (const i of items.filter((x) => x.side === side)) {
    if (i.snapshot_indicative_price_pence != null) total += i.snapshot_indicative_price_pence * i.quantity;
    else unpriced += 1;
  }
  return { total, unpriced };
}

export default async function SwapDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?return=%2Faccount%2Fswaps");
  const { id } = await params;
  const meId = session.user.id;

  const found = await getSwapForUser(id, meId);
  if (!found) notFound();
  const { swap, items } = found;
  const lifecycle = await getSwapLifecycle(id);

  const meRole: "proposer" | "recipient" = swap.proposer_id === meId ? "proposer" : "recipient";
  const mySide = meRole;
  const theirSide = meRole === "proposer" ? "recipient" : "proposer";
  const myItems = items.filter((i) => i.side === mySide);
  const theirItems = items.filter((i) => i.side === theirSide);
  const myTotal = sideTotalPence(items, mySide);
  const theirTotal = sideTotalPence(items, theirSide);
  // cash_delta_pence: + = proposer pays; rephrase from MY perspective.
  const myDelta = meRole === "proposer" ? swap.cash_delta_pence : -swap.cash_delta_pence;
  const counterparty = partyLabel(swap, theirSide, meId);

  const cancelRequestedByOther = lifecycle.some(
    (e) => e.action === "cancel_requested" && e.actor_id != null && e.actor_id !== meId,
  );
  const cancelRequestedByMe = lifecycle.some(
    (e) => e.action === "cancel_requested" && e.actor_id === meId,
  );

  return (
    <div>
      <Audience kind="consumer" />
      <PageHeader
        title={`Swap with ${counterparty}`}
        description={
          <>
            Cambridge TCG facilitates and records this swap; payment of any cash difference
            and shipping happen between you directly.
            <WhyLink href="/methodology/swaps" tooltip="What the platform records, and what it doesn't do" />
          </>
        }
        action={
          <Badge
            status={swap.status}
            palette={SwapStatusPalette}
            labels={SwapStatusLabels}
            size="md"
          />
        }
      />

      {swap.status === "proposed" && swap.expires_at && (
        <p className="text-xs text-neutral-400 -mt-3 mb-4">
          {meRole === "recipient" ? "You have" : `${counterparty} has`}{" "}
          {formatTimeUntil(swap.expires_at)} to respond (until {formatDateTime(swap.expires_at)}).
          The window defaults to the recipient&apos;s response-window setting.
          <WhyLink href="/methodology/response-windows" />
        </p>
      )}
      {swap.counter_of && (
        <p className="text-xs text-neutral-400 -mt-1 mb-4">
          This is a counter-proposal.{" "}
          <Link href={`/account/swaps/${swap.counter_of}`} className="text-amber-400 hover:text-amber-300">
            View the proposal it supersedes →
          </Link>
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <ItemsCard title="You send" items={myItems} totalPence={myTotal.total} unpriced={myTotal.unpriced} snapshotAt={swap.created_at} />
        <ItemsCard title="You receive" items={theirItems} totalPence={theirTotal.total} unpriced={theirTotal.unpriced} snapshotAt={swap.created_at} />
      </div>

      {/* Cash delta + note */}
      <Card className="mb-4">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <div>
            <p className="text-xs text-neutral-500 uppercase tracking-wide mb-1">Recorded cash difference</p>
            {swap.cash_delta_pence === 0 ? (
              <p className="text-sm text-white font-bold">None — even swap</p>
            ) : (
              <p className="text-sm text-white font-bold">
                {myDelta > 0 ? "You pay" : "You receive"} {fmtGBP(Math.abs(myDelta) / 100)}
              </p>
            )}
            <p className="text-[10px] text-neutral-500 mt-1">
              Recorded here; paid between you directly — the platform does not hold or move
              this money.
              <WhyLink href="/methodology/swaps" />
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-neutral-500 uppercase tracking-wide mb-1">Indicative imbalance at proposal</p>
            <p className="text-sm text-neutral-300 font-mono">
              {fmtGBP((theirTotal.total - myTotal.total) / 100)}{" "}
              <span className="text-neutral-500">(their side − yours)</span>
            </p>
            <Provenance kind="snapshot" at={swap.created_at} source="recent trades + CTCG spot" />
          </div>
        </div>
        {swap.note && (
          <p className="text-sm text-neutral-300 mt-3 border-t border-neutral-800 pt-3 whitespace-pre-wrap">
            “{swap.note}”
          </p>
        )}
      </Card>

      {/* Actions + address/ship/confirm forms (client island) */}
      <SwapActions
        swap={swap}
        meRole={meRole}
        cancelRequestedByOther={cancelRequestedByOther}
        cancelRequestedByMe={cancelRequestedByMe}
      />

      {/* Timeline */}
      <Card className="mt-4">
        <h2 className="text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-3">
          Timeline
        </h2>
        {lifecycle.length === 0 ? (
          <p className="text-xs text-neutral-500">No events recorded yet.</p>
        ) : (
          <ol className="space-y-2">
            {lifecycle.map((e) => (
              <li key={e.id} className="flex items-baseline gap-3 text-sm">
                <span className="text-[10px] text-neutral-500 font-mono shrink-0 w-32">
                  {formatDateTime(e.created_at)}
                </span>
                <span className="text-neutral-200">
                  {ACTION_LABELS[e.action] ?? e.action.replace(/_/g, " ")}
                  {e.actor_label && (
                    <span className="text-neutral-500">
                      {" "}· {e.actor_label === "system"
                        ? "automatic"
                        : e.actor_id === meId
                          ? "you"
                          : counterparty}
                    </span>
                  )}
                  {e.reason && <span className="block text-xs text-neutral-500">“{e.reason}”</span>}
                </span>
              </li>
            ))}
          </ol>
        )}
        <p className="text-[10px] text-neutral-600 mt-3">
          Append-only record (swap_lifecycle_log) — entries are written with each transition
          and never edited.
        </p>
      </Card>
    </div>
  );
}

function ItemsCard({
  title,
  items,
  totalPence,
  unpriced,
  snapshotAt,
}: {
  title: string;
  items: SwapItem[];
  totalPence: number;
  unpriced: number;
  snapshotAt: string;
}) {
  return (
    <Card>
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <h2 className="text-xs font-semibold text-neutral-400 uppercase tracking-wide">{title}</h2>
        <div className="text-right">
          <span className="text-sm text-white font-bold">{fmtGBP(totalPence / 100)}</span>{" "}
          <Provenance kind="snapshot" at={snapshotAt} source="recent trades + CTCG spot" />
        </div>
      </div>
      {unpriced > 0 && (
        <p className="text-[10px] text-amber-400 mb-2">
          {unpriced} line(s) had no price data at proposal time — the total understates this side.
        </p>
      )}
      <ul className="space-y-1.5">
        {items.map((i) => (
          <li key={i.id} className="flex items-center gap-2">
            {i.snapshot_image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={i.snapshot_image_url} alt="" className="w-7 h-9 rounded object-cover border border-neutral-800 shrink-0" />
            ) : (
              <div className="w-7 h-9 rounded bg-neutral-800 shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-xs text-white truncate">{i.snapshot_name || i.sku}</p>
              <p className="text-[10px] text-neutral-500 font-mono truncate">
                {i.sku} · {i.condition} × {i.quantity}
              </p>
            </div>
            <span className="text-xs text-neutral-300 font-mono shrink-0">
              {i.snapshot_indicative_price_pence != null
                ? fmtGBP((i.snapshot_indicative_price_pence * i.quantity) / 100)
                : "—"}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
