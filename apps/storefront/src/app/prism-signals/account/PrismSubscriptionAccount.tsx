"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const STATUS_SCHEMA = "cambridgetcg.prism-subscription-status/1" as const;
const REDIRECT_SCHEMA = "cambridgetcg.prism-stripe-redirect/1" as const;
const CANONICAL_UTC =
  /^(?!0000-)[0-9]{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])T(?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]\.[0-9]{3}Z$/;

type PlainRecord = Record<string, unknown>;

export interface PrismSubscriptionStatus {
  readonly schema: typeof STATUS_SCHEMA;
  readonly sandbox: true;
  readonly plan: "free" | "all";
  readonly access: {
    readonly allowed: boolean;
    readonly reason: string;
    readonly active_until: string | null;
  };
  readonly subscription: null | {
    readonly status: string;
    readonly cancel_at_period_end: boolean;
    readonly current_period_end: string | null;
    readonly reconciliation: null | {
      readonly status: "required" | "resolved";
      readonly action: "cancel_subscription";
      readonly reason: "refund_before_grant" | "full_refund";
    };
  };
  readonly checkout: {
    readonly available: boolean;
    readonly reason: string;
  };
  readonly portal: {
    readonly available: boolean;
  };
}

type AccountLoad =
  | { readonly kind: "loading" }
  | { readonly kind: "error"; readonly message: string }
  | { readonly kind: "loaded"; readonly status: PrismSubscriptionStatus };

type RedirectKind = "checkout" | "portal";

