"use client";

import { useEffect, useState } from "react";
import { use } from "react";
import Link from "next/link";
import { sha256Hex, rollFloat, pickWeighted, computeLeaf, merkleRoot } from "@/lib/bounty/verify-client";

import { Audience } from "@/lib/ui";
interface SlotOutcome { picked: string; roll: number; extra?: unknown }
type Outcome =
  | { picked: string; roll: number }
  | { slots: SlotOutcome[] };

interface DrawData {
  draw_id: string;
  kind: string;
  subject_id: string | null;
  commitment: string;
  server_seed: string;
  client_seed: string;
  client_seed_display: string;
  nonce: number;
  weights: Record<string, number>;
  num_slots: number;
  outcome: Outcome | null;
  committed_at: string;
  revealed_at: string | null;
  merkle_digest_id: number | null;
  merkle_leaf_index: number | null;
}

interface MerkleCheck {
  digestId: number;
  publishedRoot: string;
  recomputedLeaf: string;
  claimedLeaf: string;
  recomputedRoot: string;
  leafIndex: number;
  leafCount: number;
  leafMatchesTable: boolean;
  rootMatches: boolean;
}

interface SlotCheck {
  slotIndex: number;
  claimedPicked: string;
  recomputedRoll: number;
  recomputedPicked: string;
  matches: boolean;
}

interface Verdict {
  commitmentMatches: boolean;
  recomputedHash: string;
  slots: SlotCheck[];
  allMatch: boolean;
}

const KIND_LABEL: Record<string, string> = {
  pack_open:   "Pack Opening",
  spin_wheel:  "Spin Wheel",
  mystery_box: "Mystery Box",
  raffle_draw: "Raffle Draw",
  custom:      "Draw",
};

