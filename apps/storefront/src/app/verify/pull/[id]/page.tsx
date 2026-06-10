"use client";

import { useEffect, useState } from "react";
import { use } from "react";
import Image from "next/image";
import Link from "next/link";
import { verifyPull, type VerificationResult, computeLeaf, merkleRoot } from "@/lib/bounty/verify-client";
import { QUEST_EVENT } from "@/lib/quests";

import { Audience } from "@/lib/ui";
interface PullData {
  pull_id: string;
  tier: string;
  earned_from: string;
  commitment: string;
  server_seed: string;
  client_seed: string;
  client_seed_display: string;
  nonce: number;
  rolled_rarity: string;
  rolled_sku: string | null;
  rolled_spot_gbp: string | null;
  rarity_weights: Record<string, number>;
  committed_at: string;
  revealed_at: string;
  resolved_at: string;
  merkle_digest_id: number | null;
  merkle_leaf_index: number | null;
  vault_item: {
    id: string;
    card_name: string;
    card_number: string | null;
    image_url: string | null;
  } | null;
}

export default function VerifyPullPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<PullData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verification, setVerification] = useState<VerificationResult | null>(null);
  const [merkle, setMerkle] = useState<{
    digestId: number;
    publishedRoot: string;
    recomputedRoot: string;
    claimedLeaf: string;
    recomputedLeaf: string;
    leafIndex: number;
    leafCount: number;
    leafMatchesTable: boolean;
    rootMatches: boolean;
  } | null>(null);

  useEffect(() => {
    fetch(`/api/verify/pull/${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d?.error) { setError(d.error); return; }
        setData(d);
      })
      .catch(() => setError("Failed to load pull."));
  }, [id]);

  // Run the verification math IN THE BROWSER once we have the data.
  // This is the entire point — the user shouldn't have to trust our
  // server's "yes it's valid" claim. They re-run the math themselves.
  useEffect(() => {
    if (!data) return;
    verifyPull({
      commitment: data.commitment,
      serverSeed: data.server_seed,
      clientSeed: data.client_seed,
      nonce: data.nonce,
      rarityWeights: data.rarity_weights,
      rolledRarity: data.rolled_rarity,
    }).then((v) => {
      setVerification(v);
      // Quest "check-the-math": stamps only when the fairness proof
      // genuinely re-ran in THIS browser and PASSED. A failed
      // verification, or a page that never loaded a real pull, never
      // stamps. The dispatch is a window event — nothing leaves the browser.
      if (v.ok) {
        window.dispatchEvent(
          new CustomEvent(QUEST_EVENT, { detail: { id: "check-the-math" } }),
        );
      }
    });
  }, [data]);

  useEffect(() => {
    if (!data || data.merkle_digest_id == null || data.merkle_leaf_index == null || !data.revealed_at) return;
    (async () => {
      const res = await fetch(`/api/verify/digests/${data.merkle_digest_id}`);
      if (!res.ok) return;
      const digest = await res.json() as { root: string; leaves: string[]; leaf_count: number };
      const recomputedLeaf = await computeLeaf({
        id: data.pull_id,
        commitment: data.commitment,
        serverSeed: data.server_seed,
        revealedAtIso: new Date(data.revealed_at).toISOString(),
      });
      const claimedLeaf = digest.leaves[data.merkle_leaf_index!];
      const leafMatchesTable = claimedLeaf?.toLowerCase() === recomputedLeaf.toLowerCase();
      const recomputedRoot = await merkleRoot(digest.leaves);
      const rootMatches = recomputedRoot.toLowerCase() === digest.root.toLowerCase();
      setMerkle({
        digestId: data.merkle_digest_id!,
        publishedRoot: digest.root,
        recomputedRoot,
        claimedLeaf,
        recomputedLeaf,
        leafIndex: data.merkle_leaf_index!,
        leafCount: digest.leaf_count,
        leafMatchesTable,
        rootMatches,
      });
    })();
  }, [data]);

  if (error) {
    return (
      <Page>
      <Audience kind="public-documentation" />
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 text-center">
          <p className="text-red-400 font-bold">{error}</p>
          <p className="text-xs text-neutral-500 mt-2">Pull ID: <code className="font-mono">{id}</code></p>
        </div>
      </Page>
    );
  }

  if (!data) {
    return (
      <Page>
        <p className="text-neutral-500">Loading proof…</p>
      </Page>
    );
  }

  const committedTs = new Date(data.committed_at).getTime();
  const revealedTs = new Date(data.revealed_at).getTime();
  const orderingOk = committedTs <= revealedTs;
  const orderingDelayMs = revealedTs - committedTs;

  return (
    <Page>
      <header className="mb-8 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link href="/verify" className="text-xs text-neutral-500 hover:text-neutral-300">← All proofs</Link>
          <h1 className="text-2xl font-bold mt-2 mb-1">Provably-Fair Pull Verification</h1>
          <p className="text-sm text-neutral-500">
            Re-run the RNG math in your browser. We didn&apos;t pick the outcome —
            we committed to a hash before rolling, and you can prove it.
          </p>
        </div>
        <a
          href={`/api/verify/pull/${id}/certificate.svg`}
          download={`certificate-${id.slice(0, 8)}.svg`}
          className="shrink-0 px-3 py-2 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 rounded-lg text-xs font-bold transition-colors"
        >
          ↓ Download Certificate
        </a>
      </header>

      {/* Verdict banner */}
      <div className={`rounded-xl p-4 mb-6 border ${
        verification?.ok
          ? "bg-emerald-500/10 border-emerald-500/40"
          : verification && !verification.ok
            ? "bg-red-500/10 border-red-500/40"
            : "bg-neutral-900 border-neutral-800"
      }`}>
        <div className="flex items-center gap-3">
          <span className={`text-3xl ${verification?.ok ? "text-emerald-400" : "text-neutral-500"}`}>
            {verification?.ok ? "✓" : verification ? "✗" : "…"}
          </span>
          <div>
            <p className="font-bold">
              {verification?.ok
                ? "Verified — pull is provably fair"
                : verification
                  ? "Verification FAILED — please contact support"
                  : "Computing…"}
            </p>
            <p className="text-xs text-neutral-500">
              All checks ran in your browser using public data only.
            </p>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left: result preview */}
        <section className="space-y-4">
          {data.vault_item && (
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
              <h2 className="text-xs uppercase tracking-wider text-neutral-500 mb-2">Result</h2>
              <div className="relative aspect-[5/7] rounded-lg overflow-hidden bg-neutral-800 mb-3">
                {data.vault_item.image_url ? (
                  <Image src={data.vault_item.image_url} alt={data.vault_item.card_name} fill sizes="240px" className="object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-neutral-600 text-xs">No image</div>
                )}
              </div>
              <p className="font-bold text-sm">{data.vault_item.card_name}</p>
              <p className="text-xs text-neutral-500">{data.vault_item.card_number}</p>
            </div>
          )}

          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
            <h2 className="text-xs uppercase tracking-wider text-neutral-500 mb-2">Pull</h2>
            <Row label="Tier" value={data.tier} />
            <Row label="Source" value={data.earned_from} />
            <Row label="Rolled rarity" value={data.rolled_rarity} mono />
            {data.rolled_spot_gbp && <Row label="Spot price" value={`£${parseFloat(data.rolled_spot_gbp).toFixed(2)}`} />}
          </div>
        </section>

        {/* Middle: the math */}
        <section className="lg:col-span-2 space-y-4">
          {/* Check 1: hash */}
          <CheckCard
            ok={verification?.commitmentMatches ?? null}
            title="1. Commitment matches the seed"
            explanation="The server published this commitment hash before rolling. We re-hash the revealed seed and check it matches."
          >
            <Field label="commitment" value={data.commitment} mono />
            <Field label="sha256(server_seed)" value={verification?.recomputedHash ?? "—"} mono />
            <Field label="server_seed" value={data.server_seed} mono />
          </CheckCard>

          {/* Check 2: roll reproduces */}
          <CheckCard
            ok={verification?.rarityMatches ?? null}
            title="2. The seed reproduces the rolled rarity"
            explanation="rollFloat(serverSeed, clientSeed, nonce) → roll → pickWeighted(rarity_weights, roll) → rarity."
          >
            <Field label="client_seed" value={data.client_seed_display} mono />
            <Field label="nonce" value={String(data.nonce)} mono />
            <Field label="recomputed roll" value={verification?.recomputedRoll.toFixed(15) ?? "—"} mono />
            <Field label="recomputed rarity" value={verification?.recomputedRarity ?? "—"} mono />
            <Field label="claimed rarity" value={data.rolled_rarity} mono />
          </CheckCard>

          {/* Check 3: ordering */}
          <CheckCard
            ok={orderingOk}
            title="3. Commitment was published before the roll"
            explanation="committed_at must precede revealed_at. The server can't have picked a seed AFTER seeing the desired outcome."
          >
            <Field label="committed_at" value={new Date(data.committed_at).toISOString()} mono />
            <Field label="revealed_at" value={new Date(data.revealed_at).toISOString()} mono />
            <Field label="delay" value={`${orderingDelayMs} ms`} mono />
          </CheckCard>

          <CheckCard
            ok={merkle ? (merkle.leafMatchesTable && merkle.rootMatches) : null}
            title={`4. Pull is anchored in public digest ${data.merkle_digest_id ? `#${data.merkle_digest_id}` : "(pending)"}`}
            explanation="Once a digest is published, rewriting any leaf changes the root. Re-hashing the digest's leaves client-side must match the published root; our leaf must sit at the claimed index."
          >
            {data.merkle_digest_id == null ? (
              <p className="text-xs text-neutral-500 italic">
                This pull has not yet been included in a digest — the maintenance
                cron publishes roots every tick. Checks 1-3 are already verifiable.
              </p>
            ) : merkle ? (
              <>
                <Field label="digest id"       value={String(merkle.digestId)} mono />
                <Field label="leaf index / count" value={`${merkle.leafIndex} / ${merkle.leafCount}`} mono />
                <Field label="published root"  value={merkle.publishedRoot} mono />
                <Field label="recomputed root" value={merkle.recomputedRoot} mono />
              </>
            ) : (
              <p className="text-xs text-neutral-500">Loading digest…</p>
            )}
          </CheckCard>

          {/* Rarity weights */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
            <h3 className="text-sm font-bold mb-2">Tier weights at the time of pull</h3>
            <table className="w-full text-xs">
              <tbody>
                {Object.entries(data.rarity_weights || {}).map(([rarity, w]) => (
                  <tr key={rarity} className="border-t border-neutral-800">
                    <td className="py-1.5 text-neutral-400 font-mono uppercase">{rarity}</td>
                    <td className="py-1.5 text-right text-neutral-300 font-mono">
                      {(w * 100).toFixed(2)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </Page>
  );
}

function Page({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <div className="max-w-5xl mx-auto px-4 py-8">{children}</div>
    </main>
  );
}

function CheckCard({ ok, title, explanation, children }: {
  ok: boolean | null;
  title: string;
  explanation: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`bg-neutral-900 border rounded-xl p-4 ${
      ok === true ? "border-emerald-500/30"
        : ok === false ? "border-red-500/40"
        : "border-neutral-800"
    }`}>
      <div className="flex items-baseline gap-2 mb-2">
        <span className={`text-lg ${
          ok === true ? "text-emerald-400"
            : ok === false ? "text-red-400"
            : "text-neutral-500"
        }`}>
          {ok === true ? "✓" : ok === false ? "✗" : "…"}
        </span>
        <h3 className="font-bold text-sm">{title}</h3>
      </div>
      <p className="text-xs text-neutral-500 mb-3">{explanation}</p>
      <div className="space-y-1">{children}</div>
    </div>
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

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between text-sm py-0.5">
      <span className="text-neutral-500">{label}</span>
      <span className={`text-neutral-200 ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}
