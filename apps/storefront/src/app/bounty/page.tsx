"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { DEFAULTS } from "@cambridge-tcg/pricing";

// Mirrors MERGE_COST + MERGE_CHAIN from src/lib/bounty/merge.ts. Duplicated
// here as a pure UI constant so the page doesn't need to import server code.
const MERGE_COST = 4;
const MERGE_CHAIN: Record<string, string | null> = {
  common: "uncommon",
  uncommon: "rare",
  rare: "super_rare",
  super_rare: null,
  legendary: null,
};

// Trade-in-credit margin multiplier — single source via @cambridge-tcg/pricing.
// Phase 1 of kingdom-049 replaced the hard-coded × 0.77 here.
const TRADEIN_CREDIT_MULT = DEFAULTS["tradein-credit"]!.marginMultiplier;

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type PullTier = "common" | "uncommon" | "rare" | "super_rare" | "legendary";

const TIER_LABEL: Record<PullTier, string> = {
  common: "Common",
  uncommon: "Uncommon",
  rare: "Rare",
  super_rare: "Super Rare",
  legendary: "Legendary",
};

/* Rarity keeps its tone vocabulary — quiet-gallery re-tune: flat hairline
 * card + tone-colored label. The gradient paint died; the meaning didn't.
 * (Plum/teal literals match the Badge tone map in @/lib/ui/Badge.tsx.) */
const TIER_COLOR: Record<PullTier, string> = {
  common: "text-ink-muted",
  uncommon: "text-ok",
  rare: "text-[#3e7d8f]",
  super_rare: "text-[#6a5a8f]",
  legendary: "text-accent",
};

interface Eligibility {
  phone_verified: boolean;
  phone_verification_available: boolean;
  first_order_paid: boolean;
  eligible: boolean;
  reasons: string[];
}

interface VaultItem {
  id: string;
  sku: string;
  card_name: string;
  card_number: string | null;
  set_code: string | null;
  rarity: string | null;
  image_url: string | null;
  spot_price_gbp: string;
  source: string;
  status: "reserved" | "redeemed" | "sold_back" | "traded" | "gifted" | "expired";
  acquired_at: string;
  expires_at: string;
  p2p_hold_until: string;
  redemption_order_id: number | null;
  sold_back_credit: string | null;
}

interface PullResult {
  pull_id: string;
  rolled_rarity: string;
  rng_commitment: string;
  vault_item: VaultItem;
}

/* ================================================================== */
/*  Bounty Board                                                       */
/* ================================================================== */

