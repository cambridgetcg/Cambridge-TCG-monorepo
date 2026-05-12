"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { WhyLink } from "@/lib/ui";

import { Audience } from "@/lib/ui";
interface PayoutStatus {
  accountId: string | null;
  status: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  updatedAt: string | null;
}

interface PendingPayout {
  id: string;
  label: string;
  amountFormatted: string;
  when: string;
  availableAt: string | null;
  isReady: boolean;
  holdDays: number;
}

// Trade-in and quote pending rows carry more detail because a single
// submission can have both a cash and credit leg, each paid independently.
interface PendingSubmissionPayout {
  reference: string;
  status: string;
  cashOwed: number;
  creditOwed: number;
  amount: number;
  amountFormatted: string;
  when: string;
}

interface HistoryRow {
  source: "trade" | "auction" | "tradein_cash" | "tradein_credit" | "quote_cash" | "quote_credit";
  id: string;
  label: string;
  amount: number;
  amountFormatted: string;
  paidAt: string;
  method: "stripe" | "bank" | "store_credit" | "other";
  reference: string | null;
}

interface HistoryPayload {
  rows: HistoryRow[];
  totals: {
    ytd: number;
    ytdFormatted: string;
    allTime: number;
    allTimeFormatted: string;
  };
  truncated: boolean;
  totalRows: number;
}

const SOURCE_LABELS: Record<HistoryRow["source"], string> = {
  trade: "P2P trade",
  auction: "Auction",
  tradein_cash: "Trade-in (cash)",
  tradein_credit: "Trade-in (credit)",
  quote_cash: "Quote (cash)",
  quote_credit: "Quote (credit)",
};

const METHOD_LABELS: Record<HistoryRow["method"], string> = {
  stripe: "Stripe",
  bank: "Bank",
  store_credit: "Store credit",
  other: "Other",
};

const STATUS_COPY: Record<string, { badge: string; className: string; detail: string }> = {
  pending: {
    badge: "Not started",
    className: "bg-neutral-500/15 text-neutral-300 border-neutral-500/30",
    detail: "Complete Stripe onboarding to start receiving payouts.",
  },
  incomplete: {
    badge: "Onboarding incomplete",
    className: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    detail: "Stripe still needs some information from you. Click Continue to finish.",
  },
  verified: {
    badge: "Verified",
    className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    detail: "Your Stripe account is set up and ready to receive payouts.",
  },
  restricted: {
    badge: "Restricted",
    className: "bg-red-500/15 text-red-400 border-red-500/30",
    detail: "Stripe has restricted your account. Open the portal to see what's needed.",
  },
  rejected: {
    badge: "Rejected",
    className: "bg-red-500/15 text-red-400 border-red-500/30",
    detail: "Stripe rejected your account. Contact support.",
  },
};

// Next 16 requires useSearchParams() consumers behind a Suspense
// boundary to avoid CSR-bailout during static prerender.
export default function PayoutsPage() {
  return (
    <Suspense fallback={<p className="text-neutral-500 text-sm">Loading...</p>}>
      <Audience kind="consumer" />
      <PayoutsPageInner />
    </Suspense>
  );
}

