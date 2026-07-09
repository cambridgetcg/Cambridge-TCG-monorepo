"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Badge, Palettes, Money } from "@/lib/ui";

import { Audience } from "@/lib/ui";
interface ItemRow {
  name: string | null;
  card_number: string | null;
  quantity: number;
  quoted_cash_price: string | null;
  quoted_credit_price: string | null;
}

interface Submission {
  reference: string;
  status: string;
  payment_method: string;
  delivery_method: string;
  quoted_cash_total: string | null;
  quoted_credit_total: string | null;
  quote_expires_at: string | null;
  created_at: string;
}

interface TimelineStep {
  key: string;
  at: string;
  label: string;
}

export default function TradeInsPage() {
  const router = useRouter();
  const [submissions, setSubmissions] = useState<{ submission: Submission; items: ItemRow[]; timeline: TimelineStep[] }[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((data) => {
        if (!data?.user?.email) { router.push("/login"); return; }
        return fetch("/api/account/trade-ins").then((r) => r.json());
      })
      .then((data) => {
        if (data?.submissions) setSubmissions(data.submissions);
        setLoading(false);
      });
  }, [router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
      <Audience kind="consumer" />
        <p className="text-ink-faint">Loading...</p>
      </div>
    );
  }

  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold text-ink mb-8">My Trade-Ins</h1>

        {submissions.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-ink-faint mb-4">No trade-ins yet.</p>
            <Link
              href="/trade-in"
              className="px-6 py-3 bg-ink text-page font-semibold rounded-lg hover:opacity-90 transition inline-block"
            >
              Browse Buylist
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {submissions.map(({ submission: s, items, timeline }) => {
              // The total in the customer's chosen payment method. Null until
              // staff have priced the submission — keep that absence distinct
              // from a real number instead of collapsing it to 0.
              const quotedTotal = s.payment_method === "cash" ? s.quoted_cash_total : s.quoted_credit_total;
              return (
              <div key={s.reference} className="bg-surface rounded-lg overflow-hidden">
                <button
                  onClick={() => setExpanded(expanded === s.reference ? null : s.reference)}
                  className="w-full px-4 py-4 flex items-center gap-4 text-left hover:bg-surface-subtle transition"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-sm font-mono font-bold text-accent">{s.reference}</span>
                      <Badge status={s.status} palette={Palettes.TradeInStatusPalette} />
                    </div>
                    <p className="text-xs text-ink-faint mt-1">
                      {s.payment_method === "cash" ? "Cash" : "Credit"} · {s.delivery_method === "mail" ? "Mail-in" : "In-store"} ·{" "}
                      {new Date(s.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    {/* Before a quote exists this is the customer's most anxious
                        moment — "£0.00" reads as a zero offer. Say what's true:
                        we haven't quoted yet. */}
                    {quotedTotal == null ? (
                      <p className="text-sm font-medium text-ink-faint">Awaiting quote</p>
                    ) : (
                      <p className="text-sm font-bold text-ink">
                        <Money value={parseFloat(quotedTotal)} />
                      </p>
                    )}
                  </div>
                  <span className="text-ink-faint text-sm">{expanded === s.reference ? "▲" : "▼"}</span>
                </button>

                {expanded === s.reference && (
                  <div className="px-4 pb-4 border-t border-border-subtle">
                    {/* Lifecycle timeline — derived from per-status timestamps
                        on the submission row. Rendered as a left-to-right
                        stepper so the customer sees real progression rather
                        than just "current status". */}
                    {timeline.length > 0 && (
                      <div className="mt-3 mb-4">
                        <div className="flex items-center gap-1 overflow-x-auto pb-2">
                          {timeline.map((step, i) => (
                            <div key={step.key} className="flex items-center gap-1 shrink-0">
                              <div className="flex flex-col items-center">
                                <div className={`w-3 h-3 rounded-full ${i === timeline.length - 1 ? "bg-ink" : "bg-ok"}`} />
                                <span className="text-[10px] text-ink-muted mt-1 whitespace-nowrap">{step.label}</span>
                                <span className="text-[9px] text-ink-faint">
                                  {new Date(step.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                                </span>
                              </div>
                              {i < timeline.length - 1 && <div className="w-8 h-px bg-ok/40 mb-3" />}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {s.quote_expires_at && s.status === "quoted" && (
                      <div className="bg-accent-wash border border-accent/30 rounded-lg p-3 mb-3 flex items-center justify-between gap-3">
                        <p className="text-xs text-accent">
                          Quote valid until {new Date(s.quote_expires_at).toLocaleString("en-GB")}
                        </p>
                        <Link
                          href={`/trade-in/confirm/${s.reference}`}
                          className="text-xs font-semibold text-page bg-ink px-3 py-1.5 rounded-md hover:opacity-90 transition shrink-0"
                        >
                          Accept / decline
                        </Link>
                      </div>
                    )}
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm min-w-[320px]">
                        <thead>
                          <tr className="text-ink-faint text-xs uppercase tracking-wide">
                            <th className="text-left py-2">Card</th>
                            <th className="text-center py-2 w-12">Qty</th>
                            <th className="text-right py-2 w-20">
                              {s.payment_method === "cash" ? "Cash" : "Credit"}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((item, idx) => (
                            <tr key={idx} className="border-t border-border-subtle">
                              <td className="py-2 text-ink">
                                {item.name}
                                <span className="text-ink-faint ml-2 text-xs hidden sm:inline">{item.card_number}</span>
                              </td>
                              <td className="py-2 text-center text-ink-muted">{item.quantity}</td>
                              <td className="py-2 text-right text-ink-muted whitespace-nowrap">
                                {/* Same honesty as the headline total: a line
                                    without a quote shows "—", not £0.00. */}
                                {(s.payment_method === "cash" ? item.quoted_cash_price : item.quoted_credit_price) == null ? (
                                  <span className="text-ink-faint">—</span>
                                ) : (
                                  <Money value={
                                    parseFloat(
                                      (s.payment_method === "cash" ? item.quoted_cash_price : item.quoted_credit_price) as string
                                    ) * item.quantity
                                  } />
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
