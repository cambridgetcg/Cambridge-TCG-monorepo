"use client";

import { useCallback, useEffect, useState } from "react";

import { Audience } from "@/lib/ui";
interface Prize {
  kind: "raffle" | "mystery_box" | "pack";
  id: string;
  label: string;
  prize_description: string | null;
  user_id: string;
  user_email: string;
  user_name: string | null;
  shipping_address: string | null;
  shipping_collected_at: string | null;
  tracking_number: string | null;
  carrier: string | null;
  shipped_at: string | null;
  fulfilled: boolean;
  won_at: string;
}

const CARRIER_OPTIONS = ["Royal Mail", "Evri", "DPD", "ParcelForce", "UPS", "FedEx"];

export default function AdminPrizesPage() {
  const [authed, setAuthed] = useState(true);
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch("/api/admin/prizes");
    if (r.status === 401) { setAuthed(false); setLoading(false); return; }
    setAuthed(true);
    if (r.ok) setPrizes((await r.json()).prizes || []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/admin/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) { setLoginError("Wrong password."); return; }
    setPassword(""); load();
  }

  async function ship(p: Prize) {
    const carrier = window.prompt(
      `Carrier (optional):\n${CARRIER_OPTIONS.join(" · ")}`,
      p.carrier ?? "",
    );
    if (carrier === null) return; // user cancelled
    const tracking = window.prompt("Tracking number (optional):", p.tracking_number ?? "");
    if (tracking === null) return;
    setActing(`${p.kind}:${p.id}`);
    try {
      await fetch("/api/admin/prizes", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: p.kind,
          id: p.id,
          action: "ship",
          trackingNumber: tracking || undefined,
          carrier: carrier || undefined,
        }),
      });
      load();
    } finally { setActing(null); }
  }

  async function fulfill(p: Prize) {
    if (!confirm("Mark this prize as fully fulfilled? This is the final step.")) return;
    setActing(`${p.kind}:${p.id}`);
    try {
      await fetch("/api/admin/prizes", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: p.kind, id: p.id, action: "fulfill" }),
      });
      load();
    } finally { setActing(null); }
  }

  async function bulkShip(prizes: Prize[]) {
    if (prizes.length === 0) return;
    const carrier = window.prompt(
      `Carrier for all ${prizes.length} prizes:\n${CARRIER_OPTIONS.join(" · ")}`,
      prizes[0].carrier ?? "",
    );
    if (carrier === null) return;
    const tracking = window.prompt(
      `Single tracking number for all ${prizes.length} prizes (optional):`,
      "",
    );
    if (tracking === null) return;

    const key = `bulk:${prizes.map(p => `${p.kind}:${p.id}`).join(",")}`;
    setActing(key);
    try {
      const r = await fetch("/api/admin/prizes/bulk-ship", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prizes: prizes.map(p => ({ kind: p.kind, id: p.id })),
          tracking: tracking || undefined,
          carrier: carrier || undefined,
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) { alert(data.error || "Bulk ship failed."); return; }
      setSelected(new Set());
      load();
    } finally { setActing(null); }
  }

  async function undo(p: Prize) {
    if (!confirm("Undo the ship action? Tracking + carrier + shipped_at will be cleared.")) return;
    setActing(`${p.kind}:${p.id}`);
    try {
      const r = await fetch("/api/admin/prizes/undo", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: p.kind, id: p.id }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        alert(data.error || "Undo failed.");
        return;
      }
      load();
    } finally { setActing(null); }
  }

  if (!authed) {
    return (
      <main className="min-h-screen bg-neutral-950 flex items-center justify-center">
      <Audience kind="operator" />
        <form onSubmit={handleLogin} className="w-full max-w-sm px-4">
          <h1 className="text-2xl font-bold text-white text-center mb-8">Prize Fulfillment</h1>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="Admin password"
            className="w-full px-4 py-3 bg-neutral-900 border border-neutral-800 rounded-lg text-white" />
          {loginError && <p className="text-red-400 text-sm mt-2">{loginError}</p>}
          <button type="submit" className="w-full mt-4 px-4 py-3 bg-amber-500 text-black rounded-lg font-bold">
            Sign in
          </button>
        </form>
      </main>
    );
  }

  // Split into ready-to-ship vs awaiting address
  const readyToShip = prizes.filter((p) => p.shipping_collected_at && !p.shipped_at);
  const shipped = prizes.filter((p) => p.shipped_at && !p.fulfilled);
  const waitingAddress = prizes.filter((p) => !p.shipping_collected_at);

  // Cluster ready-to-ship by (user_id, shipping_address) so admin
  // sees "N prizes to one envelope" bundles. Same user + same address
  // = one shipment.
  const readyClusters = new Map<string, Prize[]>();
  for (const p of readyToShip) {
    const key = `${p.user_id}:${(p.shipping_address ?? "").trim()}`;
    const arr = readyClusters.get(key) ?? [];
    arr.push(p);
    readyClusters.set(key, arr);
  }
  const selectedPrizes = readyToShip.filter((p) => selected.has(`${p.kind}:${p.id}`));
  const selectedUserIds = new Set(selectedPrizes.map((p) => p.user_id));
  const selectionCoherent = selectedUserIds.size <= 1;

  return (
    <main className="min-h-screen bg-neutral-950">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-black text-white mb-1">Prize Fulfillment</h1>
        <p className="text-sm text-neutral-400 mb-6">
          {prizes.length} unfulfilled across raffles + mystery boxes + packs
        </p>

        {loading ? (
          <p className="text-sm text-neutral-500">Loading...</p>
        ) : (
          <>
            {readyClusters.size > 0 && (
              <section className="mb-8">
                <h2 className="text-sm font-bold text-neutral-300 uppercase tracking-wide mb-3">
                  Ready to ship ({readyToShip.length})
                </h2>
                <div className="space-y-4">
                  {[...readyClusters.entries()].map(([key, clusterPrizes]) => (
                    <ClusterCard
                      key={key}
                      prizes={clusterPrizes}
                      selected={selected}
                      onToggleSelect={(p) => setSelected(prev => {
                        const next = new Set(prev);
                        const id = `${p.kind}:${p.id}`;
                        if (next.has(id)) next.delete(id); else next.add(id);
                        return next;
                      })}
                      onShip={ship}
                      onBulkShip={bulkShip}
                      acting={acting}
                    />
                  ))}
                </div>
              </section>
            )}
            <Section title={`Shipped — awaiting confirmation (${shipped.length})`} prizes={shipped}
              renderActions={(p) => {
                const shippedAtMs = p.shipped_at ? new Date(p.shipped_at).getTime() : 0;
                const ageMs = shippedAtMs ? Date.now() - shippedAtMs : Infinity;
                const undoable = ageMs < 30 * 60 * 1000;
                return (
                  <div className="flex gap-2 items-center flex-wrap">
                    <button onClick={() => fulfill(p)} disabled={acting === `${p.kind}:${p.id}`}
                      className="px-3 py-1.5 text-xs font-bold bg-emerald-500 text-black rounded-md hover:bg-emerald-400 disabled:opacity-50">
                      Mark fulfilled
                    </button>
                    {undoable && (
                      <button onClick={() => undo(p)} disabled={acting === `${p.kind}:${p.id}`}
                        className="text-xs text-amber-400 hover:text-amber-300 underline disabled:opacity-50"
                        title="Undo within 30 min of ship">
                        Undo
                      </button>
                    )}
                  </div>
                );
              }} />
            <Section title={`Awaiting customer address (${waitingAddress.length})`} prizes={waitingAddress}
              renderActions={() => (
                <span className="text-xs text-neutral-500">Customer hasn&rsquo;t entered shipping yet</span>
              )} />
          </>
        )}
      </div>

      {/* Sticky selection bar — bulk ship across clusters */}
      {selected.size > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-40 bg-neutral-950/95 backdrop-blur border-t border-amber-500/40 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="text-sm">
            <span className="font-bold text-amber-400">{selected.size}</span> selected
            {!selectionCoherent && (
              <span className="ml-3 text-xs text-red-400">
                (bulk ship requires same user — clear selection to retry)
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setSelected(new Set())}
              className="text-xs px-3 py-2 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded-lg transition-colors"
            >
              Clear
            </button>
            <button
              onClick={() => bulkShip(selectedPrizes)}
              disabled={!selectionCoherent || selectedPrizes.length === 0}
              className="text-xs px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-lg transition-colors disabled:opacity-50"
            >
              Bulk ship {selected.size} prize{selected.size === 1 ? "" : "s"}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function ClusterCard({
  prizes, selected, onToggleSelect, onShip, onBulkShip, acting,
}: {
  prizes: Prize[];
  selected: Set<string>;
  onToggleSelect: (p: Prize) => void;
  onShip: (p: Prize) => void;
  onBulkShip: (prizes: Prize[]) => void;
  acting: string | null;
}) {
  const head = prizes[0];
  const isBundle = prizes.length > 1;
  return (
    <div className={`bg-neutral-900 rounded-xl p-4 ${isBundle ? "border border-amber-500/30" : ""}`}>
      <div className="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
        <div className="min-w-0">
          {isBundle && (
            <span className="text-xs bg-amber-500/20 text-amber-400 rounded px-2 py-0.5 font-bold uppercase tracking-wider mr-2">
              {prizes.length} PRIZES · ONE ENVELOPE
            </span>
          )}
          <span className="text-xs text-neutral-300">{head.user_name || head.user_email}</span>
        </div>
        {isBundle && (
          <button
            onClick={() => onBulkShip(prizes)}
            disabled={acting?.startsWith("bulk:")}
            className="text-xs px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded transition-colors disabled:opacity-50"
          >
            Ship all {prizes.length} together
          </button>
        )}
      </div>

      {head.shipping_address && (
        <p className="text-xs text-neutral-400 mb-3 whitespace-pre-wrap">{head.shipping_address}</p>
      )}

      <div className="space-y-2">
        {prizes.map((p) => (
          <div key={`${p.kind}:${p.id}`} className="flex items-start gap-3 p-2 rounded bg-neutral-950/40">
            <input
              type="checkbox"
              checked={selected.has(`${p.kind}:${p.id}`)}
              onChange={() => onToggleSelect(p)}
              className="mt-1 accent-amber-500"
            />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-neutral-500 capitalize">{p.kind.replace("_", " ")}</p>
              <p className="text-sm font-bold text-white truncate">{p.label}</p>
              {p.prize_description && <p className="text-xs text-neutral-400 truncate">{p.prize_description}</p>}
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[10px] text-neutral-500">{new Date(p.won_at).toLocaleDateString("en-GB")}</p>
              <button
                onClick={() => onShip(p)}
                disabled={acting === `${p.kind}:${p.id}`}
                className="mt-1 px-2 py-1 text-[11px] bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded disabled:opacity-50"
              >
                Ship solo
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Section({ title, prizes, renderActions }: {
  title: string; prizes: Prize[]; renderActions: (p: Prize) => React.ReactNode;
}) {
  if (prizes.length === 0) return null;
  return (
    <section className="mb-8">
      <h2 className="text-sm font-bold text-neutral-300 uppercase tracking-wide mb-3">{title}</h2>
      <div className="bg-neutral-900 rounded-xl divide-y divide-neutral-800">
        {prizes.map((p) => (
          <div key={`${p.kind}:${p.id}`} className="p-4">
            <div className="flex items-baseline justify-between mb-1 gap-3">
              <div className="min-w-0">
                <p className="text-xs text-neutral-500 capitalize">{p.kind.replace("_", " ")}</p>
                <p className="text-sm font-bold text-white truncate">{p.label}</p>
                {p.prize_description && <p className="text-xs text-neutral-400 truncate">{p.prize_description}</p>}
              </div>
              <div className="shrink-0 text-right">
                <p className="text-xs text-neutral-300">{p.user_name || p.user_email}</p>
                <p className="text-[10px] text-neutral-500">{new Date(p.won_at).toLocaleDateString("en-GB")}</p>
              </div>
            </div>
            {p.shipping_address && (
              <p className="text-xs text-neutral-400 mt-2 whitespace-pre-wrap">{p.shipping_address}</p>
            )}
            {p.tracking_number && (
              <p className="text-xs text-emerald-400 mt-1 font-mono">
                {p.carrier && <span className="text-neutral-500 mr-1">{p.carrier}</span>}
                {p.tracking_number}
              </p>
            )}
            <div className="mt-3">{renderActions(p)}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