function PayoutsPageInner() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<PayoutStatus | null>(null);
  const [pending, setPending] = useState<{
    trades: PendingPayout[];
    auctions: PendingPayout[];
    tradeins: PendingSubmissionPayout[];
    quotes: PendingSubmissionPayout[];
    totalOwedFormatted: string;
    readyTotalFormatted: string;
    holdingTotalFormatted: string;
    nextAvailableAt: string | null;
  } | null>(null);
  const [liquidity, setLiquidity] = useState<{ awardCount: number; totalFormatted: string } | null>(null);
  const [history, setHistory] = useState<HistoryPayload | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<"all" | HistoryRow["source"]>("all");
  const [loading, setLoading] = useState(true);
  const [onboarding, setOnboarding] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [country, setCountry] = useState("GB");
  const [countries, setCountries] = useState<string[]>([]);

  // Country list is only needed pre-onboarding; fetched lazily.
  useEffect(() => {
    fetch("/api/account/payouts/countries")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.countries) setCountries(d.countries); })
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/account/payouts/status");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to load payout status");
        return;
      }
      const data = await res.json();
      setStatus(data.status);
      setPending(data.pending);
      setLiquidity(data.liquidity ?? null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // History loads independently so a slow multi-source union doesn't
  // block the pending/status view above it.
  useEffect(() => {
    setHistoryLoading(true);
    fetch("/api/account/payouts/history")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setHistory(d))
      .finally(() => setHistoryLoading(false));
  }, []);

  // If we just returned from the hosted onboarding flow, Stripe's webhook
  // may lag. Trigger an explicit refresh so the UI reflects the new state.
  useEffect(() => {
    if (searchParams.get("onboarding") === "return") {
      refresh();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  async function startOnboarding() {
    setOnboarding(true);
    setError(null);
    try {
      const res = await fetch("/api/account/payouts/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // country is only consulted on first-time account creation; ignored
        // for returning sellers since Express accounts have fixed country
        body: JSON.stringify({ country }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to start onboarding");
        return;
      }
      window.location.href = data.url;
    } finally {
      setOnboarding(false);
    }
  }

  async function refresh() {
    setRefreshing(true);
    setError(null);
    try {
      const res = await fetch("/api/account/payouts/refresh", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to refresh");
        return;
      }
      setStatus(data.status);
      // Re-fetch pending amounts too since status affects messaging
      const p = await fetch("/api/account/payouts/status").then((r) => r.json());
      if (p?.pending) setPending(p.pending);
    } finally {
      setRefreshing(false);
    }
  }

  if (loading) {
    return <p className="text-neutral-500 text-sm">Loading...</p>;
  }

  const copy = status?.status ? STATUS_COPY[status.status] : null;

  return (
    <div>
      <h1 className="text-2xl font-black text-white mb-2">
        Payouts
        <WhyLink href="/methodology/payout-hold" tooltip="Why is my payout held, and for how long?" />
      </h1>
      <p className="text-sm text-neutral-400 mb-6">
        Connect your bank account via Stripe to receive payouts for trades and auctions you sell.
      </p>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-6 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Status card */}
      <div className="bg-neutral-900 rounded-xl p-5 mb-6">
        {!status?.accountId ? (
          <>
            <h2 className="text-white font-bold mb-1">Get paid via Stripe</h2>
            <p className="text-sm text-neutral-400 mb-4">
              Stripe handles identity verification, bank details, and payouts. Takes a few minutes.
              You only need to do this once.
            </p>
            <div className="mb-4">
              <label className="block text-xs text-neutral-500 mb-1">Country</label>
              <select
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="w-full max-w-xs px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm"
              >
                {(countries.length ? countries : ["GB"]).map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <p className="text-[11px] text-neutral-500 mt-1">
                Country is fixed once your Stripe account is created. Choose carefully.
              </p>
            </div>
            <button
              onClick={startOnboarding}
              disabled={onboarding}
              className="px-4 py-2.5 bg-amber-500 text-black text-sm font-bold rounded-lg hover:bg-amber-400 transition disabled:opacity-50"
            >
              {onboarding ? "Opening Stripe..." : "Connect with Stripe"}
            </button>
          </>
        ) : (
          <>
            <div className="flex items-start justify-between gap-4 mb-3">
              <div>
                <h2 className="text-white font-bold">Stripe Connect</h2>
                {copy && (
                  <span className={`inline-block mt-1 text-xs font-medium px-2 py-0.5 rounded-full border ${copy.className}`}>
                    {copy.badge}
                  </span>
                )}
              </div>
              <button
                onClick={refresh}
                disabled={refreshing}
                className="text-xs text-neutral-400 hover:text-white transition"
              >
                {refreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
            <p className="text-sm text-neutral-400 mb-4">{copy?.detail}</p>
            <div className="flex gap-3 flex-wrap">
              {status.status !== "verified" && (
                <button
                  onClick={startOnboarding}
                  disabled={onboarding}
                  className="px-4 py-2 bg-amber-500 text-black text-sm font-bold rounded-lg hover:bg-amber-400 transition disabled:opacity-50"
                >
                  {onboarding ? "Opening..." : status.status === "incomplete" ? "Continue onboarding" : "Open Stripe portal"}
                </button>
              )}
              <div className="text-xs text-neutral-500 flex items-center gap-3">
                <span>Charges: {status.chargesEnabled ? "on" : "off"}</span>
                <span>Payouts: {status.payoutsEnabled ? "on" : "off"}</span>
                {status.updatedAt && (
                  <span>Last synced {new Date(status.updatedAt).toLocaleDateString("en-GB")}</span>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Pending payouts */}
      {pending && (pending.trades.length > 0 || pending.auctions.length > 0 || pending.tradeins.length > 0 || pending.quotes.length > 0) && (
        <div className="bg-neutral-900 rounded-xl p-5">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-white font-bold text-sm uppercase tracking-wide">Pending Payouts</h2>
            <span className="text-amber-400 font-bold">{pending.totalOwedFormatted}</span>
          </div>

          {/* Ready vs holding split. Sellers see at a glance how much
              they could collect now vs. how much is still in the
              hold-period queue, plus when the next holding row clears. */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-emerald-400 font-semibold">Ready to release</div>
              <div className="text-sm font-mono font-bold text-white mt-0.5">{pending.readyTotalFormatted}</div>
            </div>
            <div className="bg-neutral-800/60 border border-neutral-700 rounded-lg px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-neutral-400 font-semibold">In hold window</div>
              <div className="text-sm font-mono font-bold text-white mt-0.5">{pending.holdingTotalFormatted}</div>
              {pending.nextAvailableAt && (
                <div className="text-[10px] text-neutral-500 mt-0.5">
                  Next clears <RelativeDate iso={pending.nextAvailableAt} />
                </div>
              )}
            </div>
          </div>

          <p className="text-xs text-neutral-500 mb-4">
            Hold period starts when a trade completes or an auction is paid. Once the timer
            elapses, the cron sweep releases the payout to your Stripe account.
          </p>
          {pending.trades.length > 0 && (
            <div className="mb-4">
              <p className="text-xs text-neutral-500 mb-2">P2P trades</p>
              <div className="space-y-1.5">
                {pending.trades.map((t) => (
                  <PendingTradeRow key={t.id} row={t} />
                ))}
              </div>
            </div>
          )}
          {pending.auctions.length > 0 && (
            <div className="mb-4">
              <p className="text-xs text-neutral-500 mb-2">Auctions</p>
              <div className="space-y-1.5">
                {pending.auctions.map((a) => (
                  <PendingTradeRow key={a.id} row={a} />
                ))}
              </div>
            </div>
          )}
          {pending.tradeins.length > 0 && (
            <div className="mb-4">
              <p className="text-xs text-neutral-500 mb-2">Trade-ins</p>
              <div className="space-y-1.5">
                {pending.tradeins.map((r) => (
                  <PendingSubmissionRow key={r.reference} row={r} kind="Trade-in" />
                ))}
              </div>
            </div>
          )}
          {pending.quotes.length > 0 && (
            <div>
              <p className="text-xs text-neutral-500 mb-2">Quotes</p>
              <div className="space-y-1.5">
                {pending.quotes.map((r) => (
                  <PendingSubmissionRow key={r.reference} row={r} kind="Quote" />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {pending && pending.trades.length === 0 && pending.auctions.length === 0 && pending.tradeins.length === 0 && pending.quotes.length === 0 && (
        <p className="text-sm text-neutral-500">No pending payouts.</p>
      )}

      {liquidity && liquidity.awardCount > 0 && (
        <div className="mt-6 bg-neutral-900 rounded-xl p-5 border border-purple-500/20">
          <div className="flex items-baseline justify-between mb-1">
            <h2 className="text-sm font-bold text-purple-400 uppercase tracking-wide">
              Liquidity rewards
            </h2>
            <span className="text-purple-400 font-mono font-bold">{liquidity.totalFormatted}</span>
          </div>
          <p className="text-xs text-neutral-500">
            {liquidity.awardCount} rewards earned for keeping tight, resting asks. Paid as store credit &middot;
            appears in your account credit balance.
          </p>
        </div>
      )}

      {/* Earnings history — unified view across all payout sources */}
      <EarningsHistorySection
        history={history}
        loading={historyLoading}
        filter={historyFilter}
        onFilterChange={setHistoryFilter}
      />
    </div>
  );
}

// "in 3 days" / "tomorrow" / "today" / "ready" — short relative date.
// Avoids using a heavy formatter; the resolution is day-grain.
function RelativeDate({ iso }: { iso: string }) {
  const t = new Date(iso).getTime();
  const ms = t - Date.now();
  if (ms <= 0) return <span className="text-emerald-400 font-medium">ready</span>;
  const days = Math.ceil(ms / (24 * 60 * 60 * 1000));
  if (days <= 1) return <span>tomorrow</span>;
  return <span>in {days} days</span>;
}

function PendingTradeRow({ row }: { row: PendingPayout }) {
  const dateLabel = row.availableAt
    ? new Date(row.availableAt).toLocaleDateString("en-GB", {
        day: "numeric", month: "short",
      })
    : null;
  return (
    <div className="flex items-center justify-between text-sm gap-3">
      <div className="min-w-0">
        <div className="text-neutral-300 truncate">{row.label}</div>
        <div className="text-[11px] text-neutral-500 mt-0.5">
          {row.isReady ? (
            <span className="text-emerald-400 font-medium">Ready to release</span>
          ) : row.availableAt ? (
            <>
              <span>Available {dateLabel}</span>
              <span className="mx-1.5">·</span>
              <RelativeDate iso={row.availableAt} />
              <span className="mx-1.5">·</span>
              <span className="text-neutral-600">{row.holdDays}-day hold</span>
            </>
          ) : (
            <span className="text-neutral-600">Hold timer not started</span>
          )}
        </div>
      </div>
      <span className="text-white font-mono shrink-0 ml-3">{row.amountFormatted}</span>
    </div>
  );
}

function PendingSubmissionRow({ row, kind }: { row: PendingSubmissionPayout; kind: "Trade-in" | "Quote" }) {
  // Split-leg hint: if only one of cash/credit is owed, say so. Helps
  // sellers reading a mixed submission understand what's left to clear.
  const legHint =
    row.cashOwed > 0 && row.creditOwed > 0 ? "cash + credit"
    : row.cashOwed > 0 ? "cash"
    : row.creditOwed > 0 ? "credit"
    : "—";
  return (
    <div className="flex items-center justify-between text-sm gap-3">
      <span className="text-neutral-300 truncate">
        {kind} <span className="text-neutral-500">{row.reference}</span>
      </span>
      <span className="flex items-center gap-2 shrink-0">
        <span className="text-[10px] text-neutral-500 uppercase tracking-wide">{row.status} · {legHint}</span>
        <span className="text-white font-mono">{row.amountFormatted}</span>
      </span>
    </div>
  );
}

const HISTORY_FILTERS: Array<{ key: "all" | HistoryRow["source"]; label: string }> = [
  { key: "all", label: "All" },
  { key: "trade", label: "P2P" },
  { key: "auction", label: "Auctions" },
  { key: "tradein_cash", label: "Trade-in cash" },
  { key: "tradein_credit", label: "Trade-in credit" },
  { key: "quote_cash", label: "Quote cash" },
  { key: "quote_credit", label: "Quote credit" },
];

function EarningsHistorySection({
  history,
  loading,
  filter,
  onFilterChange,
}: {
  history: HistoryPayload | null;
  loading: boolean;
  filter: "all" | HistoryRow["source"];
  onFilterChange: (f: "all" | HistoryRow["source"]) => void;
}) {
  if (loading) {
    return (
      <div className="mt-6 bg-neutral-900 rounded-xl p-5">
        <p className="text-sm text-neutral-500">Loading earnings history…</p>
      </div>
    );
  }
  if (!history || history.rows.length === 0) {
    return (
      <div className="mt-6 bg-neutral-900 rounded-xl p-5">
        <h2 className="text-white font-bold text-sm uppercase tracking-wide mb-1">Earnings history</h2>
        <p className="text-sm text-neutral-500">
          No completed payouts yet. Once a trade, auction, or trade-in pays out, it will appear here.
        </p>
      </div>
    );
  }
  const rows = filter === "all" ? history.rows : history.rows.filter((r) => r.source === filter);
  const year = new Date().getUTCFullYear();

  return (
    <div className="mt-6 bg-neutral-900 rounded-xl p-5">
      <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
        <h2 className="text-white font-bold text-sm uppercase tracking-wide">Earnings history</h2>
        <div className="flex items-baseline gap-4 text-xs">
          <span className="text-neutral-500">{year} YTD <span className="text-amber-400 font-bold ml-1">{history.totals.ytdFormatted}</span></span>
          <span className="text-neutral-500">All-time <span className="text-white font-bold ml-1">{history.totals.allTimeFormatted}</span></span>
        </div>
      </div>

      <div className="flex items-center gap-1 flex-wrap mb-4">
        {HISTORY_FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              onClick={() => onFilterChange(f.key)}
              className={`text-xs px-2.5 py-1 rounded-full transition ${
                active
                  ? "bg-amber-500 text-black font-bold"
                  : "bg-neutral-800 text-neutral-400 hover:text-white"
              }`}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-neutral-500">No matches in this filter.</p>
      ) : (
        <div className="divide-y divide-neutral-800">
          {rows.map((r) => (
            <div key={`${r.source}-${r.id}`} className="flex items-center justify-between py-2 gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-white truncate">{r.label}</span>
                  <span className="text-[10px] text-neutral-500 uppercase tracking-wide">{SOURCE_LABELS[r.source]}</span>
                </div>
                <div className="text-[11px] text-neutral-500 mt-0.5">
                  {new Date(r.paidAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  <span className="mx-1.5">·</span>
                  {METHOD_LABELS[r.method]}
                  {r.reference && (
                    <>
                      <span className="mx-1.5">·</span>
                      <code className="text-neutral-500">{r.reference.slice(0, 16)}{r.reference.length > 16 ? "…" : ""}</code>
                    </>
                  )}
                </div>
              </div>
              <span className="text-sm font-mono text-white shrink-0">{r.amountFormatted}</span>
            </div>
          ))}
        </div>
      )}

      {history.truncated && (
        <p className="text-[11px] text-neutral-600 mt-3">
          Showing most recent {history.rows.length} of {history.totalRows} payouts.
        </p>
      )}
    </div>
  );
}
