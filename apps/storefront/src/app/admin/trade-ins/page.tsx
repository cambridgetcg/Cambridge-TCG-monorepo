"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { formatPrice } from "@/lib/format";
import AdminShell from "@/components/admin/AdminShell";

import { Audience } from "@/lib/ui";
interface ItemRow {
  id: number;
  sku: string;
  game?: string | null;
  card_number: string | null;
  name: string | null;
  set_code: string | null;
  quantity: number;
  quoted_cash_price: string | null;
  quoted_credit_price: string | null;
  admin_price?: string | null;
  admin_condition?: string | null;
  admin_notes?: string | null;
  rejected?: boolean;
  payout_type?: string | null;
}

interface SubmissionRow {
  reference: string;
  status: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  payment_method: string;
  delivery_method: string;
  quoted_cash_total: string | null;
  quoted_credit_total: string | null;
  notes: string | null;
  quote_expires_at: string | null;
  created_at: string;
  updated_at?: string;
  admin_message?: string | null;
  payout_type?: string | null;
  cash_amount?: string | null;
  credit_amount?: string | null;
  mint_bonus_applied?: boolean;
  mint_bonus_amount?: string | null;
  final_total?: string | null;
  // Per-status timestamps (0047 migration) — used for the timeline
  received_at?: string | null;
  grading_at?: string | null;
  approved_at?: string | null;
  paid_at?: string | null;
  // Payout completion state (0044 + 0045 migrations)
  credit_issued_at?: string | null;
  cash_paid_at?: string | null;
  stripe_transfer_id?: string | null;
  tracking_number?: string | null;
}

interface Submission {
  submission: SubmissionRow;
  items: ItemRow[];
}

// Per-item editing state
interface ItemEditState {
  adminPrice: string;
  adminCondition: string;
  rejected: boolean;
  adminNotes: string;
  payoutType: string; // "" means use submission-level
}

// Quote form state
interface QuoteFormState {
  items: Record<number, ItemEditState>;
  payoutType: "cash" | "credit" | "mixed";
  cashAmount: string;
  creditAmount: string;
  mintBonusApplied: boolean;
  mintBonusAmount: string;
  adminMessage: string;
}

const STATUS_COLORS: Record<string, string> = {
  submitted: "bg-accent/20 text-accent-strong",
  quoted: "bg-blue-500/20 text-blue-400",
  accepted: "bg-emerald-500/20 text-secondary",
  declined: "bg-danger/20 text-red-400",
  expired: "bg-neutral-500/20 text-ink-muted",
  received: "bg-blue-500/20 text-blue-400",
  grading: "bg-purple-500/20 text-purple-400",
  approved: "bg-emerald-500/20 text-secondary",
  paid: "bg-green-500/20 text-green-400",
  rejected: "bg-danger/20 text-red-400",
  cancelled: "bg-neutral-500/20 text-ink-muted",
};

// Valid admin-triggered transitions per status. 'quoted' / 'accepted' /
// 'declined' / 'expired' are customer- or sweep-driven and don't appear
// here — admins only move cards through the physical fulfilment chain.
// Each transition is also gated server-side in /api/admin/submissions.
const TRANSITIONS: Record<string, string[]> = {
  submitted: [],                                     // quote form handles this
  quoted:    ["cancelled"],                          // cancel before customer responds
  accepted:  ["received", "cancelled"],              // cards arrive → received
  received:  ["grading", "cancelled"],               // start inspection
  grading:   ["approved", "rejected"],               // decide outcome
  approved:  ["paid", "rejected"],                   // pay out
  paid:      [],                                     // terminal
  declined:  [],                                     // customer said no
  expired:   [],                                     // quote timed out
  rejected:  [],                                     // terminal
  cancelled: [],                                     // terminal
};

// Visual timeline order — customer-visible stages after quote acceptance.
// Renders a stepper inside the expanded row; filled when the matching
// timestamp column is non-null.
const TIMELINE: Array<{ key: string; label: string; tsField: keyof SubmissionRow }> = [
  { key: "received", label: "Received", tsField: "received_at" },
  { key: "grading",  label: "Grading",  tsField: "grading_at" },
  { key: "approved", label: "Approved", tsField: "approved_at" },
  { key: "paid",     label: "Paid",     tsField: "paid_at" },
];

const CONDITIONS = ["NM", "LP", "MP", "HP", "MINT"];

// Industry-rough multipliers applied to the card's original quoted cash
// price when the grader downgrades condition. Pure UX hint — admin can
// override. Based on TCGPlayer/ebay condition guidance.
const CONDITION_MULTIPLIER: Record<string, number> = {
  MINT: 1.10,
  NM:   1.00,
  LP:   0.85,
  MP:   0.65,
  HP:   0.45,
};

