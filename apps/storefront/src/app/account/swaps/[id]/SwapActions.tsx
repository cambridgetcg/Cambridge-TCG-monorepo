"use client";

// Client island for swap actions: accept / decline / counter / cancel,
// then the post-accept flow (ship-to address → mark shipped → confirm
// receipt). The server page owns all display; this component only
// mutates and refreshes.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Consequences, ErrorAlert, Field, Input, LinkButton } from "@/lib/ui";
import type { SwapAddress, SwapProposal } from "@/lib/swaps/types";

type Role = "proposer" | "recipient";

export default function SwapActions({
  swap,
  meRole,
  cancelRequestedByOther,
  cancelRequestedByMe,
}: {
  swap: SwapProposal;
  meRole: Role;
  cancelRequestedByOther: boolean;
  cancelRequestedByMe: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [declineReason, setDeclineReason] = useState("");
  const [showDecline, setShowDecline] = useState(false);

  async function act(path: string, body?: object) {
    setBusy(path);
    setError(null);
    try {
      const res = await fetch(`/api/swaps/${swap.id}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Action failed.");
        return;
      }
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  const myAddress = meRole === "proposer" ? swap.proposer_address : swap.recipient_address;
  const theirAddress = meRole === "proposer" ? swap.recipient_address : swap.proposer_address;
  const myShippedAt = meRole === "proposer" ? swap.proposer_shipped_at : swap.recipient_shipped_at;
  const theirShippedAt = meRole === "proposer" ? swap.recipient_shipped_at : swap.proposer_shipped_at;
  const theirCarrier = meRole === "proposer" ? swap.recipient_carrier : swap.proposer_carrier;
  const theirTracking = meRole === "proposer" ? swap.recipient_tracking : swap.proposer_tracking;
  const myConfirmedAt = meRole === "proposer" ? swap.proposer_confirmed_at : swap.recipient_confirmed_at;
  const theirConfirmedAt = meRole === "proposer" ? swap.recipient_confirmed_at : swap.proposer_confirmed_at;

  return (
    <div className="space-y-4">
      {error && <ErrorAlert title="Action failed" description={error} />}

      {/* Draft: proposer sends or cancels */}
      {swap.status === "draft" && meRole === "proposer" && (
        <Card>
          <p className="text-sm text-neutral-300 mb-3">
            This draft is only visible to you. Send it to start the other collector&apos;s
            response window.
          </p>
          <div className="flex gap-2">
            <Button onClick={() => act("propose")} disabled={busy !== null}>
              {busy === "propose" ? "Sending…" : "Send proposal"}
            </Button>
            <Button variant="ghost" onClick={() => act("cancel")} disabled={busy !== null}>
              Delete draft
            </Button>
          </div>
        </Card>
      )}

      {/* Proposed: recipient accepts / declines / counters; proposer withdraws */}
      {swap.status === "proposed" && meRole === "recipient" && (
        <Card>
          <Consequences
            title="If you accept"
            items={[
              {
                label: "Next step",
                delta: "Both of you enter ship-to addresses, then post cards to each other",
                tone: "neutral",
                methodology: "/methodology/swaps",
              },
              {
                label: "Not held",
                delta: "No escrow — cards and any cash difference move between you directly",
                tone: "amber",
                methodology: "/methodology/swaps",
              },
              {
                label: "Trust score",
                delta: "No change either way — v1 swaps don't move trust",
                tone: "neutral",
                methodology: "/methodology/trust-score",
              },
            ]}
          />
          <div className="flex gap-2 mt-3 flex-wrap">
            <Button onClick={() => act("accept")} disabled={busy !== null}>
              {busy === "accept" ? "Accepting…" : "Accept swap"}
            </Button>
            <LinkButton variant="secondary" href={`/account/swaps/new?counter=${swap.id}`}>
              Counter
            </LinkButton>
            <Button variant="ghost" onClick={() => setShowDecline((v) => !v)} disabled={busy !== null}>
              Decline
            </Button>
          </div>
          {showDecline && (
            <div className="mt-3 space-y-2">
              <Field label="Reason (optional — shared with the proposer)" htmlFor="decline-reason">
                <Input
                  id="decline-reason"
                  value={declineReason}
                  onChange={(e) => setDeclineReason(e.target.value)}
                  maxLength={500}
                  placeholder="Not the cards I'm after right now."
                />
              </Field>
              <Button
                variant="danger"
                size="sm"
                onClick={() => act("decline", { reason: declineReason || undefined })}
                disabled={busy !== null}
              >
                {busy === "decline" ? "Declining…" : "Confirm decline"}
              </Button>
            </div>
          )}
        </Card>
      )}
      {swap.status === "proposed" && meRole === "proposer" && (
        <Card>
          <p className="text-sm text-neutral-300 mb-3">
            Waiting on the other collector. You can withdraw the proposal until they respond.
          </p>
          <Button variant="ghost" onClick={() => act("cancel")} disabled={busy !== null}>
            {busy === "cancel" ? "Withdrawing…" : "Withdraw proposal"}
          </Button>
        </Card>
      )}

      {/* Accepted / shipping: addresses, ship, confirm */}
      {(swap.status === "accepted" || swap.status === "shipping") && (
        <>
          <AddressPanel
            myAddress={myAddress}
            theirAddress={theirAddress}
            onSave={(address) => act("address", address)}
            busy={busy === "address"}
          />

          {swap.status === "shipping" && (
            <ShipPanel
              myShippedAt={myShippedAt}
              theirShippedAt={theirShippedAt}
              theirCarrier={theirCarrier}
              theirTracking={theirTracking}
              myConfirmedAt={myConfirmedAt}
              theirConfirmedAt={theirConfirmedAt}
              onShip={(carrier, tracking) => act("ship", { carrier, tracking })}
              onConfirm={() => act("confirm")}
              busyShip={busy === "ship"}
              busyConfirm={busy === "confirm"}
            />
          )}

          <Card variant="subtle">
            <p className="text-xs text-neutral-400">
              Change of heart? After acceptance a swap only cancels when{" "}
              <strong className="text-neutral-300">both</strong> of you agree.
              {cancelRequestedByOther && (
                <span className="text-amber-400">
                  {" "}The other collector has already asked to cancel — pressing cancel now
                  ends the swap.
                </span>
              )}
              {cancelRequestedByMe && !cancelRequestedByOther && (
                <span className="text-amber-400">
                  {" "}You've asked to cancel; waiting for them to agree.
                </span>
              )}
            </p>
            {!(cancelRequestedByMe && !cancelRequestedByOther) && (
              <div className="mt-2">
                <Button variant="ghost" size="sm" onClick={() => act("cancel")} disabled={busy !== null}>
                  {busy === "cancel"
                    ? "Working…"
                    : cancelRequestedByOther
                      ? "Agree to cancel"
                      : "Request cancellation"}
                </Button>
              </div>
            )}
          </Card>
        </>
      )}

      {/* Terminal states need no action panel — the timeline tells the story. */}
    </div>
  );
}

// ── Address panel ────────────────────────────────────────────────────────

function AddressPanel({
  myAddress,
  theirAddress,
  onSave,
  busy,
}: {
  myAddress: SwapAddress | null;
  theirAddress: SwapAddress | null;
  onSave: (address: SwapAddress) => void;
  busy: boolean;
}) {
  const [form, setForm] = useState<SwapAddress>(myAddress ?? {});
  const [editing, setEditing] = useState(!myAddress);

  const set = (key: keyof SwapAddress) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card>
        <h2 className="text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-2">
          Your ship-to address
        </h2>
        <p className="text-[10px] text-neutral-500 mb-3">
          Where the other collector posts your cards. Visible only to the two of you.
        </p>
        {!editing && myAddress ? (
          <>
            <AddressLines address={myAddress} />
            <div className="mt-2">
              <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
                Edit
              </Button>
            </div>
          </>
        ) : (
          <div className="space-y-2">
            <Input placeholder="Full name" value={form.name ?? ""} onChange={set("name")} aria-label="Full name" />
            <Input placeholder="Address line 1" value={form.line1 ?? ""} onChange={set("line1")} aria-label="Address line 1" />
            <Input placeholder="Address line 2 (optional)" value={form.line2 ?? ""} onChange={set("line2")} aria-label="Address line 2" />
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="City" value={form.city ?? ""} onChange={set("city")} aria-label="City" />
              <Input placeholder="Postcode" value={form.postal_code ?? ""} onChange={set("postal_code")} aria-label="Postcode" />
            </div>
            <Input placeholder="Country" value={form.country ?? ""} onChange={set("country")} aria-label="Country" />
            <Button
              size="sm"
              onClick={() => {
                onSave(form);
                setEditing(false);
              }}
              disabled={busy || !form.name || !form.line1}
            >
              {busy ? "Saving…" : "Save address"}
            </Button>
          </div>
        )}
      </Card>
      <Card>
        <h2 className="text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-2">
          Ship their cards to
        </h2>
        {theirAddress ? (
          <AddressLines address={theirAddress} />
        ) : (
          <p className="text-xs text-neutral-500">
            They haven&apos;t entered their address yet — shipping starts once both are in.
          </p>
        )}
      </Card>
    </div>
  );
}

function AddressLines({ address }: { address: SwapAddress }) {
  const lines = [
    address.name,
    address.line1,
    address.line2,
    [address.city, address.postal_code].filter(Boolean).join(" "),
    address.state,
    address.country,
  ].filter(Boolean);
  return (
    <address className="not-italic text-sm text-neutral-200 space-y-0.5">
      {lines.map((l, i) => (
        <p key={i}>{l}</p>
      ))}
    </address>
  );
}

// ── Ship + confirm panel ─────────────────────────────────────────────────

function ShipPanel({
  myShippedAt,
  theirShippedAt,
  theirCarrier,
  theirTracking,
  myConfirmedAt,
  theirConfirmedAt,
  onShip,
  onConfirm,
  busyShip,
  busyConfirm,
}: {
  myShippedAt: string | null;
  theirShippedAt: string | null;
  theirCarrier: string | null;
  theirTracking: string | null;
  myConfirmedAt: string | null;
  theirConfirmedAt: string | null;
  onShip: (carrier: string, tracking: string) => void;
  onConfirm: () => void;
  busyShip: boolean;
  busyConfirm: boolean;
}) {
  const [carrier, setCarrier] = useState("");
  const [tracking, setTracking] = useState("");

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card>
        <h2 className="text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-2">
          Your shipment
        </h2>
        {myShippedAt ? (
          <p className="text-sm text-emerald-400">Marked shipped ✓</p>
        ) : (
          <div className="space-y-2">
            <p className="text-[10px] text-neutral-500">
              Post your cards, then record carrier + tracking. This is your record and their
              reassurance — the platform doesn&apos;t verify it.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Carrier (e.g. Royal Mail)" value={carrier} onChange={(e) => setCarrier(e.target.value)} aria-label="Carrier" />
              <Input placeholder="Tracking number" value={tracking} onChange={(e) => setTracking(e.target.value)} aria-label="Tracking number" />
            </div>
            <Button size="sm" onClick={() => onShip(carrier, tracking)} disabled={busyShip || !carrier.trim() || !tracking.trim()}>
              {busyShip ? "Saving…" : "Mark as shipped"}
            </Button>
          </div>
        )}
      </Card>
      <Card>
        <h2 className="text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-2">
          Their shipment → you
        </h2>
        {theirShippedAt ? (
          <p className="text-sm text-neutral-200">
            Shipped via {theirCarrier || "—"}{" "}
            {theirTracking && <span className="font-mono text-xs">· {theirTracking}</span>}
          </p>
        ) : (
          <p className="text-xs text-neutral-500">Not marked shipped yet.</p>
        )}
        {myConfirmedAt ? (
          <p className="text-sm text-emerald-400 mt-2">You confirmed receipt ✓</p>
        ) : (
          <div className="mt-2">
            <Button size="sm" variant="secondary" onClick={onConfirm} disabled={busyConfirm}>
              {busyConfirm ? "Confirming…" : "Confirm their cards arrived"}
            </Button>
          </div>
        )}
        {theirConfirmedAt && (
          <p className="text-[10px] text-neutral-500 mt-2">They&apos;ve confirmed your cards arrived.</p>
        )}
      </Card>
    </div>
  );
}
