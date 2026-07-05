"use client";

// /account/swaps — collector swap list, incoming/outgoing.
// House list-page shape: PageHeader → Tabs → error → skeleton/empty/cards.
// v1 copy is deliberate: the platform records and witnesses; cash and
// shipping settle between the parties directly.

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Audience,
  Badge,
  Card,
  EmptyState,
  ErrorAlert,
  LinkButton,
  ListSkeleton,
  PageHeader,
  Tabs,
  WhyLink,
} from "@/lib/ui";
import { SwapStatusLabels, SwapStatusPalette } from "@/lib/ui/status-palettes";
import type { SwapProposal } from "@/lib/swaps/types";
import { formatRelativeTime, formatTimeUntil, fmtGBP, pluralize } from "@/lib/format";

const TABS = [
  { value: "incoming" as const, label: "Incoming" },
  { value: "outgoing" as const, label: "Outgoing" },
];

export default function SwapsPage() {
  const [tab, setTab] = useState<"incoming" | "outgoing">("incoming");
  const [swaps, setSwaps] = useState<SwapProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/swaps?mode=${tab}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setSwaps(d.swaps || []);
      })
      .catch(() => setError("Failed to load swaps"))
      .finally(() => setLoading(false));
  }, [tab]);

  return (
    <div>
      <Audience kind="consumer" />
      <PageHeader
        title="Swaps"
        description={
          <>
            Card-for-card trades with other collectors. Cambridge TCG facilitates and
            records each swap; payment of any cash difference and shipping happen between
            you directly.
            <WhyLink href="/methodology/swaps" tooltip="What swaps are and what the platform does (and doesn't) do" />
          </>
        }
        action={<LinkButton href="/account/swaps/new">Propose a swap</LinkButton>}
      />

      <Tabs tabs={TABS} selected={tab} onSelect={setTab} />

      {error && <ErrorAlert description={error} />}

      {loading ? (
        <ListSkeleton rows={3} />
      ) : swaps.length === 0 ? (
        <EmptyState
          title={tab === "incoming" ? "No incoming swap proposals." : "No outgoing swap proposals yet."}
          description="Start one from a fellow collector's message thread, or propose directly."
          action={<LinkButton href="/account/swaps/new">Propose a swap</LinkButton>}
        />
      ) : (
        <div className="space-y-3">
          {swaps.map((s) => {
            const counterparty =
              tab === "incoming"
                ? s.proposer_username
                  ? `@${s.proposer_username}`
                  : s.proposer_name || "A collector"
                : s.recipient_username
                  ? `@${s.recipient_username}`
                  : s.recipient_name || "A collector";
            const give = tab === "incoming" ? s.recipient_item_count : s.proposer_item_count;
            const get = tab === "incoming" ? s.proposer_item_count : s.recipient_item_count;
            // cash_delta_pence: + = proposer pays. Rephrase from MY side.
            const iAmProposer = tab === "outgoing";
            const myDelta = iAmProposer ? s.cash_delta_pence : -s.cash_delta_pence;
            return (
              <Link key={s.id} href={`/account/swaps/${s.id}`} className="block group">
                <Card className="group-hover:border-accent/40 transition">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <p className="text-sm text-ink font-bold">
                        {tab === "incoming" ? `From ${counterparty}` : `To ${counterparty}`}
                      </p>
                      <p className="text-xs text-ink-muted mt-1">
                        You send {give ?? 0} {pluralize(give ?? 0, "card line")} · you receive{" "}
                        {get ?? 0} {pluralize(get ?? 0, "card line")}
                        {myDelta !== 0 && (
                          <>
                            {" "}· {myDelta > 0 ? "you pay" : "you receive"}{" "}
                            {fmtGBP(Math.abs(myDelta) / 100)} (recorded — settled between you)
                          </>
                        )}
                      </p>
                      {s.note && (
                        <p className="text-xs text-ink-faint mt-1 truncate">“{s.note}”</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <Badge status={s.status} palette={SwapStatusPalette} labels={SwapStatusLabels} />
                      <p className="text-[10px] text-ink-faint mt-1.5">
                        {s.status === "proposed" && s.expires_at
                          ? `responds within ${formatTimeUntil(s.expires_at)}`
                          : formatRelativeTime(s.updated_at)}
                      </p>
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