// Trade-in queue tabs — grouped by what the admin actually needs to do.
type QueueKey = "needs_quote" | "awaiting_response" | "in_flight" | "ready_to_pay" | "history" | "all";
const QUEUES: Array<{ key: QueueKey; label: string; statuses: string[] | "all" }> = [
  { key: "needs_quote",       label: "Needs Quote",       statuses: ["submitted"] },
  { key: "awaiting_response", label: "Awaiting Response", statuses: ["quoted"] },
  { key: "in_flight",         label: "In Flight",         statuses: ["accepted", "received", "grading"] },
  { key: "ready_to_pay",      label: "Ready to Pay",      statuses: ["approved"] },
  { key: "history",           label: "History",           statuses: ["paid", "declined", "expired", "rejected", "cancelled"] },
  { key: "all",               label: "All",               statuses: "all" },
];

const INPUT_CLS =
  "w-full px-3 py-2 bg-surface-elevated border border-border-strong rounded-lg text-ink placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-accent/50 text-sm";

function useCountdown(expiresAt: string | null) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!expiresAt) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  if (!expiresAt || now === 0) return null;
  const diff = new Date(expiresAt).getTime() - now;
  if (diff <= 0) return "Expired";
  const hours = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  if (hours > 0) return `${hours}h ${mins}m remaining`;
  return `${mins}m ${secs}s remaining`;
}

