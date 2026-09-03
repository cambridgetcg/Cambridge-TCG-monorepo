"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  SubscriptionStatusUnknown,
  loadPrismSubscriptionStatus,
  type PrismSubscriptionStatus,
} from "../../account/PrismSubscriptionAccount";

type ReturnLoad =
  | { readonly kind: "loading" }
  | { readonly kind: "error"; readonly message: string }
  | { readonly kind: "loaded"; readonly status: PrismSubscriptionStatus };

export default function CheckoutReturnStatus() {
  const [load, setLoad] = useState<ReturnLoad>({ kind: "loading" });

  async function refresh() {
    setLoad({ kind: "loading" });
    try {
      setLoad({ kind: "loaded", status: await loadPrismSubscriptionStatus() });
    } catch (reason) {
      setLoad({
        kind: "error",
        message:
          reason instanceof Error
            ? reason.message
            : "Owner status could not be verified.",
      });
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void loadPrismSubscriptionStatus(controller.signal)
      .then((status) => setLoad({ kind: "loaded", status }))
      .catch((reason: unknown) => {
        if (
          typeof reason === "object" &&
          reason !== null &&
          "name" in reason &&
          reason.name === "AbortError"
        ) {
          return;
        }
        setLoad({
          kind: "error",
          message:
            reason instanceof Error
              ? reason.message
              : "Owner status could not be verified.",
        });
      });
    return () => controller.abort();
  }, []);

  if (load.kind !== "loaded") {
    return (
      <div>
        <SubscriptionStatusUnknown
          kind={load.kind}
          onRetry={load.kind === "error" ? () => void refresh() : undefined}
        />
        {load.kind === "error" ? (
          <p role="alert" className="mt-4 text-sm text-danger">
            {load.message}
          </p>
        ) : null}
      </div>
    );
  }

  const allActive = load.status.plan === "all" && load.status.access.allowed;
  return (
    <section className="rounded-xl border border-border-strong bg-surface p-6 shadow-mat md:p-8">
      <p className="font-mono text-xs uppercase tracking-[0.18em] text-accent">
        Latest signed owner projection
      </p>
      <h2 className="mt-3 font-display text-3xl font-semibold">
        {allActive ? "All test access is active" : "All test access is not yet verified"}
      </h2>
      <p className="mt-4 max-w-3xl text-sm leading-6 text-ink-muted">
        {allActive
          ? "The owner status API now reports access backed by the server-side event and entitlement projection."
          : "The browser return did not grant access. Stripe may still be completing the test payment or its signed webhook may not have produced a valid entitlement projection."}
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => void refresh()}
          className="rounded-lg border border-border-strong px-5 py-3 text-sm font-semibold text-ink"
        >
          Check signed status again
        </button>
        <Link
          href="/prism-signals/account"
          className="rounded-lg bg-ink px-5 py-3 text-sm font-semibold text-page"
        >
          Open plan account
        </Link>
      </div>
    </section>
  );
}
