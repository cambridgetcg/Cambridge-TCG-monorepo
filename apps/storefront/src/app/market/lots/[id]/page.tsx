"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Icon, Money } from "@/lib/ui";

interface Lot {
  id: string;
  title: string;
  description: string | null;
  price: string;
  image_url: string | null;
  status: string;
  seller_username: string | null;
  seller_name: string | null;
  items: Array<{ sku: string; card_name: string | null; quantity: number }>;
}

export default function LotDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [lot, setLot] = useState<Lot | null>(null);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState(false);
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

  async function handleBuy() {
    setBuying(true);
    setError(null);
    try {
      const res = await fetch(`/api/market/lots/${id}/buy`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === "VERIFICATION_REQUIRED") {
          setError("UK verification required. Visit /account/verify first.");
        } else {
          setError(data.error || "Failed to start checkout");
        }
        return;
      }
      window.location.href = data.url;
    } finally {
      setBuying(false);
    }
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><p className="text-ink-faint text-sm">Loading...</p></div>;
  if (!lot) return <div className="min-h-screen flex items-center justify-center"><p className="text-ink-faint text-sm">{error || "Not found"}</p></div>;

  const price = parseFloat(lot.price);
  const canBuy = lot.status === "active";

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
          {lot.seller_username && (
            <p className="text-sm text-ink-faint mt-1">
              by{" "}
              <Link href={`/u/${lot.seller_username}`} className="text-accent hover:underline">
                {lot.seller_name || `@${lot.seller_username}`}
              </Link>
            </p>
          )}

          <p className="text-3xl font-mono tabular-nums font-bold text-accent mt-4"><Money value={price} /></p>
          <p className="text-xs font-mono tabular-nums text-ink-faint mt-1">
            {lot.items.length} card{lot.items.length !== 1 ? "s" : ""} &middot;{" "}
            {lot.items.reduce((s, i) => s + i.quantity, 0)} total units
          </p>

          {lot.description && (
            <div className="mt-4 text-sm text-ink-muted whitespace-pre-wrap">{lot.description}</div>
          )}

          <div className="mt-6 mb-3">
            {!loggedIn ? (
              <Link href="/login" className="inline-block px-5 py-3 bg-accent text-white font-bold rounded-lg hover:bg-accent-strong transition">
                Sign in to buy
              </Link>
            ) : lot.status === "sold" ? (
              <span className="inline-block px-5 py-3 bg-surface-elevated border border-border-subtle text-ink-faint font-bold rounded-lg">Sold</span>
            ) : lot.status === "cancelled" ? (
              <span className="inline-block px-5 py-3 bg-surface-elevated border border-border-subtle text-ink-faint font-bold rounded-lg">Cancelled</span>
            ) : (
              <button
                onClick={handleBuy}
                disabled={buying || !canBuy}
                className="px-5 py-3 bg-accent text-white font-bold rounded-lg hover:bg-accent-strong transition disabled:opacity-50"
              >
                {buying ? "Starting..." : <>Buy lot for <span className="font-mono tabular-nums"><Money value={price} /></span></>}
              </button>
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
