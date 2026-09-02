"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  PRISM_SIGNALS_BETA_CHANNELS,
  PRISM_SIGNALS_BETA_CONSENT_VERSION,
  PRISM_SIGNALS_BETA_SCHEMA,
  PRISM_SIGNALS_PRODUCT_ID,
  type PrismSignalsBetaChannel,
  type PrismSignalsBetaInterestDto,
} from "@/lib/prism-signals/beta-interest";

export type BetaInterestRequestState = "idle" | "saving" | "deleting";
export type BetaInterestLoadOutcome = "loading" | "loaded" | "error";

export function betaInterestSaveAllowed(
  loadOutcome: BetaInterestLoadOutcome,
  requestState: BetaInterestRequestState,
  intakeEnabled: boolean,
): boolean {
  return (
    intakeEnabled && loadOutcome === "loaded" && requestState === "idle"
  );
}

export function betaInterestDeleteAllowed(
  loadOutcome: BetaInterestLoadOutcome,
  requestState: BetaInterestRequestState,
): boolean {
  return loadOutcome === "loaded" && requestState === "idle";
}

function responseInterest(value: unknown): PrismSignalsBetaInterestDto | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Unexpected beta response.");
  }
  const interest = (value as { interest?: unknown }).interest;
  if (interest === null) return null;
  if (typeof interest !== "object" || interest === null || Array.isArray(interest)) {
    throw new Error("Unexpected beta response.");
  }
  const candidate = interest as Record<string, unknown>;
  const keys = Object.keys(candidate).sort();
  const expectedKeys = [
    "channel_preferences",
    "consent_version",
    "expires_at",
    "product_id",
    "requested_at",
    "schema",
    "updated_at",
  ];
  const channels = candidate.channel_preferences;
  const canonicalTimestamp =
    /^(?!0000-)[0-9]{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])T(?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]\.[0-9]{3}Z$/;
  if (
    keys.length !== expectedKeys.length ||
    keys.some((key, index) => key !== expectedKeys[index]) ||
    candidate.schema !== PRISM_SIGNALS_BETA_SCHEMA ||
    candidate.product_id !== PRISM_SIGNALS_PRODUCT_ID ||
    candidate.consent_version !== PRISM_SIGNALS_BETA_CONSENT_VERSION ||
    !Array.isArray(channels) ||
    channels.length < 1 ||
    channels.length > PRISM_SIGNALS_BETA_CHANNELS.length ||
    !["web", "telegram", "web,telegram"].includes(channels.join(",")) ||
    typeof candidate.requested_at !== "string" ||
    !canonicalTimestamp.test(candidate.requested_at) ||
    typeof candidate.updated_at !== "string" ||
    !canonicalTimestamp.test(candidate.updated_at) ||
    typeof candidate.expires_at !== "string" ||
    !canonicalTimestamp.test(candidate.expires_at)
  ) {
    throw new Error("Unexpected beta response.");
  }
  return candidate as unknown as PrismSignalsBetaInterestDto;
}

async function errorMessage(response: Response): Promise<string> {
  if (response.status === 401) {
    return "Your session ended. Sign in again before changing this request.";
  }
  if (response.status === 503) {
    return "The closed-beta request store is unavailable right now. Nothing was changed.";
  }
  try {
    const body = (await response.json()) as { error?: { message?: unknown } };
    if (typeof body.error?.message === "string") return body.error.message;
  } catch {
    // The bounded fallback below is more useful than exposing parse detail.
  }
  return "The request could not be completed. Nothing was changed.";
}

async function fetchOwnerInterest(
  signal?: AbortSignal,
): Promise<PrismSignalsBetaInterestDto | null> {
  const response = await fetch("/api/prism-signals/beta-interest", {
    method: "GET",
    cache: "no-store",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    signal,
  });
  if (!response.ok) throw new Error(await errorMessage(response));
  return responseInterest(await response.json());
}

function isAbortError(reason: unknown): boolean {
  return (
    typeof reason === "object" &&
    reason !== null &&
    "name" in reason &&
    reason.name === "AbortError"
  );
}

