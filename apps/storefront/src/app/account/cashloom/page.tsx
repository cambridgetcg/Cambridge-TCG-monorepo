"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Audience, Consequences, PageHeader, WhyLink } from "@/lib/ui";
import type { CashloomKarmaDecision } from "@/lib/cashloom/karma";

interface CashLoomProfile {
  merchant_key_id: string;
  enabled: boolean;
  handoff_mode: "offline_bundle";
  identity_assurance: "user-declared-key-pin";
  disclosure_notice_version: string;
  disclosure_acknowledged_at: string;
  created_at: string;
  updated_at: string;
}

const KEY_ID = /^sha256:[0-9a-f]{64}$/;
const DISCLOSURE_NOTICE_VERSION = "cashloom-key-linkability-v1";

async function responseError(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json();
    if (typeof body?.error === "string") return body.error;
    return typeof body?.error?.message === "string" ? body.error.message : fallback;
  } catch {
    return fallback;
  }
}

export default function CashLoomAccountPage() {
  const [profile, setProfile] = useState<CashLoomProfile | null>(null);
  const [karma, setKarma] = useState<CashloomKarmaDecision | null>(null);
  const [merchantKeyId, setMerchantKeyId] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [acknowledgeLinkability, setAcknowledgeLinkability] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [showRemove, setShowRemove] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/account/cashloom", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(await responseError(response, "Could not load CashLoom settings."));
        return response.json();
      })
      .then((body) => {
        if (!active) return;
        const next = (body?.profile ?? null) as CashLoomProfile | null;
        setProfile(next);
        setKarma((body?.karma ?? null) as CashloomKarmaDecision | null);
        setMerchantKeyId(next?.merchant_key_id ?? "");
        setEnabled(next?.enabled ?? false);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Could not load CashLoom settings.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const normalizedKey = merchantKeyId.trim();
  const keyError = normalizedKey.length > 0 && !KEY_ID.test(normalizedKey)
    ? "Use the exact lowercase sha256: fingerprint shown by your CashLoom node."
    : null;

  async function saveProfile() {
    if (!KEY_ID.test(normalizedKey) || !acknowledgeLinkability) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const response = await fetch("/api/account/cashloom", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchant_key_id: normalizedKey,
          enabled,
          handoff_mode: "offline_bundle",
          disclosure_notice_version: DISCLOSURE_NOTICE_VERSION,
          disclosure_acknowledged: acknowledgeLinkability,
        }),
      });
      if (!response.ok) throw new Error(await responseError(response, "Could not save the key pin."));
      const body = await response.json();
      setProfile(body.profile as CashLoomProfile);
      setMerchantKeyId(body.profile.merchant_key_id);
      setEnabled(body.profile.enabled);
      setAcknowledgeLinkability(false);
      setSaved(true);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Could not save the key pin.");
    } finally {
      setSaving(false);
    }
  }

  async function removeProfile() {
    setRemoving(true);
    setError(null);
    try {
      const response = await fetch("/api/account/cashloom", { method: "DELETE" });
      if (!response.ok) throw new Error(await responseError(response, "Could not remove the key pin."));
      setProfile(null);
      setMerchantKeyId("");
      setEnabled(false);
      setAcknowledgeLinkability(false);
      setShowRemove(false);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Could not remove the key pin.");
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="space-y-6">
      <Audience kind="consumer" contexts={["account", "payments"]} />
      <PageHeader
        title="CashLoom"
        description="Declare a self-certifying key fingerprint for exact trade handoffs — without giving Cambridge a wallet or private key."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-border-subtle bg-surface p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">CashLoom account</p>
          <p className="mt-1 text-sm font-semibold text-ok">Not required</p>
          <p className="mt-1 text-xs text-ink-muted">Your sovereign node and portable files remain yours.</p>
        </div>
        <div className="rounded-lg border border-border-subtle bg-surface p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Cambridge stores</p>
          <p className="mt-1 text-sm font-semibold text-ink">Fingerprint + prepared packets</p>
          <p className="mt-1 text-xs text-ink-muted">One profile pin and one immutable terms packet per prepared trade; never a private key or payer acceptance.</p>
        </div>
        <div className="rounded-lg border border-border-subtle bg-surface p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Live market payment</p>
          <p className="mt-1 text-sm font-semibold text-warning">Not enabled</p>
          <p className="mt-1 text-xs text-ink-muted">Packets cannot mark a trade paid or unlock shipping.</p>
        </div>
      </div>

      {karma && (
        <section className="rounded-lg border border-accent/25 bg-accent-wash p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold uppercase tracking-wide text-ink">
                  KARMA defence preview
                </h2>
                <WhyLink
                  href="/methodology/karma-loop"
                  tooltip="How local observations propose a response without acting on your account or money"
                />
              </div>
              <p className="mt-1 text-sm text-ink-muted">
                {karma.state === "evaluated"
                  ? "Cambridge evaluated only your own unresolved local observations."
                  : "Cambridge could not form a valid local evidence bundle; the state is shown below rather than presented as all-clear."}{" "}
                Your signed-in account selects the private local rows, but no account identifier is
                emitted into this decision or its evidence hash. No shared blacklist or other
                trader&rsquo;s private evidence is used.
              </p>
            </div>
            <span className="rounded-full border border-info/30 bg-info/10 px-2.5 py-1 text-[11px] font-semibold text-info">
              Observe-only
            </span>
          </div>
          <dl className="mt-4 grid grid-cols-[minmax(8rem,auto)_1fr] gap-x-3 gap-y-2 text-xs">
            <dt className="text-ink-faint">Evidence state</dt>
            <dd className="font-mono text-ink">{karma.state}</dd>
            <dt className="text-ink-faint">Local observations</dt>
            <dd className="font-mono text-ink">
              {karma.evidence_count} accepted / {karma.supplied_evidence_count} supplied
            </dd>
            <dt className="text-ink-faint">Policy proposal</dt>
            <dd className="font-mono text-warning">{karma.proposed_response}</dd>
            <dt className="text-ink-faint">Effective response</dt>
            <dd className="font-mono text-ok">{karma.effective_response}</dd>
          </dl>
          <p className="mt-3 text-xs text-ink-muted">
            A proposal is a policy dry run, not a verdict. This release cannot suspend the
            account, alter trust or escrow, hold money, contact an attack source, or publish
            reputation. If observations exist, you can inspect their human-facing context on
            your <Link href="/account/standing" className="text-accent hover:underline">account standing</Link> page.
          </p>
        </section>
      )}

      <section className="rounded-lg border border-border-subtle bg-surface p-5 space-y-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-ink">Declared merchant key</h2>
            <WhyLink
              href="/methodology/cashloom-settlement"
              tooltip="What the key pin and trade packet do — and do not — prove"
            />
          </div>
          <p className="mt-1 text-sm text-ink-muted">
            Copy the merchant-key fingerprint from your own CashLoom v2 node. Cambridge checks
            its shape only in this release; it does not challenge the key or verify legal identity.
          </p>
        </div>

        {loading ? (
          <div className="h-10 animate-pulse rounded-lg bg-surface-subtle" />
        ) : (
          <>
            <label className="block">
              <span className="text-xs font-semibold text-ink">Merchant key fingerprint</span>
              <input
                type="text"
                value={merchantKeyId}
                onChange={(event) => {
                  setMerchantKeyId(event.target.value);
                  setSaved(false);
                }}
                spellCheck={false}
                autoComplete="off"
                placeholder={`sha256:${"0".repeat(64)}`}
                aria-invalid={Boolean(keyError)}
                className="mt-1 w-full rounded-lg border border-border-subtle bg-surface-subtle px-3 py-2 font-mono text-xs text-ink focus:border-accent/60 focus:outline-none"
              />
              {keyError && <span className="mt-1 block text-xs text-danger">{keyError}</span>}
            </label>

            <label className="flex items-start gap-3 rounded-lg border border-border-subtle bg-page p-3">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(event) => {
                  setEnabled(event.target.checked);
                  setSaved(false);
                }}
                className="mt-0.5"
              />
              <span>
                <span className="block text-sm font-semibold text-ink">Allow terms-only trade handoffs</span>
                <span className="block text-xs text-ink-muted">
                  Sellers may prepare an immutable GBP terms packet for a matched trade. This is
                  a dry-run coordination surface, not a payment option.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 p-3">
              <input
                type="checkbox"
                checked={acknowledgeLinkability}
                onChange={(event) => setAcknowledgeLinkability(event.target.checked)}
                className="mt-0.5"
              />
              <span className="text-xs text-ink-muted">
                I understand that saving a stable fingerprint links it to this Cambridge account
                and to future packets I prepare. Cambridge stores those packets, and either trade
                participant can export or share their copy. For no Cambridge-side link, I can leave
                this blank and exchange CashLoom artifacts outside the marketplace.
              </span>
            </label>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={saveProfile}
                disabled={saving || !KEY_ID.test(normalizedKey) || !acknowledgeLinkability}
                className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-page transition hover:opacity-90 disabled:opacity-40"
              >
                {saving ? "Saving…" : profile ? "Update key pin" : "Save key pin"}
              </button>
              {saved && <span className="text-sm font-medium text-ok">Saved.</span>}
              {profile && (
                <button
                  type="button"
                  onClick={() => setShowRemove(true)}
                  className="text-sm font-medium text-danger hover:underline"
                >
                  Remove from account
                </button>
              )}
            </div>
          </>
        )}

        {error && (
          <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
            {error}
          </p>
        )}
      </section>

      {showRemove && profile && (
        <section className="rounded-lg border border-danger/30 bg-danger/5 p-5 space-y-3">
          <h2 className="text-sm font-bold text-ink">Remove this account link?</h2>
          <Consequences
            items={[
              { label: "Account pin", delta: "removed", tone: "red" },
              { label: "New handoffs", delta: "disabled until another pin is saved", tone: "amber" },
              { label: "Existing packets", delta: "unchanged — their captured history remains exact", tone: "emerald" },
            ]}
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={removeProfile}
              disabled={removing}
              className="rounded-lg bg-danger px-4 py-2 text-sm font-semibold text-page disabled:opacity-50"
            >
              {removing ? "Removing…" : "Remove key pin"}
            </button>
            <button
              type="button"
              onClick={() => setShowRemove(false)}
              disabled={removing}
              className="rounded-lg border border-border-strong px-4 py-2 text-sm font-semibold text-ink"
            >
              Keep it
            </button>
          </div>
        </section>
      )}

      <section className="rounded-lg border border-accent/20 bg-accent-wash p-5">
        <h2 className="text-sm font-bold text-ink">How this grows safely</h2>
        <p className="mt-1 text-sm text-ink-muted">
          The next release needs an immutable choice between Stripe and CashLoom, independently
          observed settlement, payout exclusion, commission rules, and delivery-based international
          protection. Until then, the packet is useful for reviewing exact terms without creating a
          second chargeable path.
        </p>
        <Link href="/methodology/cashloom-settlement" className="mt-3 inline-block text-sm font-semibold text-accent hover:underline">
          Read the settlement and international-trade design →
        </Link>
      </section>
    </div>
  );
}
