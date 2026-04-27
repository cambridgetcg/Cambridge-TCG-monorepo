"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

interface Proof {
  id: string;
  tier: string;
  earned_from: string;
  rolled_rarity: string | null;
  rolled_sku: string | null;
  rolled_spot_gbp: string | null;
  commitment: string;
  server_seed: string | null;
  client_seed: string;
  nonce: number;
  rarity_weights: Record<string, number>;
  resolved_at: string;
}

// SubtleCrypto SHA-256 → lowercase hex (matches the server's node crypto
// behaviour byte-for-byte; no library differences).
async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Mirror of src/lib/bounty/rng.ts rollFloat() — takes the first 13 hex chars
// of sha256(seed:client:nonce), treats as a 52-bit int, divides by 2^52.
function hexToFloat(hashHex: string): number {
  const slice = hashHex.slice(0, 13);
  const intValue = parseInt(slice, 16);
  return intValue / 0x10000000000000;
}

// Mirror of src/lib/bounty/rng.ts pickWeighted() — deterministic weighted pick.
function pickWeighted<T extends string>(weights: Record<T, number>, roll: number): T {
  const entries = Object.entries(weights) as [T, number][];
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let cursor = roll * total;
  for (const [key, w] of entries) {
    cursor -= w;
    if (cursor <= 0) return key;
  }
  return entries[entries.length - 1][0];
}

interface Verification {
  commitmentOk: boolean;
  computedCommit: string;
  rarityRoll: number;
  predictedRarity: string | null;
  rarityOk: boolean | null;
}