function QuotationForm({
  submission,
  items,
  onQuoteSent,
}: {
  submission: SubmissionRow;
  items: ItemRow[];
  onQuoteSent: () => void;
}) {
  const [form, setForm] = useState<QuoteFormState>(() => {
    const itemStates: Record<number, ItemEditState> = {};
    for (const item of items) {
      const defaultPrice =
        submission.payment_method === "cash"
          ? item.quoted_cash_price || "0"
          : item.quoted_credit_price || "0";
      itemStates[item.id] = {
        adminPrice: defaultPrice,
        adminCondition: "NM",
        rejected: false,
        adminNotes: "",
        payoutType: "",
      };
    }
    return {
      items: itemStates,
      payoutType: submission.payment_method === "cash" ? "cash" : "credit",
      cashAmount: "",
      creditAmount: "",
      mintBonusApplied: false,
      mintBonusAmount: "0",
      adminMessage: "",
    };
  });

  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const updateItem = (id: number, patch: Partial<ItemEditState>) => {
    setForm((prev) => ({
      ...prev,
      items: { ...prev.items, [id]: { ...prev.items[id], ...patch } },
    }));
  };

  // Calculate totals from non-rejected items
  const itemsTotal = useMemo(() => {
    return items.reduce((sum, item) => {
      const state = form.items[item.id];
      if (!state || state.rejected) return sum;
      return sum + parseFloat(state.adminPrice || "0") * item.quantity;
    }, 0);
  }, [items, form.items]);

  const mintBonus = form.mintBonusApplied ? parseFloat(form.mintBonusAmount || "0") : 0;
  const finalTotal = itemsTotal + mintBonus;

  const hasMintItems = useMemo(() => {
    return items.some((item) => {
      const state = form.items[item.id];
      return state && !state.rejected && state.adminCondition === "MINT";
    });
  }, [items, form.items]);

  // Auto-calculate cash/credit when not mixed
  const effectiveCash = form.payoutType === "cash" ? finalTotal : form.payoutType === "mixed" ? parseFloat(form.cashAmount || "0") : 0;
  const effectiveCredit = form.payoutType === "credit" ? finalTotal : form.payoutType === "mixed" ? parseFloat(form.creditAmount || "0") : 0;

  async function handleSendQuote() {
    setError("");
    setSending(true);
    try {
      const res = await fetch("/api/tradein/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reference: submission.reference,
          items: items.map((item) => {
            const state = form.items[item.id];
            return {
              id: item.id,
              adminPrice: parseFloat(state.adminPrice || "0"),
              adminCondition: state.adminCondition,
              adminNotes: state.adminNotes || undefined,
              rejected: state.rejected,
              payoutType: state.payoutType || undefined,
            };
          }),
          payoutType: form.payoutType,
          cashAmount: effectiveCash,
          creditAmount: effectiveCredit,
          adminMessage: form.adminMessage || undefined,
          mintBonusApplied: form.mintBonusApplied,
          mintBonusAmount: mintBonus,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to send quotation.");
        setSending(false);
        return;
      }
      onQuoteSent();
    } catch {
      setError("Network error. Please try again.");
      setSending(false);
    }
  }

  return (
    <div className="space-y-5 mt-4">
      <Audience kind="operator" />
      {/* Per-item pricing */}
      <div>
        <h4 className="text-sm font-bold text-accent-strong mb-3">Item Pricing</h4>
        <div className="space-y-3">
          {items.map((item) => {
            const state = form.items[item.id];
            if (!state) return null;
            const origCash = parseFloat(item.quoted_cash_price || "0");
            const origCredit = parseFloat(item.quoted_credit_price || "0");
            // Suggest a price based on the condition multiplier applied
            // to the original NM quote. "Apply" button only appears when
            // the current adminPrice differs from the suggestion.
            const origForPayout = submission.payment_method === "cash" ? origCash : origCredit;
            const mult = CONDITION_MULTIPLIER[state.adminCondition] ?? 1;
            const suggested = origForPayout * mult;
            const currentPrice = parseFloat(state.adminPrice || "0");
            const suggestOff = Math.abs(currentPrice - suggested) > 0.005;
            return (
              <div
                key={item.id}
                className={`rounded-lg border p-3 transition ${
                  state.rejected
                    ? "border-danger/30 bg-danger/5 opacity-60"
                    : "border-border-strong bg-surface-elevated/50"
                }`}
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink truncate">{item.name}</p>
                    <p className="text-xs text-ink-faint">
                      {item.card_number}{item.game ? ` (${item.game})` : ""} &middot; Qty: {item.quantity} &middot; Original: {formatPrice(origCash)} cash / {formatPrice(origCredit)} credit
                    </p>
                  </div>
                  <label className="flex items-center gap-1.5 shrink-0 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={state.rejected}
                      onChange={(e) => updateItem(item.id, { rejected: e.target.checked })}
                      className="w-4 h-4 accent-red-500"
                    />
                    <span className="text-xs text-red-400 font-medium">Reject</span>
                  </label>
                </div>

                {!state.rejected && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div>
                      <label className="text-[11px] text-ink-faint block mb-1 flex items-center justify-between">
                        <span>Admin Price</span>
                        {suggestOff && (
                          <button
                            type="button"
                            onClick={() => updateItem(item.id, { adminPrice: suggested.toFixed(2) })}
                            className="text-[10px] text-accent-strong hover:text-accent-strong"
                            title={`${state.adminCondition} ×${mult.toFixed(2)} of original`}
                          >
                            → {formatPrice(suggested)}
                          </button>
                        )}
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={state.adminPrice}
                        onChange={(e) => updateItem(item.id, { adminPrice: e.target.value })}
                        className={INPUT_CLS}
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-ink-faint block mb-1">Condition</label>
                      <select
                        value={state.adminCondition}
                        onChange={(e) => updateItem(item.id, { adminCondition: e.target.value })}
                        className={INPUT_CLS}
                      >
                        {CONDITIONS.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] text-ink-faint block mb-1">Payout Override</label>
                      <select
                        value={state.payoutType}
                        onChange={(e) => updateItem(item.id, { payoutType: e.target.value })}
                        className={INPUT_CLS}
                      >
                        <option value="">Default</option>
                        <option value="cash">Cash</option>
                        <option value="credit">Credit</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] text-ink-faint block mb-1">Notes</label>
                      <input
                        type="text"
                        placeholder="Optional..."
                        value={state.adminNotes}
                        onChange={(e) => updateItem(item.id, { adminNotes: e.target.value })}
                        className={INPUT_CLS}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Quotation summary */}
      <div className="bg-surface-elevated/50 border border-border-strong rounded-xl p-4 space-y-4">
        <h4 className="text-sm font-bold text-accent-strong">Quotation Summary</h4>

        {/* Payout type selector */}
        <div>
          <label className="text-[11px] text-ink-faint block mb-2">Payout Type</label>
          <div className="flex flex-col sm:flex-row gap-3">
            {(["cash", "credit", "mixed"] as const).map((pt) => (
              <label
                key={pt}
                className={`flex-1 cursor-pointer rounded-lg border-2 p-3 text-center transition ${
                  form.payoutType === pt
                    ? "border-accent bg-accent/10"
                    : "border-border-strong hover:border-neutral-600"
                }`}
              >
                <input
                  type="radio"
                  name={`payout-${submission.reference}`}
                  value={pt}
                  checked={form.payoutType === pt}
                  onChange={() => setForm((prev) => ({ ...prev, payoutType: pt }))}
                  className="sr-only"
                />
                <p className="text-sm font-bold text-ink capitalize">{pt}</p>
                {pt === "cash" && <p className="text-lg font-bold text-accent-strong mt-1">{formatPrice(finalTotal)}</p>}
                {pt === "credit" && <p className="text-lg font-bold text-accent-strong mt-1">{formatPrice(finalTotal)}</p>}
                {pt === "mixed" && <p className="text-xs text-ink-muted mt-1">Split cash + credit</p>}
              </label>
            ))}
          </div>
        </div>

        {/* Mixed amounts */}
        {form.payoutType === "mixed" && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-ink-faint block mb-1">Cash Amount</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.cashAmount}
                onChange={(e) => setForm((prev) => ({ ...prev, cashAmount: e.target.value }))}
                className={INPUT_CLS}
              />
            </div>
            <div>
              <label className="text-[11px] text-ink-faint block mb-1">Credit Amount</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.creditAmount}
                onChange={(e) => setForm((prev) => ({ ...prev, creditAmount: e.target.value }))}
                className={INPUT_CLS}
              />
            </div>
          </div>
        )}

        {/* MINT bonus */}
        {hasMintItems && (
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.mintBonusApplied}
                onChange={(e) => setForm((prev) => ({ ...prev, mintBonusApplied: e.target.checked }))}
                className="w-4 h-4 accent-amber-500"
              />
              <span className="text-sm text-ink-muted">MINT Bonus</span>
            </label>
            {form.mintBonusApplied && (
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.mintBonusAmount}
                onChange={(e) => setForm((prev) => ({ ...prev, mintBonusAmount: e.target.value }))}
                className={INPUT_CLS + " !w-28"}
              />
            )}
          </div>
        )}

        {/* Admin message */}
        <div>
          <label className="text-[11px] text-ink-faint block mb-1">Message to Customer</label>
          <textarea
            placeholder="Great condition cards! / One card was LP so we adjusted..."
            value={form.adminMessage}
            onChange={(e) => setForm((prev) => ({ ...prev, adminMessage: e.target.value }))}
            rows={2}
            className={INPUT_CLS + " resize-none"}
          />
        </div>

        {/* Total breakdown */}
        <div className="border-t border-border-strong pt-3 space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-ink-muted">Items total ({items.filter((i) => !form.items[i.id]?.rejected).length} cards)</span>
            <span className="text-ink">{formatPrice(itemsTotal)}</span>
          </div>
          {form.mintBonusApplied && mintBonus > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-ink-muted">MINT bonus</span>
              <span className="text-secondary">+{formatPrice(mintBonus)}</span>
            </div>
          )}
          <div className="flex justify-between text-lg font-bold pt-1">
            <span className="text-ink">Final Total</span>
            <span className="text-accent-strong">{formatPrice(finalTotal)}</span>
          </div>
          {form.payoutType === "mixed" && (
            <p className="text-xs text-ink-faint">
              Cash: {formatPrice(parseFloat(form.cashAmount || "0"))} + Credit: {formatPrice(parseFloat(form.creditAmount || "0"))}
            </p>
          )}
        </div>

        {error && (
          <p className="text-sm text-red-400 bg-danger/10 rounded-lg px-3 py-2">{error}</p>
        )}

        <button
          onClick={handleSendQuote}
          disabled={sending || finalTotal <= 0}
          className="w-full py-3 bg-accent text-black font-bold rounded-lg hover:bg-accent-strong transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {sending ? "Sending..." : "Send Quotation"}
        </button>
      </div>
    </div>
  );
}