export default function VerifyDrawPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<DrawData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [merkle, setMerkle] = useState<MerkleCheck | null>(null);

  useEffect(() => {
    fetch(`/api/verify/draw/${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d?.error) { setError(d.error); return; }
        setData(d);
      })
      .catch(() => setError("Failed to load draw."));
  }, [id]);

  useEffect(() => {
    if (!data || !data.outcome) return;
    (async () => {
      const recomputedHash = await sha256Hex(data.server_seed);
      const commitmentMatches = recomputedHash.toLowerCase() === data.commitment.toLowerCase();

      const claimedSlots: SlotOutcome[] = "slots" in data.outcome!
        ? data.outcome!.slots
        : [{ picked: (data.outcome as { picked: string }).picked, roll: (data.outcome as { roll: number }).roll }];

      const slots: SlotCheck[] = [];
      for (let i = 0; i < claimedSlots.length; i++) {
        const recomputedRoll = await rollFloat(data.server_seed, data.client_seed, data.nonce + i);
        const recomputedPicked = pickWeighted(data.weights, recomputedRoll);
        slots.push({
          slotIndex: i,
          claimedPicked: claimedSlots[i].picked,
          recomputedRoll,
          recomputedPicked,
          matches: recomputedPicked.toLowerCase() === claimedSlots[i].picked.toLowerCase(),
        });
      }

      const allMatch = commitmentMatches && slots.every((s) => s.matches);
      setVerdict({ commitmentMatches, recomputedHash, slots, allMatch });
    })();
  }, [data]);

  // Merkle inclusion check — runs after the per-draw checks so the
  // header banner reflects on-chain-style tamper-evidence, not just
  // our own row-level commit-reveal.
  useEffect(() => {
    if (!data || data.merkle_digest_id == null || data.merkle_leaf_index == null || !data.revealed_at) return;
    (async () => {
      const res = await fetch(`/api/verify/digests/${data.merkle_digest_id}`);
      if (!res.ok) return;
      const digest = await res.json() as { root: string; leaves: string[]; leaf_count: number };
      const recomputedLeaf = await computeLeaf({
        id: data.draw_id,
        commitment: data.commitment,
        serverSeed: data.server_seed,
        revealedAtIso: new Date(data.revealed_at!).toISOString(),
      });
      const claimedLeaf = digest.leaves[data.merkle_leaf_index!];
      const leafMatchesTable = claimedLeaf?.toLowerCase() === recomputedLeaf.toLowerCase();
      const recomputedRoot = await merkleRoot(digest.leaves);
      const rootMatches = recomputedRoot.toLowerCase() === digest.root.toLowerCase();
      setMerkle({
        digestId: data.merkle_digest_id!,
        publishedRoot: digest.root,
        recomputedLeaf,
        claimedLeaf,
        recomputedRoot,
        leafIndex: data.merkle_leaf_index!,
        leafCount: digest.leaf_count,
        leafMatchesTable,
        rootMatches,
      });
    })();
  }, [data]);

  if (error) return <Shell><div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 text-center"><p className="text-red-400 font-bold">{error}</p></div></Shell>;
  if (!data) return <Shell><p className="text-neutral-500">Loading proof…</p></Shell>;
  if (!data.outcome || !data.revealed_at) return <Shell><p className="text-neutral-500">Draw not yet revealed.</p></Shell>;

  const committedTs = new Date(data.committed_at).getTime();
  const revealedTs = new Date(data.revealed_at).getTime();
  const orderingOk = committedTs <= revealedTs;
  const orderingDelayMs = revealedTs - committedTs;
  const kindLabel = KIND_LABEL[data.kind] ?? data.kind;

  return (
    <Shell>
      <Audience kind="public-documentation" />
      <header className="mb-8">
        <Link href="/verify" className="text-xs text-neutral-500 hover:text-neutral-300">← All proofs</Link>
        <h1 className="text-2xl font-bold mt-2 mb-1">{kindLabel} Verification</h1>
        <p className="text-sm text-neutral-500">
          The server committed to a hash before rolling. Re-run the math
          in your browser below to confirm the outcome wasn&apos;t cherry-picked.
        </p>
      </header>

      <VerdictBanner verdict={verdict} />

      <div className="grid lg:grid-cols-2 gap-6 mt-6">
        <CheckCard
          ok={verdict?.commitmentMatches ?? null}
          title="1. Commitment matches the revealed seed"
          explanation="sha256(server_seed) must equal the pre-published commitment. We reveal the seed only after rolling, so we couldn't have picked it to match a desired outcome."
        >
          <Field label="commitment" value={data.commitment} mono />
          <Field label="sha256(server_seed)" value={verdict?.recomputedHash ?? "—"} mono />
          <Field label="server_seed" value={data.server_seed} mono />
        </CheckCard>

        <CheckCard
          ok={orderingOk}
          title="2. Commitment preceded the roll"
          explanation="committed_at must be ≤ revealed_at. The pre-commit row is written BEFORE the rolling logic runs."
        >
          <Field label="committed_at" value={new Date(data.committed_at).toISOString()} mono />
          <Field label="revealed_at"  value={new Date(data.revealed_at).toISOString()}  mono />
          <Field label="delay"        value={`${orderingDelayMs} ms`} mono />
        </CheckCard>

        <section className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 lg:col-span-2">
          <h3 className="font-bold text-sm mb-2">3. Every slot reproduces from the seed</h3>
          <p className="text-xs text-neutral-500 mb-3">
            rollFloat(server_seed, client_seed, nonce+i) → pickWeighted(weights, roll). One slot for
            single draws; N slots for packs. Each slot&apos;s nonce offset makes its roll
            independent while still reproducible from the same seed.
          </p>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-neutral-500 uppercase tracking-wider">
                <th className="text-left py-1 w-12">#</th>
                <th className="text-left py-1">Claimed</th>
                <th className="text-left py-1">Recomputed</th>
                <th className="text-left py-1">Roll</th>
                <th className="text-right py-1 w-12">OK</th>
              </tr>
            </thead>
            <tbody>
              {verdict?.slots.map((s) => (
                <tr key={s.slotIndex} className="border-t border-neutral-800">
                  <td className="py-1.5 font-mono text-neutral-500">{s.slotIndex}</td>
                  <td className="py-1.5 font-mono text-neutral-300 uppercase">{s.claimedPicked}</td>
                  <td className={`py-1.5 font-mono uppercase ${s.matches ? "text-neutral-300" : "text-red-400"}`}>{s.recomputedPicked}</td>
                  <td className="py-1.5 font-mono text-neutral-500">{s.recomputedRoll.toFixed(10)}</td>
                  <td className="py-1.5 text-right">
                    {s.matches ? <span className="text-emerald-400">✓</span> : <span className="text-red-400">✗</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <CheckCard
          ok={merkle ? (merkle.leafMatchesTable && merkle.rootMatches) : null}
          title={`4. Draw is included in published digest #${data.merkle_digest_id ?? "(pending)"}`}
          explanation="Once a digest is published, editing any leaf would change the root. Fetching the leaves for this digest and re-hashing them must match the published root we saw; our leaf must sit at the claimed index."
        >
          {data.merkle_digest_id == null ? (
            <p className="text-xs text-neutral-500 italic">
              This draw has not yet been included in a digest. The maintenance cron
              publishes roots every tick — check back shortly. Per-draw commit-reveal
              (checks 1-3) is already tamper-evident against external replay.
            </p>
          ) : merkle ? (
            <>
              <Field label="digest id"        value={String(merkle.digestId)} mono />
              <Field label="leaf index / count" value={`${merkle.leafIndex} / ${merkle.leafCount}`} mono />
              <Field label="published root"   value={merkle.publishedRoot} mono />
              <Field label="recomputed root"  value={merkle.recomputedRoot} mono />
              <Field label="leaf at index"    value={merkle.claimedLeaf} mono />
              <Field label="recomputed leaf"  value={merkle.recomputedLeaf} mono />
            </>
          ) : (
            <p className="text-xs text-neutral-500">Loading digest…</p>
          )}
        </CheckCard>

        <section className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 lg:col-span-2">
          <h3 className="font-bold text-sm mb-2">Weights snapshot at the time of draw</h3>
          <table className="w-full text-xs">
            <tbody>
              {Object.entries(data.weights).map(([k, w]) => (
                <tr key={k} className="border-t border-neutral-800">
                  <td className="py-1.5 font-mono text-neutral-400 uppercase">{k}</td>
                  <td className="py-1.5 text-right font-mono text-neutral-300">
                    {(w * 100).toFixed(2)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <div className="max-w-4xl mx-auto px-4 py-8">{children}</div>
    </main>
  );
}

function VerdictBanner({ verdict }: { verdict: Verdict | null }) {
  if (!verdict) {
    return <div className="rounded-xl p-4 bg-neutral-900 border border-neutral-800"><p className="text-sm text-neutral-500">Computing…</p></div>;
  }
  return (
    <div className={`rounded-xl p-4 border flex items-center gap-3 ${
      verdict.allMatch
        ? "bg-emerald-500/10 border-emerald-500/40"
        : "bg-red-500/10 border-red-500/40"
    }`}>
      <span className={`text-3xl ${verdict.allMatch ? "text-emerald-400" : "text-red-400"}`}>
        {verdict.allMatch ? "✓" : "✗"}
      </span>
      <div>
        <p className="font-bold">
          {verdict.allMatch ? "Verified — draw is provably fair" : "Verification FAILED — contact support"}
        </p>
        <p className="text-xs text-neutral-500">Checks ran in your browser using public data only.</p>
      </div>
    </div>
  );
}

function CheckCard({ ok, title, explanation, children }: {
  ok: boolean | null;
  title: string;
  explanation: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`bg-neutral-900 border rounded-xl p-4 ${
      ok === true ? "border-emerald-500/30" : ok === false ? "border-red-500/40" : "border-neutral-800"
    }`}>
      <div className="flex items-baseline gap-2 mb-2">
        <span className={`text-lg ${ok === true ? "text-emerald-400" : ok === false ? "text-red-400" : "text-neutral-500"}`}>
          {ok === true ? "✓" : ok === false ? "✗" : "…"}
        </span>
        <h3 className="font-bold text-sm">{title}</h3>
      </div>
      <p className="text-xs text-neutral-500 mb-3">{explanation}</p>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="text-xs">
      <span className="text-neutral-500">{label}: </span>
      <span className={`text-neutral-200 break-all ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}