export default function BountyBoard() {
  const [eligibility, setEligibility] = useState<Eligibility | null>(null);
  const [tokens, setTokens] = useState<Record<PullTier, number>>({
    common: 0, uncommon: 0, rare: 0, super_rare: 0, legendary: 0,
  });
  const [items, setItems] = useState<VaultItem[]>([]);
  const [filter, setFilter] = useState<"all" | "reserved" | "sold_back" | "redeemed">("reserved");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authError, setAuthError] = useState(false);
  const [pullResult, setPullResult] = useState<PullResult | null>(null);
  const [showRedeemModal, setShowRedeemModal] = useState<VaultItem | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkModal, setShowBulkModal] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [eligRes, vaultRes] = await Promise.all([
        fetch("/api/bounty/eligibility"),
        fetch(`/api/bounty/vault${filter === "all" ? "" : `?status=${filter}`}`),
      ]);
      // Signed-out visitors get 401s here. Mirror the community page's
      // authError pattern: render the how-it-works explainer + sign-in
      // door instead of a fake empty player UI.
      if (eligRes.status === 401 || vaultRes.status === 401) {
        setAuthError(true);
        return;
      }
      setAuthError(false);
      if (eligRes.ok) {
        const d = await eligRes.json();
        setEligibility(d.eligibility);
        setTokens(d.tokens);
      }
      if (vaultRes.ok) {
        const d = await vaultRes.json();
        setItems(d.items);
      }
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { refresh(); }, [refresh]);

  async function handlePull(tier: PullTier) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/bounty/resolve-pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || data.error || "Pull failed.");
        return;
      }
      setPullResult(data);
      await refresh();
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  }

  async function handleMerge(tier: PullTier) {
    if (busy) return;
    const to = MERGE_CHAIN[tier];
    if (!to) return;
    const toLabel = TIER_LABEL[to as PullTier] ?? to;
    if (!confirm(`Burn ${MERGE_COST} ${TIER_LABEL[tier]} tokens to forge 1 ${toLabel}?\nThis cannot be undone.`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/bounty/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from_tier: tier }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || data.error || "Merge failed.");
        return;
      }
      await refresh();
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  }

  async function handleBulkRedeem(name: string, address: string) {
    if (busy || selectedIds.size === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/bounty/vault/redeem-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vault_item_ids: Array.from(selectedIds),
          shipping_name: name,
          shipping_address: address,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Bulk redemption failed.");
        return;
      }
      setSelectedIds(new Set());
      setShowBulkModal(false);
      await refresh();
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSellBack(item: VaultItem) {
    if (busy) return;
    if (!confirm(`Sell back ${item.card_name} for store credit at 77% of spot?`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/bounty/vault/${item.id}/sell-back`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Sell-back failed.");
        return;
      }
      await refresh();
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  }

  /* ================================================================ */
  /*  Render                                                          */
  /* ================================================================ */

  const totalTokens = Object.values(tokens).reduce((s, n) => s + n, 0);

  return (
    <main className="min-h-screen bg-page text-ink">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border-subtle">
        <div className="relative mx-auto max-w-5xl px-4 py-12 sm:py-16">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl sm:text-4xl font-display font-semibold tracking-tight mb-2">
                Bounty <span className="text-accent">Board</span>
              </h1>
              <p className="text-ink-muted max-w-xl">
                Win phygital cards in Adventure Mode. Keep them in your Vault, sell back for store credit, or redeem for a physical copy shipped to you.
              </p>
            </div>
            <div className="flex gap-3">
              <Link href="/play/adventure" className="bg-ink hover:bg-ink/85 text-page font-bold rounded-lg px-5 py-2.5 text-sm transition-colors">
                Play Adventure
              </Link>
              <Link href="/account" className="bg-surface hover:bg-surface border border-border-subtle rounded-lg px-5 py-2.5 text-sm transition-colors">
                Account
              </Link>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-4 py-8 space-y-8">
        {/* Error banner */}
        {error && (
          <div className="bg-danger/10 border border-danger text-danger rounded-lg px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="py-16 text-center">
            <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        ) : authError ? (
          /* Signed-out view — the board explained in three steps, the same
             loop the player UI enacts: pull tokens → vault → redeem or
             sell back. The door in is /login. */
          <section className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="bg-surface border border-border-subtle rounded-lg p-5">
                <p className="text-xs uppercase tracking-wider text-accent font-semibold mb-2">1 · Earn pull tokens</p>
                <p className="text-sm text-ink-muted">
                  Clear Adventure Mode levels to earn milestone pulls, from Common up to Legendary. Spare tokens can be merged up a tier.
                </p>
              </div>
              <div className="bg-surface border border-border-subtle rounded-lg p-5">
                <p className="text-xs uppercase tracking-wider text-accent font-semibold mb-2">2 · Open into your Vault</p>
                <p className="text-sm text-ink-muted">
                  Each pull rolls a real card and reserves it in your Vault — every roll comes with a proof you can verify yourself.
                </p>
              </div>
              <div className="bg-surface border border-border-subtle rounded-lg p-5">
                <p className="text-xs uppercase tracking-wider text-accent font-semibold mb-2">3 · Redeem or sell back</p>
                <p className="text-sm text-ink-muted">
                  Have the physical card shipped to you (tracked, usually 2–4 business days), or sell it back for store credit at {Math.round(TRADEIN_CREDIT_MULT * 100)}% of its spot price.
                </p>
              </div>
            </div>
            <div className="bg-surface border border-border-subtle rounded-lg p-6 text-center">
              <p className="text-ink-muted text-sm mb-4">Sign in to see your pull tokens and Vault.</p>
              <Link
                href="/login"
                className="inline-block bg-ink hover:bg-ink/85 text-page font-bold rounded-lg px-6 py-2.5 text-sm transition-colors"
              >
                Sign In
              </Link>
            </div>
          </section>
        ) : (
          <>
        {/* Eligibility gate */}
        {eligibility && !eligibility.eligible && (
          <div className="bg-accent-wash border border-accent/50 rounded-lg p-5">
            <h2 className="font-bold text-accent mb-2">
              {eligibility.reasons.includes("phone_verification_unavailable")
                ? "Pulls and redemptions are temporarily closed"
                : "Finish setup to open pulls"}
            </h2>
            <p className="text-ink-muted text-sm mb-4">
              {eligibility.reasons.includes("phone_verification_unavailable")
                ? "Phone verification is paused while real code verification is being built. No submitted number is treated as verified."
                : "Bounty Board requires a prior paid order before you can redeem or resolve pulls."}
            </p>
            <ul className="text-sm space-y-1.5 mb-4">
              {eligibility.reasons.includes("phone_verification_unavailable") && (
                <li className="flex items-center justify-between gap-3">
                  <span className="text-ink-muted">Phone code verification</span>
                  <span className="text-xs text-ink-faint">Unavailable</span>
                </li>
              )}
              {eligibility.reasons.includes("no_paid_order") && (
                <li className="flex items-center justify-between gap-3">
                  <span className="text-ink-muted">At least one paid order</span>
                  <Link href="/catalog" className="text-xs bg-surface-subtle hover:bg-surface rounded px-3 py-1.5 transition-colors">
                    Browse catalog
                  </Link>
                </li>
              )}
            </ul>
            <p className="text-xs text-ink-faint">Your pull tokens will still accumulate — you just can&apos;t open them yet.</p>
          </div>
        )}

        {/* Pull tokens */}
        <section>
          <h2 className="text-lg font-bold mb-3">Pull Tokens {totalTokens > 0 && <span className="text-accent">· {totalTokens}</span>}</h2>
          {totalTokens === 0 ? (
            <div className="bg-surface border border-border-subtle rounded-lg p-6 text-center text-ink-faint text-sm">
              No tokens yet. Clear <Link href="/play/adventure" className="text-accent hover:underline">Adventure levels</Link> to earn milestone pulls.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              {(Object.keys(tokens) as PullTier[]).filter(t => tokens[t] > 0).map(tier => {
                const nextTier = MERGE_CHAIN[tier] as PullTier | null;
                const mergeable = nextTier !== null;
                const canMergeNow = mergeable && tokens[tier] >= MERGE_COST;
                return (
                  <div
                    key={tier}
                    className="relative rounded-lg p-5 bg-surface border border-border-subtle overflow-hidden"
                  >
                    <div className="absolute -right-4 -bottom-4 text-8xl font-display font-semibold text-ink/5 select-none">
                      {tokens[tier]}
                    </div>
                    <div className="relative">
                      <p className={`text-xs uppercase tracking-wider font-semibold ${TIER_COLOR[tier]}`}>{TIER_LABEL[tier]} Pull</p>
                      <p className="text-3xl font-display font-semibold my-1">×{tokens[tier]}</p>
                      <button
                        onClick={() => handlePull(tier)}
                        disabled={busy || !eligibility?.eligible}
                        className="mt-2 w-full bg-ink hover:bg-ink/85 disabled:opacity-50 text-page font-semibold rounded-lg py-2 text-sm transition-colors"
                      >
                        {busy ? "Rolling..." : "Open"}
                      </button>
                      {mergeable && nextTier && (
                        <button
                          onClick={() => handleMerge(tier)}
                          disabled={busy || !canMergeNow}
                          title={canMergeNow
                            ? `Merge ${MERGE_COST} ${TIER_LABEL[tier]} tokens into 1 ${TIER_LABEL[nextTier]}`
                            : `Need ${MERGE_COST} tokens to merge (you have ${tokens[tier]}).`}
                          className="mt-1.5 w-full bg-surface hover:bg-surface border border-border-subtle disabled:opacity-40 text-ink-muted text-[11px] font-medium rounded-lg py-1.5 transition-colors"
                        >
                          {canMergeNow
                            ? `⇧ Merge ${MERGE_COST}× → 1 ${TIER_LABEL[nextTier]}`
                            : `${MERGE_COST - tokens[tier]} more to merge`}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Vault */}
        <section>
          <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
            <h2 className="text-lg font-bold">Your Vault</h2>
            <div className="flex gap-1 text-xs">
              {(["reserved", "sold_back", "redeemed", "all"] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 rounded-lg transition-colors ${
                    filter === f
                      ? "bg-ink text-page font-bold"
                      : "bg-surface-subtle hover:bg-surface text-ink-muted"
                  }`}
                >
                  {f === "all" ? "All" : f.replace("_", " ")}
                </button>
              ))}
            </div>
          </div>

          {items.length === 0 ? (
            <div className="bg-surface border border-border-subtle rounded-lg p-6 text-center text-ink-faint text-sm">
              Nothing here yet. Open a pull to claim a card.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items.map(item => (
                <VaultCard
                  key={item.id}
                  item={item}
                  busy={busy}
                  releaseAvailable={Boolean(eligibility?.eligible)}
                  selected={selectedIds.has(item.id)}
                  onToggleSelect={() => setSelectedIds(prev => {
                    const next = new Set(prev);
                    if (next.has(item.id)) next.delete(item.id); else next.add(item.id);
                    return next;
                  })}
                  onSellBack={() => handleSellBack(item)}
                  onRedeem={() => setShowRedeemModal(item)}
                />
              ))}
            </div>
          )}
        </section>
          </>
        )}
      </div>

      {/* Pull result modal */}
      {pullResult && (
        <PullResultModal
          result={pullResult}
          onClose={() => setPullResult(null)}
        />
      )}

      {/* Redemption modal */}
      {showRedeemModal && (
        <RedeemModal
          item={showRedeemModal}
          onClose={() => setShowRedeemModal(null)}
          onSuccess={async () => { setShowRedeemModal(null); await refresh(); }}
          onError={setError}
        />
      )}

      {/* Bulk-redeem sticky bar */}
      {selectedIds.size > 0 && !showBulkModal && (
        <div className="fixed bottom-0 inset-x-0 z-40 bg-page/95 backdrop-blur border-t border-accent/40 px-4 py-3 flex items-center justify-between gap-3">
          <div className="text-sm">
            <span className="font-bold text-accent">{selectedIds.size}</span> selected for bundled shipment
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setSelectedIds(new Set())}
              className="text-xs px-3 py-2 bg-surface hover:bg-surface border border-border-subtle rounded-lg transition-colors"
            >
              Clear
            </button>
            <button
              onClick={() => setShowBulkModal(true)}
              className="text-xs px-4 py-2 bg-ink hover:bg-ink/85 text-page font-bold rounded-lg transition-colors"
            >
              Redeem {selectedIds.size} item{selectedIds.size === 1 ? "" : "s"}
            </button>
          </div>
        </div>
      )}

      {/* Bulk-redeem modal */}
      {showBulkModal && (
        <BulkRedeemModal
          count={selectedIds.size}
          busy={busy}
          onClose={() => setShowBulkModal(false)}
          onSubmit={handleBulkRedeem}
        />
      )}
    </main>
  );
}