export function BetaInterestLoadBoundary({
  outcome,
  onRetry,
}: {
  outcome: Exclude<BetaInterestLoadOutcome, "loaded">;
  onRetry: () => void;
}) {
  if (outcome === "loading") {
    return (
      <div className="mt-5 text-sm leading-6 text-ink-muted">
        <p>Loading your owner-scoped stored state…</p>
        <p className="mt-3 text-ink-faint">
          No absence or active-interest conclusion is shown until that read succeeds.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-5 text-sm leading-6 text-ink-muted">
      <p className="font-semibold text-danger">Stored state not verified</p>
      <p className="mt-3">
        The owner status read failed, so Cambridge TCG cannot say here whether
        a beta-interest row exists. Save and withdrawal controls remain locked.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-5 rounded-lg border border-border-strong px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-surface"
      >
        Retry owner status
      </button>
    </div>
  );
}

export default function BetaInterestForm({
  intakeEnabled,
}: {
  intakeEnabled: boolean;
}) {
  const [state, setState] = useState<BetaInterestRequestState>("idle");
  const [loadOutcome, setLoadOutcome] =
    useState<BetaInterestLoadOutcome>("loading");
  const [interest, setInterest] = useState<PrismSignalsBetaInterestDto | null>(null);
  const [channels, setChannels] = useState<PrismSignalsBetaChannel[]>(["web"]);
  const [contactConsent, setContactConsent] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function retryLoad() {
    setLoadOutcome("loading");
    setError(null);
    setNotice(null);
    try {
      const stored = await fetchOwnerInterest();
      setInterest(stored);
      if (stored) setChannels([...stored.channel_preferences]);
      setLoadOutcome("loaded");
    } catch (reason) {
      setLoadOutcome("error");
      setError(
        reason instanceof Error
          ? reason.message
          : "The owner status could not be loaded. No stored-state conclusion is available.",
      );
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void fetchOwnerInterest(controller.signal)
      .then((stored) => {
        setInterest(stored);
        if (stored) setChannels([...stored.channel_preferences]);
        setLoadOutcome("loaded");
      })
      .catch((reason: unknown) => {
        if (isAbortError(reason)) return;
        setLoadOutcome("error");
        setError(
          reason instanceof Error
            ? reason.message
            : "The owner status could not be loaded. No stored-state conclusion is available.",
        );
      });
    return () => {
      controller.abort();
    };
  }, []);

  function toggleChannel(channel: PrismSignalsBetaChannel) {
    setChannels((current) =>
      current.includes(channel)
        ? current.filter((item) => item !== channel)
        : PRISM_SIGNALS_BETA_CHANNELS.filter(
            (item) => current.includes(item) || item === channel,
          ),
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    setError(null);
    if (loadOutcome !== "loaded") {
      setError("Retry the owner status read before changing this request.");
      return;
    }
    if (!intakeEnabled) {
      setError("New PRISM Signals beta-interest intake is paused.");
      return;
    }
    if (channels.length === 0) {
      setError("Choose at least one possible product channel.");
      return;
    }
    if (!contactConsent) {
      setError("Affirm the specific PRISM beta contact request before saving.");
      return;
    }

    setState("saving");
    try {
      const response = await fetch("/api/prism-signals/beta-interest", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          channel_preferences: PRISM_SIGNALS_BETA_CHANNELS.filter((channel) =>
            channels.includes(channel),
          ),
          contact_consent: true,
        }),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      const stored = responseInterest(await response.json());
      if (!stored) throw new Error("The saved beta request was not returned.");
      setInterest(stored);
      setChannels([...stored.channel_preferences]);
      setContactConsent(false);
      setNotice(
        "Your interest is recorded. This is still not an invitation, queue position, purchase, or access grant.",
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The request could not be saved.");
    } finally {
      setState("idle");
    }
  }

  async function withdraw() {
    if (loadOutcome !== "loaded") {
      setError("Retry the owner status read before changing this request.");
      return;
    }
    setNotice(null);
    setError(null);
    setState("deleting");
    try {
      const response = await fetch("/api/prism-signals/beta-interest", {
        method: "DELETE",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      setInterest(null);
      setContactConsent(false);
      setNotice("Your PRISM Signals beta-interest row has been deleted.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The request could not be withdrawn.");
    } finally {
      setState("idle");
    }
  }

  const canSave = betaInterestSaveAllowed(
    loadOutcome,
    state,
    intakeEnabled,
  );
  const canDelete = betaInterestDeleteAllowed(loadOutcome, state);

  return (
    <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
      <form
        onSubmit={submit}
        className="rounded-xl border border-border-strong bg-surface p-6 shadow-mat md:p-8"
      >
        {!intakeEnabled ? (
          <div className="mb-6 rounded-lg border border-border-strong bg-surface-subtle px-4 py-3 text-sm leading-6 text-ink-muted">
            New interest intake is paused. Status and withdrawal for an
            existing request remain available after the owner read succeeds.
          </div>
        ) : null}
        <fieldset disabled={!canSave}>
          <legend className="font-display text-2xl font-semibold text-ink">
            Your product-channel preference
          </legend>
          <p className="mt-3 text-sm leading-6 text-ink-muted">
            If Cambridge TCG separately invites you, where would you prefer to
            use PRISM Signals? This choice does not reserve a place or activate
            either channel.
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <label className="flex cursor-pointer gap-3 rounded-lg border border-border-subtle bg-surface-subtle p-4">
              <input
                type="checkbox"
                checked={channels.includes("web")}
                onChange={() => toggleChannel("web")}
                className="mt-1 h-4 w-4 accent-current"
              />
              <span>
                <span className="block font-semibold text-ink">Web</span>
                <span className="mt-1 block text-xs leading-5 text-ink-muted">
                  A signed-in Cambridge TCG product surface.
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer gap-3 rounded-lg border border-border-subtle bg-surface-subtle p-4">
              <input
                type="checkbox"
                checked={channels.includes("telegram")}
                onChange={() => toggleChannel("telegram")}
                className="mt-1 h-4 w-4 accent-current"
              />
              <span>
                <span className="block font-semibold text-ink">Telegram</span>
                <span className="mt-1 block text-xs leading-5 text-ink-muted">
                  Preference only. It does not link an account or permit a bot message.
                </span>
              </span>
            </label>
          </div>
        </fieldset>

        <label className="mt-6 flex cursor-pointer gap-3 rounded-lg border border-accent bg-accent-wash p-4">
          <input
            type="checkbox"
            checked={contactConsent}
            disabled={!canSave}
            onChange={(event) => setContactConsent(event.target.checked)}
            className="mt-1 h-4 w-4 accent-current"
          />
          <span className="text-sm leading-6 text-ink-muted">
            I ask <strong className="text-ink">Cambridge TCG</strong> to store
            my PRISM Signals closed-beta request and use my signed-in account
            email only for a PRISM beta invitation or status update. This is
            not general marketing, and I can withdraw below at any time.
          </span>
        </label>

        <div className="mt-6 flex flex-wrap items-center gap-4">
          <button
            type="submit"
            disabled={!canSave || !contactConsent || channels.length === 0}
            className="rounded-lg bg-ink px-5 py-3 text-sm font-semibold text-page transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {!intakeEnabled
              ? "New interest intake paused"
              : state === "saving"
              ? "Saving…"
              : interest
                ? "Reaffirm and update request"
                : "Ask to be considered"}
          </button>
          <Link
            href="/privacy#prism-signals-beta"
            className="text-sm font-semibold text-accent underline underline-offset-4"
          >
            How this request is stored
          </Link>
        </div>

        <div aria-live="polite" className="mt-5 min-h-6 text-sm leading-6">
          {loadOutcome === "loading" ? <p className="text-ink-faint">Loading your own request…</p> : null}
          {notice ? <p className="text-ok">{notice}</p> : null}
          {error ? <p className="text-danger">{error}</p> : null}
        </div>
      </form>

      <aside className="rounded-xl border border-border-subtle bg-surface-elevated p-6 md:p-8">
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-accent">
          Exact stored state
        </p>
        {loadOutcome !== "loaded" ? (
          <BetaInterestLoadBoundary
            outcome={loadOutcome}
            onRetry={() => void retryLoad()}
          />
        ) : interest ? (
          <div className="mt-5">
            <dl className="space-y-4 text-sm">
              <div>
                <dt className="text-ink-faint">Product</dt>
                <dd className="mt-1 font-mono text-ink">{interest.product_id}</dd>
              </div>
              <div>
                <dt className="text-ink-faint">Channel preferences</dt>
                <dd className="mt-1 text-ink">{interest.channel_preferences.join(" + ")}</dd>
              </div>
              <div>
                <dt className="text-ink-faint">Contact wording</dt>
                <dd className="mt-1 break-all font-mono text-xs text-ink">{interest.consent_version}</dd>
              </div>
              <div>
                <dt className="text-ink-faint">First requested</dt>
                <dd className="mt-1 font-mono text-xs text-ink">
                  <time dateTime={interest.requested_at}>{interest.requested_at}</time>
                </dd>
              </div>
              <div>
                <dt className="text-ink-faint">Last reaffirmed or updated</dt>
                <dd className="mt-1 font-mono text-xs text-ink">
                  <time dateTime={interest.updated_at}>{interest.updated_at}</time>
                </dd>
              </div>
              <div>
                <dt className="text-ink-faint">Automatic expiry</dt>
                <dd className="mt-1 font-mono text-xs text-ink">
                  <time dateTime={interest.expires_at}>{interest.expires_at}</time>
                </dd>
              </div>
            </dl>
            <button
              type="button"
              disabled={!canDelete}
              onClick={withdraw}
              className="mt-7 rounded-lg border border-danger px-4 py-2.5 text-sm font-semibold text-danger transition hover:bg-surface disabled:cursor-not-allowed disabled:opacity-40"
            >
              {state === "deleting" ? "Deleting…" : "Withdraw and delete request"}
            </button>
            <p className="mt-3 text-xs leading-5 text-ink-faint">
              Withdrawal is immediate and carries no penalty. You can make a
              new request later with a fresh affirmative checkbox.
            </p>
          </div>
        ) : (
          <div className="mt-5 text-sm leading-6 text-ink-muted">
            <p>No active PRISM Signals beta-interest row is stored for this account.</p>
            <p className="mt-3">
              The read-only owner API excludes expired or superseded-consent
              rows. Global physical cleanup belongs to the authenticated daily
              retention job.
            </p>
            {!intakeEnabled ? (
              <p className="mt-3 font-semibold text-ink">
                New interest intake is currently paused.
              </p>
            ) : null}
          </div>
        )}
      </aside>
    </div>
  );
}