export default function VerifyPullPage() {
  const params = useParams();
  const id = params.id as string;

  const [proof, setProof] = useState<Proof | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [verification, setVerification] = useState<Verification | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/bounty/pulls/${id}/proof`);
        if (!res.ok) {
          if (!cancelled) setNotFound(true);
          return;
        }
        const p: Proof = await res.json();
        if (cancelled) return;
        setProof(p);

        // Run verification right away if the server seed is revealed.
        if (p.server_seed) {
          const computedCommit = await sha256Hex(p.server_seed);
          const commitmentOk = computedCommit === p.commitment;

          const rarityHash = await sha256Hex(`${p.server_seed}:${p.client_seed}:${p.nonce}`);
          const rarityRoll = hexToFloat(rarityHash);
          const predictedRarity = p.rarity_weights
            ? pickWeighted(p.rarity_weights, rarityRoll)
            : null;
          const rarityOk = predictedRarity != null && predictedRarity === p.rolled_rarity;

          if (!cancelled) {
            setVerification({
              commitmentOk,
              computedCommit,
              rarityRoll,
              predictedRarity,
              rarityOk,
            });
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <div className="mx-auto max-w-2xl px-4 py-10">
        <div className="mb-8">
          <Link href="/bounty" className="text-sm text-neutral-500 hover:text-neutral-300">&larr; Bounty Board</Link>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mt-3 mb-1">
            Provably Fair Verification
          </h1>
          <p className="text-sm text-neutral-400">
            Every Bounty Pull publishes a SHA-256 commitment *before* the roll and
            the seed *after*. Anyone can verify the draw was not rigged — this
            page runs the check in your browser using the Web Crypto API. No data
            leaves your device.
          </p>
        </div>

        {loading && (
          <div className="py-12 text-center">
            <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        )}

        {notFound && !loading && (
          <div className="bg-red-900/30 border border-red-700/40 text-red-300 rounded-lg px-4 py-3 text-sm">
            No pull with that ID. Check the URL — the proof endpoint is
            <code className="mx-1">/api/bounty/pulls/&lt;id&gt;/proof</code>.
          </div>
        )}

        {proof && !loading && (
          <>
            {/* Summary */}
            <section className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 mb-5">
              <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-500 mb-3">Pull</h2>
              <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-sm">
                <div className="text-neutral-500">Tier</div>
                <div className="font-mono">{proof.tier}</div>
                <div className="text-neutral-500">Rolled rarity</div>
                <div className="font-mono text-amber-400">{proof.rolled_rarity ?? "—"}</div>
                <div className="text-neutral-500">Rolled SKU</div>
                <div className="font-mono">{proof.rolled_sku ?? "—"}</div>
                {proof.rolled_spot_gbp && (
                  <>
                    <div className="text-neutral-500">Spot value</div>
                    <div>£{parseFloat(proof.rolled_spot_gbp).toFixed(2)}</div>
                  </>
                )}
                <div className="text-neutral-500">Resolved at</div>
                <div>{new Date(proof.resolved_at).toLocaleString()}</div>
              </div>
            </section>

            {/* Proof values */}
            <section className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 mb-5">
              <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-500 mb-3">Proof values</h2>
              <div className="space-y-3 text-xs font-mono">
                <KV label="commitment (published pre-roll)" value={proof.commitment} />
                <KV label="server_seed (revealed post-roll)" value={proof.server_seed ?? "(not revealed)"} />
                <KV label="client_seed" value={proof.client_seed} />
                <KV label="nonce" value={String(proof.nonce)} />
              </div>
              <div className="mt-4 text-xs text-neutral-500">
                <p className="mb-1"><strong className="text-neutral-400">Weights used:</strong></p>
                <div className="font-mono text-[11px] bg-neutral-800/60 rounded px-3 py-2">
                  {Object.entries(proof.rarity_weights ?? {}).map(([r, w]) => (
                    <span key={r} className="mr-3">{r}={w}</span>
                  ))}
                </div>
              </div>
            </section>

            {/* Verification result */}
            <section className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 mb-5">
              <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-500 mb-3">Verification</h2>
              {!proof.server_seed && (
                <p className="text-sm text-neutral-400">
                  Server seed isn&apos;t revealed — this pull may not have resolved. Try again later.
                </p>
              )}
              {verification && (
                <div className="space-y-4 text-sm">
                  <Check
                    passed={verification.commitmentOk}
                    label="sha256(server_seed) matches published commitment"
                  >
                    <p className="text-[11px] font-mono text-neutral-500 break-all mt-1">
                      computed = {verification.computedCommit}
                    </p>
                    <p className="text-[11px] font-mono text-neutral-500 break-all">
                      claimed  = {proof.commitment}
                    </p>
                  </Check>
                  <Check
                    passed={verification.rarityOk === true}
                    label="Rarity pick from sha256(seed:client:nonce) matches the roll"
                  >
                    <p className="text-[11px] font-mono text-neutral-500 mt-1">
                      roll = {verification.rarityRoll.toFixed(6)} → {verification.predictedRarity}
                      {" (claimed: "}{proof.rolled_rarity}{")"}
                    </p>
                  </Check>
                  {verification.commitmentOk && verification.rarityOk && (
                    <p className="text-emerald-400 text-sm font-semibold pt-2 border-t border-neutral-800">
                      ✓ Both checks passed — this pull is provably fair.
                    </p>
                  )}
                  {(!verification.commitmentOk || verification.rarityOk === false) && (
                    <p className="text-red-400 text-sm font-semibold pt-2 border-t border-red-900/40">
                      ✗ Verification failed. If you see this on a real pull, please contact us.
                    </p>
                  )}
                </div>
              )}
            </section>

            {/* How to verify yourself */}
            <section className="bg-neutral-900/40 border border-neutral-800/60 rounded-xl p-5 mb-5 text-xs text-neutral-500">
              <h3 className="text-sm font-bold text-neutral-300 mb-2">Verify it yourself</h3>
              <p className="mb-3 leading-relaxed">
                Don&apos;t trust this page — run the checks on your own machine. Any SHA-256
                tool (openssl, Python hashlib, online hashers) will do.
              </p>
              <div className="font-mono bg-neutral-900 rounded px-3 py-2 mb-2">
                echo -n &quot;{proof.server_seed ?? "<seed>"}&quot; | shasum -a 256
              </div>
              <p className="mb-3">Should match the commitment above.</p>
              <div className="font-mono bg-neutral-900 rounded px-3 py-2 mb-2">
                echo -n &quot;{proof.server_seed ?? "<seed>"}:{proof.client_seed}:{proof.nonce}&quot; | shasum -a 256
              </div>
              <p>
                Take the first 13 hex characters, parse as an integer, divide by
                <code className="mx-1">2^52</code>. The result is the roll that
                picked the rarity via the weights above.
              </p>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-neutral-600 mb-0.5">{label}</p>
      <p className="text-neutral-300 break-all leading-relaxed">{value}</p>
    </div>
  );
}

function Check({
  passed,
  label,
  children,
}: {
  passed: boolean;
  label: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={`border-l-2 pl-3 ${passed ? "border-emerald-500" : "border-red-500"}`}>
      <p className={`text-sm font-semibold ${passed ? "text-emerald-400" : "text-red-400"}`}>
        {passed ? "✓" : "✗"} {label}
      </p>
      {children}
    </div>
  );
}