function BulkRedeemModal({
  count, busy, onClose, onSubmit,
}: {
  count: number;
  busy: boolean;
  onClose: () => void;
  onSubmit: (name: string, address: string) => void | Promise<void>;
}) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");

  return (
    <Modal onClose={onClose} title={`Bundle ${count} card${count === 1 ? "" : "s"} into one shipment`}>
      <p className="text-ink-muted text-sm mb-3">
        All selected cards ship together in a single tracked envelope. Usually 2–4 business days.
      </p>
      <input
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Recipient name"
        className="w-full bg-surface-subtle border border-border-subtle rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-accent mb-2"
      />
      <textarea
        value={address}
        onChange={e => setAddress(e.target.value)}
        placeholder="Full shipping address (street, city, postcode, country)"
        rows={3}
        className="w-full bg-surface-subtle border border-border-subtle rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-accent mb-3"
      />
      <div className="flex gap-2">
        <button
          onClick={() => onSubmit(name.trim(), address.trim())}
          disabled={busy || name.trim().length < 2 || address.trim().length < 10}
          className="flex-1 bg-ink hover:bg-ink/85 disabled:opacity-50 text-page font-bold rounded-lg py-2 text-sm transition-colors"
        >
          {busy ? "Submitting..." : `Ship ${count} card${count === 1 ? "" : "s"}`}
        </button>
        <button
          onClick={onClose}
          disabled={busy}
          className="bg-surface hover:bg-surface border border-border-subtle rounded-lg px-4 py-2 text-sm transition-colors"
        >
          Cancel
        </button>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/*  Pieces                                                             */
/* ------------------------------------------------------------------ */

function VaultCard({
  item, busy, releaseAvailable, selected, onToggleSelect, onSellBack, onRedeem,
}: {
  item: VaultItem;
  busy: boolean;
  releaseAvailable: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onSellBack: () => void;
  onRedeem: () => void;
}) {
  const spot = parseFloat(item.spot_price_gbp);
  const sellBack = spot * TRADEIN_CREDIT_MULT;
  const holdUntil = new Date(item.p2p_hold_until).getTime();
  const expires = new Date(item.expires_at).getTime();

  // Time-derived state must be computed post-mount (React purity rule).
  const [now, setNow] = useState(0);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setNow(Date.now()); }, []);
  const onHold = now > 0 && now < holdUntil && item.status === "reserved";
  const daysLeft = now > 0 ? Math.max(0, Math.floor((expires - now) / 86400000)) : 0;
  const selectable = releaseAvailable && item.status === "reserved" && !item.redemption_order_id && !onHold;

  return (
    <div className={`bg-surface border rounded-lg overflow-hidden transition-colors ${selected ? "border-accent" : "border-border-subtle"}`}>
      <div className="relative aspect-[5/7] bg-surface-subtle">
        {item.image_url ? (
          <Image src={item.image_url} alt={item.card_name} fill sizes="200px" className="object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-ink-faint text-xs">No image</div>
        )}
        {item.status !== "reserved" && (
          <div className="absolute top-2 right-2 text-[10px] font-bold uppercase tracking-wider bg-surface text-ink-muted px-2 py-0.5 rounded">
            {item.status.replace("_", " ")}
          </div>
        )}
        {selectable && (
          <button
            type="button"
            onClick={onToggleSelect}
            aria-label={selected ? "Unselect for bulk shipment" : "Select for bulk shipment"}
            className={`absolute top-2 left-2 w-6 h-6 rounded border-2 flex items-center justify-center text-[10px] font-bold transition-colors ${
              selected
                ? "bg-ink border-accent text-page"
                : "bg-surface border-border-subtle hover:border-accent"
            }`}
          >
            {selected ? "✓" : ""}
          </button>
        )}
      </div>
      <div className="p-3 space-y-2">
        <div>
          <p className="font-semibold text-sm truncate">{item.card_name}</p>
          <p className="text-xs text-ink-faint">
            {item.card_number} · {item.rarity} · £{spot.toFixed(2)}
          </p>
        </div>
        {item.status === "reserved" && (
          <div className="flex items-center gap-1.5 text-[10px] text-ink-faint">
            {item.redemption_order_id ? (
              <span className="text-accent">Redemption requested (#{item.redemption_order_id})</span>
            ) : (
              <>
                <span>Expires in {daysLeft}d</span>
                {onHold && <span className="text-ink-faint">· on hold</span>}
              </>
            )}
          </div>
        )}
        {item.status === "sold_back" && item.sold_back_credit && (
          <div className="text-[10px] text-ok">
            Sold back for £{parseFloat(item.sold_back_credit).toFixed(2)} store credit
          </div>
        )}
        {item.status === "reserved" && !item.redemption_order_id && (
          <div className="flex gap-1.5 pt-1">
            <button
              onClick={onSellBack}
              disabled={busy || !releaseAvailable}
              className="flex-1 text-[11px] bg-surface hover:bg-surface border border-border-subtle rounded px-2 py-1.5 transition-colors disabled:opacity-50"
              title={releaseAvailable
                ? "77% of spot to store credit"
                : "Unavailable while phone verification is paused"}
            >
              Sell £{sellBack.toFixed(2)}
            </button>
            <button
              onClick={onRedeem}
              disabled={busy || onHold || !releaseAvailable}
              className="flex-1 text-[11px] bg-accent-wash hover:bg-accent/20 text-accent rounded px-2 py-1.5 transition-colors disabled:opacity-50"
              title={!releaseAvailable
                ? "Unavailable while phone verification is paused"
                : onHold
                  ? "In 48h hold period"
                  : "Request a physical shipment"}
            >
              Redeem
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function PullResultModal({ result, onClose }: { result: PullResult; onClose: () => void }) {
  const v = result.vault_item;
  return (
    <Modal onClose={onClose} title="">
      <div className="text-center">
        <p className="text-xs uppercase tracking-wider text-accent font-bold mb-1">You rolled</p>
        <p className="text-lg font-bold mb-3">{result.rolled_rarity.toUpperCase()}</p>
        <div className="relative w-48 h-[264px] mx-auto rounded-lg overflow-hidden border-2 border-accent/50 shadow-mat">
          {v.image_url ? (
            <Image src={v.image_url} alt={v.card_name} fill sizes="192px" className="object-cover" />
          ) : (
            <div className="w-full h-full bg-surface-subtle flex items-center justify-center text-ink-faint text-xs">No image</div>
          )}
        </div>
        <p className="mt-3 font-bold">{v.card_name}</p>
        <p className="text-xs text-ink-faint">{v.card_number} · {v.rarity} · £{parseFloat(v.spot_price_gbp).toFixed(2)}</p>
        <p className="mt-4 text-[10px] text-ink-faint font-mono break-all">
          RNG commit: {result.rng_commitment.slice(0, 32)}...
        </p>
        <Link
          href={`/bounty/verify/${result.pull_id}`}
          target="_blank"
          className="text-[11px] text-accent/80 hover:text-accent-strong underline mt-1 inline-block"
        >
          Verify this pull &rarr;
        </Link>
        <button
          onClick={onClose}
          className="mt-4 w-full bg-ink hover:bg-ink/85 text-page font-bold rounded-lg py-2.5 text-sm transition-colors"
        >
          Add to Vault
        </button>
      </div>
    </Modal>
  );
}

function RedeemModal({
  item, onClose, onSuccess, onError,
}: {
  item: VaultItem;
  onClose: () => void;
  onSuccess: () => void | Promise<void>;
  onError: (msg: string) => void;
}) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!name.trim() || address.trim().length < 10) {
      onError("Name and full shipping address required.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/bounty/vault/${item.id}/request-redeem`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shipping_name: name.trim(), shipping_address: address.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        onError(data.error || "Redemption failed.");
        return;
      }
      await onSuccess();
    } catch {
      onError("Network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose} title={`Redeem ${item.card_name}`}>
      <p className="text-ink-muted text-sm mb-3">
        We&apos;ll ship the physical card to the address below. Tracked delivery; usually 2–4 business days.
      </p>
      <input
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Recipient name"
        className="w-full bg-surface-subtle border border-border-subtle rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-accent mb-2"
      />
      <textarea
        value={address}
        onChange={e => setAddress(e.target.value)}
        placeholder="Full shipping address (street, city, postcode, country)"
        rows={3}
        className="w-full bg-surface-subtle border border-border-subtle rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-accent mb-3"
      />
      <div className="flex gap-2">
        <button
          onClick={submit}
          disabled={busy}
          className="flex-1 bg-ink hover:bg-ink/85 disabled:opacity-50 text-page font-bold rounded-lg py-2 text-sm transition-colors"
        >
          {busy ? "Submitting..." : "Request shipment"}
        </button>
        <button
          onClick={onClose}
          disabled={busy}
          className="bg-surface hover:bg-surface border border-border-subtle rounded-lg px-4 py-2 text-sm transition-colors"
        >
          Cancel
        </button>
      </div>
    </Modal>
  );
}

function Modal({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 px-4"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-border-subtle rounded-lg p-6 max-w-md w-full shadow-mat"
        onClick={e => e.stopPropagation()}
      >
        {title && <h2 className="font-bold mb-3">{title}</h2>}
        {children}
      </div>
    </div>
  );
}