function plainRecord(value: unknown, label: string): PlainRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Unexpected ${label} response.`);
  }
  return value as PlainRecord;
}

function exactKeys(
  value: PlainRecord,
  expected: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const canonical = [...expected].sort();
  if (
    actual.length !== canonical.length ||
    actual.some((key, index) => key !== canonical[index])
  ) {
    throw new Error(`Unexpected ${label} response.`);
  }
}

function boundedReason(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 160 ||
    !/^[a-z][a-z0-9_]*$/.test(value)
  ) {
    throw new Error(`Unexpected ${label} response.`);
  }
  return value;
}

function canonicalTimestamp(value: unknown, label: string): string {
  if (typeof value !== "string" || !CANONICAL_UTC.test(value)) {
    throw new Error(`Unexpected ${label} response.`);
  }
  return value;
}

/** Strict client boundary: unknown/changed server JSON never unlocks controls. */
export function parsePrismSubscriptionStatus(
  value: unknown,
): PrismSubscriptionStatus {
  const root = plainRecord(value, "subscription status");
  exactKeys(
    root,
    [
      "schema",
      "sandbox",
      "plan",
      "access",
      "subscription",
      "checkout",
      "portal",
    ],
    "subscription status",
  );
  if (
    root.schema !== STATUS_SCHEMA ||
    root.sandbox !== true ||
    (root.plan !== "free" && root.plan !== "all")
  ) {
    throw new Error("Unexpected subscription status response.");
  }

  const access = plainRecord(root.access, "subscription access");
  exactKeys(access, ["allowed", "reason", "active_until"], "subscription access");
  if (typeof access.allowed !== "boolean") {
    throw new Error("Unexpected subscription access response.");
  }
  const activeUntil =
    access.active_until === null
      ? null
      : canonicalTimestamp(access.active_until, "subscription access");

  let subscription: PrismSubscriptionStatus["subscription"] = null;
  if (root.subscription !== null) {
    const candidate = plainRecord(root.subscription, "subscription");
    exactKeys(
      candidate,
      [
        "status",
        "cancel_at_period_end",
        "current_period_end",
        "reconciliation",
      ],
      "subscription",
    );
    if (
      typeof candidate.status !== "string" ||
      !/^[a-z][a-z0-9_]{0,31}$/.test(candidate.status) ||
      typeof candidate.cancel_at_period_end !== "boolean"
    ) {
      throw new Error("Unexpected subscription response.");
    }
    let reconciliation: NonNullable<
      PrismSubscriptionStatus["subscription"]
    >["reconciliation"] = null;
    if (candidate.reconciliation !== null) {
      const value = plainRecord(
        candidate.reconciliation,
        "subscription reconciliation",
      );
      exactKeys(
        value,
        ["status", "action", "reason"],
        "subscription reconciliation",
      );
      if (
        (value.status !== "required" && value.status !== "resolved") ||
        value.action !== "cancel_subscription" ||
        (value.reason !== "refund_before_grant" &&
          value.reason !== "full_refund")
      ) {
        throw new Error("Unexpected subscription reconciliation response.");
      }
      reconciliation = Object.freeze({
        status: value.status,
        action: value.action,
        reason: value.reason,
      });
    }
    subscription = Object.freeze({
      status: candidate.status,
      cancel_at_period_end: candidate.cancel_at_period_end,
      current_period_end:
        candidate.current_period_end === null
          ? null
          : canonicalTimestamp(candidate.current_period_end, "subscription"),
      reconciliation,
    });
  }

  const checkout = plainRecord(root.checkout, "checkout status");
  exactKeys(checkout, ["available", "reason"], "checkout status");
  if (typeof checkout.available !== "boolean") {
    throw new Error("Unexpected checkout status response.");
  }

  const portal = plainRecord(root.portal, "portal status");
  exactKeys(portal, ["available"], "portal status");
  if (typeof portal.available !== "boolean") {
    throw new Error("Unexpected portal status response.");
  }

  return Object.freeze({
    schema: STATUS_SCHEMA,
    sandbox: true,
    plan: root.plan,
    access: Object.freeze({
      allowed: access.allowed,
      reason: boundedReason(access.reason, "subscription access"),
      active_until: activeUntil,
    }),
    subscription,
    checkout: Object.freeze({
      available: checkout.available,
      reason: boundedReason(checkout.reason, "checkout status"),
    }),
    portal: Object.freeze({ available: portal.available }),
  });
}

async function responseError(response: Response): Promise<string> {
  if (response.status === 401) {
    return "Your session ended. Sign in again before using subscription controls.";
  }
  if (response.status === 403) {
    try {
      const body = plainRecord(await response.json(), "error");
      const error = plainRecord(body.error, "error");
      if (error.code === "sandbox_invitation_required") {
        return "All sandbox Checkout is currently limited to accounts with an active operator invitation.";
      }
      if (error.code === "beta_interest_required") {
        return "Record an active PRISM beta-interest request before using an invited sandbox place.";
      }
    } catch {
      // Keep the local CSRF-safe fallback for any expanded or malformed body.
    }
    return "This request was not accepted as an eligible same-origin account action.";
  }
  if (response.status === 503) {
    return "The PRISM Stripe sandbox is unavailable right now. No subscription change was made.";
  }
  try {
    const body = plainRecord(await response.json(), "error");
    const error = plainRecord(body.error, "error");
    if (typeof error.message === "string" && error.message.length <= 240) {
      return error.message;
    }
  } catch {
    // Prefer the bounded local fallback to exposing parsing detail.
  }
  return "The request could not be completed. No subscription change was assumed.";
}

export async function loadPrismSubscriptionStatus(
  signal?: AbortSignal,
): Promise<PrismSubscriptionStatus> {
  const response = await fetch("/api/prism-signals/subscription", {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers: { Accept: "application/json" },
    signal,
  });
  if (!response.ok) throw new Error(await responseError(response));
  return parsePrismSubscriptionStatus(await response.json());
}

function parseStripeRedirect(value: unknown, expectedKind: RedirectKind): string {
  const root = plainRecord(value, "Stripe redirect");
  exactKeys(root, ["schema", "kind", "url"], "Stripe redirect");
  if (
    root.schema !== REDIRECT_SCHEMA ||
    root.kind !== expectedKind ||
    typeof root.url !== "string"
  ) {
    throw new Error("Unexpected Stripe redirect response.");
  }

  let url: URL;
  try {
    url = new URL(root.url);
  } catch {
    throw new Error("Unexpected Stripe redirect response.");
  }
  const expectedHost =
    expectedKind === "checkout" ? "checkout.stripe.com" : "billing.stripe.com";
  if (
    url.protocol !== "https:" ||
    url.hostname !== expectedHost ||
    url.port !== "" ||
    url.username !== "" ||
    url.password !== ""
  ) {
    throw new Error("Unexpected Stripe redirect response.");
  }
  return url.toString();
}

export async function requestPrismStripeRedirect(
  kind: RedirectKind,
): Promise<string> {
  const endpoint =
    kind === "checkout"
      ? "/api/prism-signals/stripe/checkout"
      : "/api/prism-signals/stripe/portal";
  const response = await fetch(endpoint, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  if (!response.ok) throw new Error(await responseError(response));
  return parseStripeRedirect(await response.json(), kind);
}

function readableDate(timestamp: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(timestamp));
}

export function SubscriptionStatusUnknown({
  kind,
  onRetry,
}: {
  kind: "loading" | "error";
  onRetry?: () => void;
}) {
  if (kind === "loading") {
    return (
      <div className="rounded-xl border border-border-subtle bg-surface p-6">
        <p className="font-semibold text-ink">Checking owner status…</p>
        <p className="mt-2 text-sm leading-6 text-ink-muted">
          No Free, All, payment, or access conclusion is shown until the
          owner-scoped status read succeeds.
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-danger bg-surface p-6">
      <p className="font-semibold text-danger">Subscription status not verified</p>
      <p className="mt-2 text-sm leading-6 text-ink-muted">
        Checkout and portal controls remain locked. This page will not infer
        Free, All, payment, cancellation, or access from a failed read.
      </p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 rounded-lg border border-border-strong px-4 py-2 text-sm font-semibold text-ink"
        >
          Retry owner status
        </button>
      ) : null}
    </div>
  );
}

export default function PrismSubscriptionAccount() {
  const [load, setLoad] = useState<AccountLoad>({ kind: "loading" });
  const [action, setAction] = useState<RedirectKind | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function reload() {
    setLoad({ kind: "loading" });
    setActionError(null);
    try {
      setLoad({ kind: "loaded", status: await loadPrismSubscriptionStatus() });
    } catch (reason) {
      setLoad({
        kind: "error",
        message:
          reason instanceof Error
            ? reason.message
            : "Subscription status could not be verified.",
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
              : "Subscription status could not be verified.",
        });
      });
    return () => controller.abort();
  }, []);

  async function redirectToStripe(kind: RedirectKind) {
    setAction(kind);
    setActionError(null);
    try {
      window.location.assign(await requestPrismStripeRedirect(kind));
    } catch (reason) {
      setActionError(
        reason instanceof Error
          ? reason.message
          : "Stripe could not be opened. No subscription change was assumed.",
      );
      setAction(null);
    }
  }

  if (load.kind !== "loaded") {
    return (
      <div>
        <SubscriptionStatusUnknown
          kind={load.kind}
          onRetry={load.kind === "error" ? () => void reload() : undefined}
        />
        {load.kind === "error" ? (
          <p role="alert" className="mt-4 text-sm text-danger">
            {load.message}
          </p>
        ) : null}
      </div>
    );
  }

  const { status } = load;
  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <section className="rounded-xl border border-border-strong bg-surface p-6 shadow-mat md:p-8">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-accent">
          Current owner projection · Stripe sandbox
        </p>
        <h2 className="mt-3 font-display text-3xl font-semibold">
          {status.plan === "all" ? "All" : "Free"}
        </h2>
        <p className="mt-3 text-sm leading-6 text-ink-muted">
          {status.plan === "all" && status.access.allowed
            ? "Signed webhook evidence currently marks this owner projection All. The referenced synthetic fixture remains the same public Free reading."
            : "The public fixed synthetic preview remains available. No All access is being inferred."}
        </p>

        {status.access.active_until ? (
          <p className="mt-4 text-sm text-ink-muted">
            Current access boundary: {readableDate(status.access.active_until)} UTC
          </p>
        ) : null}

        {status.subscription ? (
          <dl className="mt-6 grid gap-4 border-t border-border-subtle pt-6 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-ink-faint">Last verified Stripe lifecycle posture</dt>
              <dd className="mt-1 font-mono text-ink">{status.subscription.status}</dd>
            </div>
            <div>
              <dt className="text-ink-faint">Current period boundary</dt>
              <dd className="mt-1 text-ink">
                {status.subscription.current_period_end
                  ? `${readableDate(status.subscription.current_period_end)} UTC`
                  : "Awaiting a verified paid test period"}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-ink-faint">Cancellation</dt>
              <dd className="mt-1 text-ink">
                {status.subscription.cancel_at_period_end
                  ? "Scheduled for the end of the current test period. Existing access is not ended early by this browser view."
                  : "Not scheduled in the latest verified owner projection."}
              </dd>
            </div>
          </dl>
        ) : null}

        {status.subscription?.reconciliation?.status === "required" ? (
          <p
            role="status"
            className="mt-5 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm leading-6 text-ink-muted"
          >
            The refunded test period has ended. Stripe subscription cancellation
            still needs a verified terminal event; later invoices cannot restore
            access while this reconciliation is open.
          </p>
        ) : null}

        <div className="mt-7 flex flex-wrap gap-3">
          {status.checkout.available ? (
            <button
              type="button"
              disabled={action !== null}
              onClick={() => void redirectToStripe("checkout")}
              className="rounded-lg bg-ink px-5 py-3 text-sm font-semibold text-page disabled:cursor-not-allowed disabled:opacity-40"
            >
              {action === "checkout" ? "Opening Stripe…" : "Start £5/month sandbox checkout"}
            </button>
          ) : (
            <span className="rounded-lg border border-border-subtle bg-surface-subtle px-5 py-3 text-sm text-ink-muted">
              New sandbox checkout unavailable
            </span>
          )}
          {status.portal.available ? (
            <button
              type="button"
              disabled={action !== null}
              onClick={() => void redirectToStripe("portal")}
              className="rounded-lg border border-border-strong px-5 py-3 text-sm font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-40"
            >
              {action === "portal" ? "Opening Stripe…" : "Manage test subscription"}
            </button>
          ) : null}
          <button
            type="button"
            disabled={action !== null}
            onClick={() => void reload()}
            className="rounded-lg border border-border-strong px-5 py-3 text-sm font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            Refresh status
          </button>
        </div>
        <div aria-live="polite" className="mt-4 min-h-6 text-sm text-danger">
          {actionError}
        </div>
      </section>

      <aside className="rounded-xl border border-border-subtle bg-surface-elevated p-6 md:p-8">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-accent">
          What this test means
        </p>
        <ul className="mt-5 space-y-3 text-sm leading-6 text-ink-muted">
          <li>£5 per month is a sandbox test amount, not a published live price.</li>
          <li>Stripe test mode cannot take real money.</li>
          <li>All marks an owner-scoped test projection; it unlocks no payload unavailable on Free.</li>
          <li>A Checkout return cannot grant access; verified webhook evidence must arrive.</li>
          <li>PayPal, crypto, Telegram Stars, and live market signals remain off.</li>
        </ul>
        <div className="mt-6 flex flex-wrap gap-4 text-sm">
          <Link href="/prism-signals" className="font-semibold text-accent underline underline-offset-4">
            Back to PRISM Signals
          </Link>
          <Link href="/prism-signals/terms" className="font-semibold text-accent underline underline-offset-4">
            Test terms
          </Link>
        </div>
      </aside>
    </div>
  );
}
