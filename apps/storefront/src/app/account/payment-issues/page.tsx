"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { Audience } from "@/lib/ui";
interface FailedPayment {
  amount_gbp: string;
  currency: string;
  failure_code: string | null;
  failure_message: string | null;
  attempt_count: number;
  first_attempt_at: string;
  last_attempt_at: string;
  order_id: number | null;
}

const CODE_COPY: Record<string, string> = {
  card_declined:        "Card was declined by your bank",
  insufficient_funds:   "Insufficient funds",
  expired_card:         "Card expired",
  incorrect_cvc:        "Incorrect security code",
  processing_error:     "Bank's payment processor had an error",
  authentication_required: "Bank required additional verification (3D Secure)",
};

export default function AccountPaymentIssuesPage() {
  const [failed, setFailed] = useState<FailedPayment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/account/payment-issues")
      .then((r) => r.json())
      .then((d) => setFailed(d?.failed ?? []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <Audience kind="consumer" />
      <h1 className="text-2xl font-bold text-ink mb-2">Payment Issues</h1>
      <p className="text-sm text-ink-muted mb-6">
        Stripe payment attempts that didn&apos;t go through. Most resolve by
        trying a different card or contacting your bank. Repeated failures
        in a short window may temporarily restrict trading; see{" "}
        <Link href="/account/standing" className="text-accent underline">
          Account Standing
        </Link>
        .
      </p>

      {loading ? (
        <p className="text-ink-faint">Loading…</p>
      ) : failed.length === 0 ? (
        <div className="bg-ok/5 border border-ok/30 rounded-lg p-6 text-center">
          <p className="text-ok font-bold mb-1">No payment issues ✓</p>
          <p className="text-xs text-ink-faint">
            All your payments have succeeded on first attempt.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {failed.map((f, i) => (
            <div key={i} className="rounded-lg border border-accent/30 bg-accent-wash p-4">
              <div className="flex items-baseline justify-between flex-wrap gap-2 mb-2">
                <h3 className="font-bold text-accent">
                  {f.failure_code ? (CODE_COPY[f.failure_code] ?? f.failure_code.replace(/_/g, " ")) : "Payment failed"}
                </h3>
                <span className="text-xs opacity-70">
                  {new Date(f.last_attempt_at).toLocaleDateString("en-GB", {
                    day: "numeric", month: "long", year: "numeric",
                  })}
                </span>
              </div>
              <p className="text-2xl font-bold mb-2">£{parseFloat(f.amount_gbp).toFixed(2)}</p>
              {f.failure_message && (
                <p className="text-xs opacity-80 mb-1">{f.failure_message}</p>
              )}
              <p className="text-[11px] opacity-60">
                {f.attempt_count} attempt{f.attempt_count === 1 ? "" : "s"}
                {f.order_id && <span className="ml-2">· Order #{f.order_id}</span>}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
