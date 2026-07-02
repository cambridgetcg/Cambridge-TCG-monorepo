"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Badge, Palettes } from "@/lib/ui";
import { buildTrackingUrl } from "@/lib/shipping/carriers";

import { Audience } from "@/lib/ui";
const VAULT_LABELS: Record<string, string> = {
  reserved:  "Reserved",
  redeemed:  "Shipped",
  sold_back: "Sold back",
  expired:   "Expired",
  gifted:    "Gifted",
  traded:    "Traded",
};

interface VaultItem {
  id: string;
  sku: string;
  card_name: string;
  card_number: string | null;
  rarity: string | null;
  image_url: string | null;
  spot_price_gbp: string;
  status: "reserved" | "redeemed" | "sold_back" | "expired" | "gifted" | "traded";
  source: string;
  bounty_pull_id: string | null;
  acquired_at: string;
  expires_at: string;
  fulfilled_at: string | null;
  sold_back_credit: string | null;
  sold_back_at: string | null;
  redemption_order_id: number | null;
  tracking_number: string | null;
  carrier: string | null;
  shipped_at: string | null;
}

interface Summary {
  reserved: number;
  redeemed: number;
  sold_back: number;
  expired: number;
  transferred: number;
  total_spot: string;
  total_credit_received: string;
}

const FILTERS = [
  { key: "all", label: "All" },
  { key: "reserved", label: "Reserved" },
  { key: "redeemed", label: "Shipped" },
  { key: "sold_back", label: "Sold back" },
  { key: "expired", label: "Expired" },
] as const;