function QuotedView({ submission, items }: { submission: SubmissionRow; items: ItemRow[] }) {
  const countdown = useCountdown(submission.quote_expires_at);
  return (
    <div className="mt-4 space-y-4">
      <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-bold text-blue-400">Quotation Sent</h4>
          {countdown && (
            <span className="text-xs text-blue-300 font-mono">{countdown}</span>
          )}
        </div>
        <p className="text-sm text-ink-muted">Waiting for customer response.</p>
        {submission.admin_message && (
          <p className="text-xs text-ink-muted mt-2 italic">&quot;{submission.admin_message}&quot;</p>
        )}
      </div>

      {/* Quoted prices alongside originals */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[500px]">
          <thead>
            <tr className="text-ink-faint text-xs uppercase tracking-wide">
              <th className="text-left py-2">Card</th>
              <th className="text-center py-2 w-12">Qty</th>
              <th className="text-right py-2 w-24">Original</th>
              <th className="text-right py-2 w-24">Quoted</th>
              <th className="text-center py-2 w-16">Cond.</th>
              <th className="text-center py-2 w-16">Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const orig =
                submission.payment_method === "cash"
                  ? parseFloat(item.quoted_cash_price || "0")
                  : parseFloat(item.quoted_credit_price || "0");
              const quoted = item.admin_price != null ? parseFloat(item.admin_price) : orig;
              const changed = quoted !== orig;
              return (
                <tr key={item.id} className={`border-t border-border-subtle ${item.rejected ? "opacity-40 line-through" : ""}`}>
                  <td className="py-2 text-ink">
                    {item.name}
                    <span className="text-ink-faint ml-2 text-xs hidden sm:inline">{item.card_number}{item.game ? ` (${item.game})` : ""}</span>
                  </td>
                  <td className="py-2 text-center text-ink-muted">{item.quantity}</td>
                  <td className="py-2 text-right text-ink-faint whitespace-nowrap">
                    {formatPrice(orig * item.quantity)}
                  </td>
                  <td className={`py-2 text-right whitespace-nowrap font-medium ${changed ? "text-accent-strong" : "text-ink-muted"}`}>
                    {item.rejected ? "—" : formatPrice(quoted * item.quantity)}
                  </td>
                  <td className="py-2 text-center text-xs text-ink-muted">
                    {item.admin_condition || "NM"}
                  </td>
                  <td className="py-2 text-center">
                    {item.rejected ? (
                      <span className="text-xs text-red-400">Rejected</span>
                    ) : (
                      <span className="text-xs text-secondary">Included</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Totals */}
      <div className="bg-surface-elevated/50 border border-border-strong rounded-lg p-3 space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-ink-muted">Payout type</span>
          <span className="text-ink capitalize">{submission.payout_type || submission.payment_method}</span>
        </div>
        {submission.cash_amount && parseFloat(submission.cash_amount) > 0 && (
          <div className="flex justify-between">
            <span className="text-ink-muted">Cash</span>
            <span className="text-ink">{formatPrice(parseFloat(submission.cash_amount))}</span>
          </div>
        )}
        {submission.credit_amount && parseFloat(submission.credit_amount) > 0 && (
          <div className="flex justify-between">
            <span className="text-ink-muted">Credit</span>
            <span className="text-ink">{formatPrice(parseFloat(submission.credit_amount))}</span>
          </div>
        )}
        {submission.mint_bonus_applied && submission.mint_bonus_amount && (
          <div className="flex justify-between">
            <span className="text-ink-muted">MINT bonus</span>
            <span className="text-secondary">+{formatPrice(parseFloat(submission.mint_bonus_amount))}</span>
          </div>
        )}
        <div className="flex justify-between font-bold pt-1 border-t border-border-strong">
          <span className="text-ink">Final Total</span>
          <span className="text-accent-strong">{formatPrice(parseFloat(submission.final_total || submission.quoted_cash_total || submission.quoted_credit_total || "0"))}</span>
        </div>
      </div>
    </div>
  );
}

function AcceptedView({ submission }: { submission: SubmissionRow }) {
  return (
    <div className="mt-4">
      <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4">
        <h4 className="text-sm font-bold text-secondary mb-1">Customer Accepted</h4>
        <p className="text-sm text-ink-muted">
          The customer has accepted the quotation.
          {submission.delivery_method === "mail"
            ? " Waiting for cards to arrive by post."
            : " Customer will drop off cards in-store."}
        </p>
        <div className="mt-3 text-xs text-ink-muted space-y-0.5">
          <p>Payout: <span className="text-ink capitalize">{submission.payout_type || submission.payment_method}</span></p>
          <p>Total: <span className="text-accent-strong font-bold">{formatPrice(parseFloat(submission.final_total || submission.quoted_cash_total || submission.quoted_credit_total || "0"))}</span></p>
        </div>
      </div>
    </div>
  );
}

function DeclinedView() {
  return (
    <div className="mt-4">
      <div className="bg-danger/10 border border-danger/30 rounded-xl p-4">
        <h4 className="text-sm font-bold text-red-400 mb-1">Customer Declined</h4>
        <p className="text-sm text-ink-muted">The customer has declined this quotation.</p>
      </div>
    </div>
  );
}

function ExpiredView() {
  return (
    <div className="mt-4">
      <div className="bg-neutral-500/10 border border-neutral-600 rounded-xl p-4">
        <h4 className="text-sm font-bold text-ink-muted mb-1">Quote Expired</h4>
        <p className="text-sm text-ink-muted">This quotation has expired without a response.</p>
      </div>
    </div>
  );
}

// Horizontal stepper for received → grading → approved → paid. A step
// is "done" when its timestamp column is set; "current" when it's the
// latest done step; future steps render dimmed.
function FulfilmentTimeline({ submission }: { submission: SubmissionRow }) {
  // Don't render before the customer accepts — no meaningful progress yet.
  if (!["accepted", "received", "grading", "approved", "paid"].includes(submission.status)) {
    return null;
  }
  return (
    <div className="mt-4 bg-surface/40 border border-border-subtle rounded-xl p-3">
      <div className="flex items-center gap-2 overflow-x-auto">
        {TIMELINE.map((step, i) => {
          const ts = submission[step.tsField] as string | null | undefined;
          const done = !!ts;
          const isCurrent = done && !TIMELINE.slice(i + 1).some((s) => submission[s.tsField]);
          return (
            <div key={step.key} className="flex items-center gap-2 flex-1 min-w-0">
              <div className={`flex flex-col items-center gap-1 min-w-0 ${done ? "text-ink" : "text-neutral-600"}`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ring-2 ${
                  done
                    ? isCurrent ? "bg-accent text-black ring-accent/30" : "bg-emerald-500 text-black ring-emerald-500/20"
                    : "bg-surface-elevated text-neutral-600 ring-neutral-700"
                }`}>
                  {done ? "✓" : i + 1}
                </div>
                <div className="text-[10px] whitespace-nowrap">{step.label}</div>
                {ts && (
                  <div className="text-[9px] text-ink-faint font-mono whitespace-nowrap">
                    {new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </div>
                )}
              </div>
              {i < TIMELINE.length - 1 && (
                <div className={`h-px flex-1 ${done ? "bg-emerald-500/40" : "bg-surface-elevated"}`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Payout completion badges — tells the admin whether the actual money
// has moved. These are gated server-side on status='paid'; showing them
// for earlier statuses is harmless because the fields will be null.
function PayoutBadges({ submission }: { submission: SubmissionRow }) {
  const creditIssued = !!submission.credit_issued_at;
  const cashPaid = !!submission.cash_paid_at;
  const hasCredit = parseFloat(submission.credit_amount ?? submission.quoted_credit_total ?? "0") > 0;
  const hasCash = parseFloat(submission.cash_amount ?? submission.quoted_cash_total ?? "0") > 0;
  if (!hasCredit && !hasCash) return null;

  return (
    <div className="mt-3 flex items-center gap-2 flex-wrap text-xs">
      {hasCredit && (
        <span className={`px-2 py-1 rounded-full border ${
          creditIssued
            ? "bg-emerald-500/10 border-emerald-500/30 text-secondary"
            : "bg-surface-elevated border-border-strong text-ink-faint"
        }`}>
          Credit: {creditIssued
            ? `issued ${new Date(submission.credit_issued_at!).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
            : "pending"}
        </span>
      )}
      {hasCash && (
        <span className={`px-2 py-1 rounded-full border ${
          cashPaid
            ? "bg-emerald-500/10 border-emerald-500/30 text-secondary"
            : "bg-surface-elevated border-border-strong text-ink-faint"
        }`}>
          Cash: {cashPaid
            ? submission.stripe_transfer_id
              ? `Stripe ${submission.stripe_transfer_id.slice(0, 10)}…`
              : `paid ${new Date(submission.cash_paid_at!).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
            : "pending"}
        </span>
      )}
    </div>
  );
}

export default function AdminTradeInsPage() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [queue, setQueue] = useState<QueueKey>("needs_quote");
  const [search, setSearch] = useState("");

  const fetchSubmissions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/submissions");
      if (res.ok) {
        const data = await res.json();
        setSubmissions(data.submissions || []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSubmissions(); }, [fetchSubmissions]);

  async function handleStatusChange(reference: string, newStatus: string) {
    setUpdating(reference);
    try {
      const res = await fetch("/api/admin/submissions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference, status: newStatus }),
      });
      if (res.ok) {
        // Server returns the full updated row including the new
        // per-status timestamp + any cash/credit issuance markers —
        // reflect them immediately so the timeline + payout badges
        // update without a round-trip refetch.
        const data = await res.json();
        const returned = data.submission as SubmissionRow | undefined;
        setSubmissions((prev) =>
          prev.map((s) =>
            s.submission.reference === reference
              ? { ...s, submission: { ...s.submission, ...(returned ?? { status: newStatus }) } }
              : s
          )
        );
      }
    } catch {
      // ignore
    } finally {
      setUpdating(null);
    }
  }

  // ── Derived ──
  const countsByStatus = useMemo(() => {
    const c: Record<string, number> = {};
    for (const { submission } of submissions) c[submission.status] = (c[submission.status] ?? 0) + 1;
    return c;
  }, [submissions]);

  const queueCount = useCallback((q: (typeof QUEUES)[number]): number => {
    if (q.statuses === "all") return submissions.length;
    return q.statuses.reduce((sum, st) => sum + (countsByStatus[st] ?? 0), 0);
  }, [submissions.length, countsByStatus]);

  const filtered = useMemo(() => {
    const q = QUEUES.find((x) => x.key === queue)!;
    const term = search.trim().toLowerCase();
    return submissions.filter(({ submission }) => {
      if (q.statuses !== "all" && !q.statuses.includes(submission.status)) return false;
      if (!term) return true;
      return (
        submission.reference.toLowerCase().includes(term) ||
        submission.customer_name.toLowerCase().includes(term) ||
        submission.customer_email.toLowerCase().includes(term)
      );
    });
  }, [submissions, queue, search]);

  const totalPayoutOwed = useMemo(() => {
    return submissions
      .filter((s) => s.submission.status === "approved")
      .reduce((sum, s) => sum + parseFloat(s.submission.final_total || s.submission.quoted_cash_total || s.submission.quoted_credit_total || "0"), 0);
  }, [submissions]);

  return (
    <AdminShell
      title="Trade-In Submissions"
      authProbe="/api/admin/submissions"
      actions={
        <button
          onClick={fetchSubmissions}
          disabled={loading}
          className="px-4 py-2 bg-surface-elevated text-ink text-sm rounded-lg hover:bg-neutral-700 transition disabled:opacity-50"
        >
          {loading ? "Loading..." : "Refresh"}
        </button>
      }
    >
        {/* Headline stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-surface rounded-xl p-4">
            <p className="text-xs text-ink-faint uppercase tracking-wide">Needs Quote</p>
            <p className="text-2xl font-bold text-accent-strong mt-1">{countsByStatus["submitted"] ?? 0}</p>
          </div>
          <div className="bg-surface rounded-xl p-4">
            <p className="text-xs text-ink-faint uppercase tracking-wide">In Flight</p>
            <p className="text-2xl font-bold text-ink mt-1">
              {(countsByStatus["accepted"] ?? 0) + (countsByStatus["received"] ?? 0) + (countsByStatus["grading"] ?? 0)}
            </p>
          </div>
          <div className="bg-surface rounded-xl p-4">
            <p className="text-xs text-ink-faint uppercase tracking-wide">Ready to Pay</p>
            <p className={`text-2xl font-bold mt-1 ${(countsByStatus["approved"] ?? 0) > 0 ? "text-secondary" : "text-ink"}`}>
              {countsByStatus["approved"] ?? 0}
            </p>
          </div>
          <div className="bg-surface rounded-xl p-4">
            <p className="text-xs text-ink-faint uppercase tracking-wide">Payout Owed</p>
            <p className="text-2xl font-bold text-ink mt-1">{formatPrice(totalPayoutOwed)}</p>
          </div>
        </div>

        {/* Queue tabs */}
        <div className="flex items-center gap-1 mb-3 flex-wrap">
          {QUEUES.map((q) => {
            const n = queueCount(q);
            const active = queue === q.key;
            return (
              <button
                key={q.key}
                onClick={() => setQueue(q.key)}
                className={`text-xs px-3 py-1.5 rounded-full transition flex items-center gap-1.5 ${
                  active
                    ? "bg-accent text-black font-bold"
                    : "bg-surface text-ink-muted hover:text-ink border border-border-subtle"
                }`}
              >
                <span>{q.label}</span>
                <span className={active ? "opacity-70" : "text-neutral-600"}>{n}</span>
              </button>
            );
          })}
        </div>

        {/* Search */}
        <input
          type="search"
          placeholder="Search reference / customer / email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full mb-5 px-3 py-2 bg-surface border border-border-subtle rounded-lg text-sm text-ink placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-accent/50"
        />

        {/* Submissions */}
        {filtered.length === 0 && !loading && (
          <p className="text-ink-faint text-center py-12">
            {search ? "No matches for that search." : "No submissions in this queue."}
          </p>
        )}

        <div className="space-y-3">
          {filtered.map(({ submission: s, items }) => (
            <div key={s.reference} className="bg-surface rounded-xl overflow-hidden">
              {/* Row */}
              <button
                onClick={() => setExpanded(expanded === s.reference ? null : s.reference)}
                className="w-full px-4 py-4 flex items-center gap-4 text-left hover:bg-surface-elevated/50 transition"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-sm font-mono font-bold text-accent-strong">{s.reference}</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[s.status] || "bg-neutral-700 text-ink-muted"}`}>
                      {s.status}
                    </span>
                    <span className="text-xs text-ink-faint">
                      {s.payment_method === "cash" ? "Cash" : "Credit"} · {s.delivery_method === "mail" ? "Mail" : "In-store"}
                    </span>
                  </div>
                  <p className="text-sm text-ink-muted mt-1">{s.customer_name} — {s.customer_email}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-ink">
                    {formatPrice(parseFloat(s.payment_method === "cash" ? s.quoted_cash_total || "0" : s.quoted_credit_total || "0"))}
                  </p>
                  <p className="text-xs text-ink-faint">
                    {new Date(s.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                </div>
                <span className="text-neutral-600 text-sm">{expanded === s.reference ? "▲" : "▼"}</span>
              </button>

              {/* Expanded detail */}
              {expanded === s.reference && (
                <div className="px-4 pb-4 border-t border-border-subtle">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 mb-4 text-sm">
                    <div>
                      <span className="text-ink-faint">Phone</span>
                      <p className="text-ink">{s.customer_phone || "—"}</p>
                    </div>
                    <div>
                      <span className="text-ink-faint">Cash Total</span>
                      <p className="text-ink">{formatPrice(parseFloat(s.quoted_cash_total || "0"))}</p>
                    </div>
                    <div>
                      <span className="text-ink-faint">Credit Total</span>
                      <p className="text-ink">{formatPrice(parseFloat(s.quoted_credit_total || "0"))}</p>
                    </div>
                    <div>
                      <span className="text-ink-faint">Expires</span>
                      <p className="text-ink">
                        {s.quote_expires_at
                          ? new Date(s.quote_expires_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
                          : "—"}
                      </p>
                    </div>
                  </div>

                  {s.notes && (
                    <div className="mb-4">
                      <span className="text-xs text-ink-faint">Customer Notes</span>
                      <p className="text-sm text-ink-muted mt-1">{s.notes}</p>
                    </div>
                  )}

                  {/* Status-aware content */}
                  {s.status === "submitted" && (
                    <>
                      {/* Original items table */}
                      <div className="overflow-x-auto mb-2">
                        <table className="w-full text-sm min-w-[400px]">
                          <thead>
                            <tr className="text-ink-faint text-xs uppercase tracking-wide">
                              <th className="text-left py-2">Card</th>
                              <th className="text-center py-2 w-12">Qty</th>
                              <th className="text-right py-2 w-20">Cash</th>
                              <th className="text-right py-2 w-20">Credit</th>
                            </tr>
                          </thead>
                          <tbody>
                            {items.map((item) => (
                              <tr key={item.id} className="border-t border-border-subtle">
                                <td className="py-2 text-ink">
                                  {item.name}
                                  <span className="text-ink-faint ml-2 text-xs hidden sm:inline">{item.card_number}{item.game ? ` (${item.game})` : ""}</span>
                                </td>
                                <td className="py-2 text-center text-ink-muted">{item.quantity}</td>
                                <td className="py-2 text-right text-ink-muted whitespace-nowrap">
                                  {formatPrice(parseFloat(item.quoted_cash_price || "0") * item.quantity)}
                                </td>
                                <td className="py-2 text-right text-ink-muted whitespace-nowrap">
                                  {formatPrice(parseFloat(item.quoted_credit_price || "0") * item.quantity)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Quotation form */}
                      <QuotationForm
                        submission={s}
                        items={items}
                        onQuoteSent={fetchSubmissions}
                      />
                    </>
                  )}

                  {s.status === "quoted" && (
                    <QuotedView submission={s} items={items} />
                  )}

                  {s.status === "accepted" && (
                    <>
                      <QuotedView submission={s} items={items} />
                      <AcceptedView submission={s} />
                    </>
                  )}

                  {s.status === "declined" && (
                    <>
                      <QuotedView submission={s} items={items} />
                      <DeclinedView />
                    </>
                  )}

                  {s.status === "expired" && (
                    <>
                      <QuotedView submission={s} items={items} />
                      <ExpiredView />
                    </>
                  )}

                  {/* For other statuses (received, grading, approved, paid, etc.) show original items table */}
                  {!["submitted", "quoted", "accepted", "declined", "expired"].includes(s.status) && (
                    <div className="overflow-x-auto mb-4">
                      <table className="w-full text-sm min-w-[400px]">
                        <thead>
                          <tr className="text-ink-faint text-xs uppercase tracking-wide">
                            <th className="text-left py-2">Card</th>
                            <th className="text-center py-2 w-12">Qty</th>
                            <th className="text-right py-2 w-20">Cash</th>
                            <th className="text-right py-2 w-20">Credit</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((item) => (
                            <tr key={item.id} className="border-t border-border-subtle">
                              <td className="py-2 text-ink">
                                {item.name}
                                <span className="text-ink-faint ml-2 text-xs hidden sm:inline">{item.card_number}{item.game ? ` (${item.game})` : ""}</span>
                              </td>
                              <td className="py-2 text-center text-ink-muted">{item.quantity}</td>
                              <td className="py-2 text-right text-ink-muted whitespace-nowrap">
                                {formatPrice(parseFloat(item.quoted_cash_price || "0") * item.quantity)}
                              </td>
                              <td className="py-2 text-right text-ink-muted whitespace-nowrap">
                                {formatPrice(parseFloat(item.quoted_credit_price || "0") * item.quantity)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <FulfilmentTimeline submission={s} />
                  <PayoutBadges submission={s} />

                  {/* Valid status transitions only */}
                  {(TRANSITIONS[s.status] ?? []).length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap mt-4">
                      <span className="text-xs text-ink-faint">Advance to:</span>
                      {(TRANSITIONS[s.status] ?? []).map((st) => {
                        const isDanger = st === "rejected" || st === "cancelled";
                        const isPay = st === "paid";
                        const base = "text-xs px-3 py-1.5 rounded-lg font-medium transition";
                        const tone = isPay
                          ? "bg-emerald-500 hover:bg-emerald-400 text-black"
                          : isDanger
                            ? "bg-red-900/40 hover:bg-red-900/60 text-red-300 border border-red-800"
                            : "bg-accent hover:bg-accent-strong text-black";
                        return (
                          <button
                            key={st}
                            onClick={() => handleStatusChange(s.reference, st)}
                            disabled={updating === s.reference}
                            className={`${base} ${tone} disabled:opacity-50`}
                          >
                            {updating === s.reference ? "…" : `→ ${st}`}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
    </AdminShell>
  );
}
