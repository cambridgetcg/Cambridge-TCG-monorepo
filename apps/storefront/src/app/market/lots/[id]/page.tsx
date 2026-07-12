"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Icon, MessageButton, Money } from "@/lib/ui";

interface Lot {
  id: string;
  title: string;
  description: string | null;
  price: string;
  image_url: string | null;
  status: string;
  items: Array<{ sku: string; card_name: string | null; quantity: number }>;
}

export default function LotDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [lot, setLot] = useState<Lot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);

  useEffect(() => {
    fetch(`/api/market/lots/${id}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.lot) setLot(d.lot); else setError("Lot not found"); })
      .catch(() => setError("Failed to load"))
      .finally(() => setLoading(false));
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((d) => setLoggedIn(!!d?.user?.email))
      .catch(() => setLoggedIn(false));
  }, [id]);

  if (loading) return <div className="min-h-screen flex items-center justify-center"><p className="text-ink-faint text-sm">Loading...</p></div>;
  if (!lot) return <div className="min-h-screen flex items-center justify-center"><p className="text-ink-faint text-sm">{error || "Not found"}</p></div>;

  const price = parseFloat(lot.price);

  // Wardrobe migration (spec §3.4): Gallery tokens, matted art, mono numerals — behaviour unchanged.
  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-4 text-sm text-ink-faint">
        <Link href="/market/lots" className="hover:text-accent hover:underline">
          Lots
        </Link>
        <span className="mx-2">/</span>
        <span className="text-ink-muted truncate">{lot.title}</span>
      </div>

      <div className="grid md:grid-cols-[320px_1fr] gap-6">
        <div>
          <div className="aspect-[4/3] wardrobe-mat rounded-lg overflow-hidden p-1">
            {lot.image_url ? (
              <img src={lot.image_url} alt="" className="w-full h-full object-cover rounded" />
            ) : (
              <div className="w-full h-full flex items-center justify-center rounded border border-border-subtle bg-surface-subtle text-ink-faint">
                <Icon name="lots" size={32} />
              </div>
            )}
          </div>
        </div>

        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight text-ink">{lot.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <span className="text-xs text-ink-faint">Seller identity withheld</span>
            {loggedIn && lot.status === "active" && (
              <MessageButton
                referenceType="market_lot"
                referenceId={lot.id}
                label="Message seller"
                size="sm"
              />
            )}
          </div>

          <p className="text-3xl font-mono tabular-nums font-bold text-accent mt-4"><Money value={price} /></p>
          <p className="text-xs font-mono tabular-nums text-ink-faint mt-1">
            {lot.items.length} card{lot.items.length !== 1 ? "s" : ""} &middot;{" "}
            {lot.items.reduce((s, i) => s + i.quantity, 0)} total units
          </p>

          {lot.description && (
            <div className="mt-4 text-sm text-ink-muted whitespace-pre-wrap">{lot.description}</div>
          )}

          <div className="mt-6 mb-3">
            {lot.status === "sold" ? (
              <span className="inline-block px-5 py-3 bg-surface-elevated border border-border-subtle text-ink-faint font-bold rounded-lg">Sold</span>
            ) : lot.status === "cancelled" ? (
              <span className="inline-block px-5 py-3 bg-surface-elevated border border-border-subtle text-ink-faint font-bold rounded-lg">Cancelled</span>
            ) : (
              // Purchases are paused (mirrors the guard in
              // lib/market/lots.ts): no fulfilment path exists after
              // payment, so the buy action would take money and strand
              // the trade. Browsing stays live.
              <div className="space-y-2">
                <button
                  disabled
                  title="Lot purchases are paused"
                  className="px-5 py-3 bg-surface-elevated border border-border-subtle text-ink-faint font-bold rounded-lg cursor-not-allowed"
                >
                  Lot purchases paused
                </button>
                <p className="text-xs text-ink-muted max-w-md leading-relaxed">
                  Lot purchases are paused while fulfilment is rebuilt &mdash; buying a lot today
                  would take your money with no shipping flow behind it. Browse the{" "}
                  <Link href="/market" className="text-accent hover:underline">singles market</Link>{" "}
                  meanwhile.
                </p>
              </div>
            )}
          </div>

          {error && (
            <p className="text-sm text-danger mb-3">{error}</p>
          )}

          <div className="mt-6">
            <h2 className="text-sm font-display font-bold text-ink-muted uppercase tracking-wide mb-2">Contents</h2>
            <div className="wardrobe-mat rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-ink-faint uppercase border-b border-border-subtle">
                    <th className="text-left p-3">Card</th>
                    <th className="text-left p-3">SKU</th>
                    <th className="text-right p-3">Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {lot.items.map((it) => (
                    <tr key={it.sku} className="border-b border-border-subtle/50">
                      <td className="p-3 text-ink truncate">{it.card_name || it.sku}</td>
                      <td className="p-3 text-[11px] font-mono text-ink-faint truncate max-w-[240px]">{it.sku}</td>
                      <td className="p-3 text-right font-mono tabular-nums text-ink-muted">{it.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