export default function AccountVaultPage() {
  const [items, setItems] = useState<VaultItem[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [filter, setFilter] = useState<typeof FILTERS[number]["key"]>("all");
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/account/vault")
      .then((r) => r.json())
      .then((d) => {
        if (d?.items) setItems(d.items);
        if (d?.summary) setSummary(d.summary);
      })
      .finally(() => setLoading(false));
  }, []);

  const filtered = filter === "all" ? items : items.filter((i) => i.status === filter);

  return (
    <div>
      <Audience kind="consumer" />
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-ink">Vault History</h1>
        <Link
          href="/bounty"
          className="text-sm bg-accent hover:bg-accent-strong text-black font-bold rounded-lg px-4 py-2 transition"
        >
          Bounty Board →
        </Link>
      </div>

      {/* Summary strip */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-6">
          <Stat label="Reserved" value={summary.reserved} tone="amber" />
          <Stat label="Shipped" value={summary.redeemed} tone="emerald" />
          <Stat label="Sold back" value={summary.sold_back} tone="sky" />
          <Stat label="Expired" value={summary.expired} />
          <Stat
            label="Credit earned"
            value={`£${parseFloat(summary.total_credit_received || "0").toFixed(2)}`}
          />
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              filter === f.key
                ? "bg-accent text-black"
                : "bg-surface text-ink-muted hover:text-ink hover:bg-surface-elevated"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-ink-faint">Loading...</p>
      ) : filtered.length === 0 ? (
        <div className="bg-surface border border-border-subtle rounded-xl p-6 text-center text-ink-faint text-sm">
          {filter === "all"
            ? "No vault items yet — open a Bounty Pull to claim your first card."
            : "Nothing in this category."}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((it) => (
            <VaultItemRow
              key={it.id}
              item={it}
              expanded={openId === it.id}
              onToggle={() => setOpenId(openId === it.id ? null : it.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function VaultItemRow({
  item, expanded, onToggle,
}: {
  item: VaultItem;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="bg-surface rounded-xl overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-3 py-3 text-left hover:bg-surface-elevated/50 transition"
      >
        <div className="relative w-10 h-14 shrink-0 rounded overflow-hidden bg-surface-elevated">
          {item.image_url && (
            <Image src={item.image_url} alt={item.card_name} fill sizes="40px" className="object-cover" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge status={item.status} palette={Palettes.VaultStatusPalette} labels={VAULT_LABELS} />
            <span className="font-semibold text-sm truncate">{item.card_name}</span>
          </div>
          <p className="text-xs text-ink-faint mt-0.5">
            {item.card_number} · {item.rarity} · £{parseFloat(item.spot_price_gbp).toFixed(2)}
          </p>
        </div>
        <span className="text-neutral-600 text-xs">
          {new Date(item.acquired_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
        </span>
        <span className="text-neutral-600 text-sm">{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && <VaultItemDetail item={item} />}
    </div>
  );
}

function VaultItemDetail({ item }: { item: VaultItem }) {
  const [lifecycle, setLifecycle] = useState<{ action: string; notes: string | null; createdAt: string }[] | null>(null);

  useEffect(() => {
    fetch(`/api/account/vault/${item.id}`)
      .then((r) => r.json())
      .then((d) => setLifecycle(d?.lifecycle ?? []));
  }, [item.id]);

  const trackUrl = buildTrackingUrl(item.carrier, item.tracking_number);

  return (
    <div className="px-3 pb-3 border-t border-border-subtle">
      <div className="grid sm:grid-cols-2 gap-4 mt-3">
        <div>
          <h3 className="text-[10px] uppercase tracking-wider text-ink-faint mb-2">Timeline</h3>
          {!lifecycle ? (
            <p className="text-xs text-ink-faint">Loading…</p>
          ) : lifecycle.length === 0 ? (
            <p className="text-xs text-ink-faint italic">No transitions yet — still reserved.</p>
          ) : (
            <ol className="space-y-2">
              {lifecycle.map((e, i) => (
                <li key={i} className="border-l-2 border-border-subtle pl-3">
                  <p className="text-xs font-bold text-ink uppercase">{e.action.replace(/_/g, " ")}</p>
                  <p className="text-[11px] text-ink-faint">
                    {new Date(e.createdAt).toLocaleString()}
                  </p>
                  {e.notes && <p className="text-[11px] text-ink-muted mt-0.5">{e.notes}</p>}
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="space-y-3">
          {item.status === "redeemed" && item.tracking_number && (
            <div>
              <h3 className="text-[10px] uppercase tracking-wider text-ink-faint mb-1">Shipment</h3>
              <p className="text-sm">
                {item.carrier && <span className="text-ink-muted">via {item.carrier} · </span>}
                {trackUrl ? (
                  <a href={trackUrl} target="_blank" rel="noopener noreferrer" className="text-accent-strong underline font-mono">
                    {item.tracking_number} ↗
                  </a>
                ) : (
                  <span className="font-mono">{item.tracking_number}</span>
                )}
              </p>
              {item.shipped_at && (
                <p className="text-[11px] text-ink-faint mt-0.5">
                  Shipped {new Date(item.shipped_at).toLocaleDateString()}
                </p>
              )}
            </div>
          )}

          {item.sold_back_credit && (
            <div>
              <h3 className="text-[10px] uppercase tracking-wider text-ink-faint mb-1">
                {item.status === "expired" ? "Auto-credit" : "Credit received"}
              </h3>
              <p className="text-sm text-secondary font-semibold">
                £{parseFloat(item.sold_back_credit).toFixed(2)}
              </p>
            </div>
          )}

          {item.status === "reserved" && (
            <div>
              <h3 className="text-[10px] uppercase tracking-wider text-ink-faint mb-1">Expires</h3>
              <p className="text-sm">{new Date(item.expires_at).toLocaleDateString()}</p>
              <Link
                href="/bounty"
                className="text-xs text-accent-strong hover:text-accent-strong underline mt-2 inline-block"
              >
                Manage in Bounty Vault →
              </Link>
            </div>
          )}

          {item.bounty_pull_id && (
            <div>
              <h3 className="text-[10px] uppercase tracking-wider text-ink-faint mb-1">Provably fair</h3>
              <Link
                href={`/verify/pull/${item.bounty_pull_id}`}
                target="_blank"
                className="inline-flex items-center gap-1 text-xs bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-secondary rounded px-2 py-1 transition-colors"
              >
                ✓ Verify this pull ↗
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone = "neutral" }: { label: string; value: string | number; tone?: "neutral" | "amber" | "emerald" | "sky" }) {
  const toneClass =
    tone === "amber"   ? "text-accent-strong" :
    tone === "emerald" ? "text-secondary" :
    tone === "sky"     ? "text-info" :
                         "text-ink";
  return (
    <div className="bg-surface rounded-lg px-3 py-2">
      <p className="text-[10px] text-ink-faint uppercase tracking-wider">{label}</p>
      <p className={`text-lg font-bold ${toneClass}`}>{value}</p>
    </div>
  );
}
