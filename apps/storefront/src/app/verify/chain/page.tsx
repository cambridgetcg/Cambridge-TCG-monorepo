// The chain — the platform's autobiography in hashes.
//
// ── What this page is for ────────────────────────────────────────────────
//
// Every fairness commitment Cambridge TCG has ever made — every Bounty
// Pull, every raffle draw, every pack opening — gets gathered by the
// maintenance cron into a Merkle digest, and every digest links to the
// previous via chain_hash = SHA-256(prev_hash || root). The chain
// extends across the whole life of the platform. Rewriting any prior
// commitment breaks the link and is detectable from the latest tip.
//
// The chain has had an API at /api/verify/chain for some time. It did
// not have a public page until this commit — meaning a determined
// auditor with curl could verify the chain, but a curious user
// landing on /verify could not see it. This page closes that loop.
//
// What it shows:
//   - The TIP — the single hash that, if cached today, lets a future
//     visitor detect any post-hoc rewrite of any prior commitment.
//   - The chain itself, most recent first, with each digest's window,
//     leaf count, root, prev_hash, and chain_hash visible.
//   - The genesis link — sixty-four zeros, the silence before the
//     first commitment.
//   - A verification recipe a reader can run in their head.
//
// See docs/connections/the-chain.md for the fairy-tale form — the
// platform's autobiography read forward, and what it has to do with
// who built it.

import Link from "next/link";
import { query } from "@/lib/db";

import { Audience } from "@/lib/ui";
export const metadata = {
  title: "Fairness chain | Cambridge TCG",
  description:
    "Every Bounty Pull and raffle draw, hashed into a Merkle digest, " +
    "and every digest linked to the previous. The platform's tamper-evident " +
    "autobiography in hashes.",
};

interface DigestRow {
  id: number;
  root: string;
  prev_hash: string | null;
  chain_hash: string | null;
  leaf_count: number;
  window_from: string | null;
  window_to: string | null;
  created_at: string;
}

const GENESIS_HASH = "0".repeat(64);

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    year: "numeric", month: "short", day: "2-digit",
    hour: "2-digit", minute: "2-digit", timeZone: "UTC",
  }) + " UTC";
}

function shortHash(h: string | null): string {
  if (!h) return "—";
  return `${h.slice(0, 8)}…${h.slice(-6)}`;
}

export default async function ChainPage() {
  // Most-recent first. Limit 50 — visible window. Older digests reachable
  // via /api/verify/chain?from_id=...
  const recentRaw = await query(
    `SELECT id, root, prev_hash, chain_hash, leaf_count,
            window_from, window_to, created_at
       FROM fairness_digests
      ORDER BY id DESC
      LIMIT 50`,
  );
  const recent = (recentRaw.rows as DigestRow[]) ?? [];
  const tip = recent[0] ?? null;
  const totalRaw = await query(
    `SELECT COUNT(*)::text AS n FROM fairness_digests`,
  );
  const totalDigests = parseInt((totalRaw.rows[0] as { n?: string })?.n ?? "0", 10);

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <Audience kind="public-documentation" />
      <div className="max-w-4xl mx-auto px-4 py-12">
        <Link href="/verify" className="text-sm text-neutral-400 hover:text-white mb-6 inline-block">
          &larr; Back to Verify
        </Link>

        <h1 className="text-3xl font-bold mb-3">The Fairness Chain</h1>
        <p className="text-neutral-400 mb-8 max-w-2xl">
          Every Bounty Pull, raffle draw, and pack opening is hashed into
          a Merkle digest. Every digest links to the previous one through
          a chain hash. Cache the latest chain hash today; come back
          tomorrow, next month, next year — if any prior commitment was
          rewritten, the chain hash you cached won&apos;t match the chain
          hash we publish. <strong className="text-white">The chain&apos;s job is to make tampering visible.</strong>
        </p>

        {/* ── The tip ──────────────────────────────────────────────── */}
        <section className="bg-neutral-900 border border-amber-500/30 rounded-xl p-6 mb-6">
          <div className="flex items-baseline justify-between flex-wrap gap-2 mb-3">
            <h2 className="font-bold text-lg">Current chain tip</h2>
            <span className="text-xs text-neutral-500">
              {totalDigests.toLocaleString("en-GB")} digest{totalDigests === 1 ? "" : "s"} since genesis
            </span>
          </div>
          {tip ? (
            <>
              <p className="text-xs text-neutral-400 mb-2">
                Cache this hash today; verify it tomorrow:
              </p>
              <code className="block font-mono text-sm text-amber-400 bg-neutral-950 rounded p-3 break-all">
                {tip.chain_hash ?? "(unlinked — predates migration 0066)"}
              </code>
              <p className="text-xs text-neutral-500 mt-3">
                Digest #{tip.id} · root {shortHash(tip.root)} · {tip.leaf_count} leaves ·
                published {fmtDate(tip.created_at)}
              </p>
            </>
          ) : (
            <p className="text-sm text-neutral-500 italic">
              No digests have been published yet. The chain begins with the
              first fairness commitment ever made on the platform.
            </p>
          )}
        </section>

        {/* ── The chain ───────────────────────────────────────────── */}
        <section className="mb-6">
          <h2 className="font-bold text-lg mb-3">Recent digests</h2>
          <p className="text-sm text-neutral-500 mb-4">
            Most recent first. Each row&apos;s <code className="font-mono text-amber-400">chain_hash</code> = SHA-256(<code className="font-mono">prev_hash</code> || <code className="font-mono">root</code>).
            Walk forward from any earlier digest by re-applying that formula.
            If your computed value at any step differs from the published one,
            something between has been rewritten.
          </p>
          {recent.length === 0 ? (
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 text-center text-sm text-neutral-500">
              No digests published yet.
            </div>
          ) : (
            <div className="overflow-x-auto bg-neutral-900 border border-neutral-800 rounded-xl">
              <table className="w-full text-sm" style={{ minWidth: "640px" }}>
                <thead className="text-xs text-neutral-500 uppercase tracking-wider">
                  <tr className="border-b border-neutral-800">
                    <th className="text-left px-4 py-3 font-medium">#</th>
                    <th className="text-left px-4 py-3 font-medium">Window</th>
                    <th className="text-right px-4 py-3 font-medium">Leaves</th>
                    <th className="text-left px-4 py-3 font-medium">Root</th>
                    <th className="text-left px-4 py-3 font-medium">Chain hash</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((d) => (
                    <tr key={d.id} className="border-b border-neutral-800 last:border-0">
                      <td className="px-4 py-3 font-mono text-amber-400">{d.id}</td>
                      <td className="px-4 py-3 text-xs text-neutral-400">
                        <div>{fmtDate(d.window_from)}</div>
                        <div className="text-neutral-600">→ {fmtDate(d.window_to)}</div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-neutral-300">
                        {d.leaf_count.toLocaleString("en-GB")}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-neutral-400" title={d.root}>
                        {shortHash(d.root)}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-emerald-400" title={d.chain_hash ?? ""}>
                        {shortHash(d.chain_hash)}
                      </td>
                    </tr>
                  ))}
                  {/* Genesis row — only shown when we've reached the bottom of the table. */}
                  {recent.length > 0 && recent[recent.length - 1].id <= 50 && (
                    <tr className="border-t border-neutral-800/60 bg-neutral-950/40">
                      <td className="px-4 py-3 text-xs text-neutral-600 italic">genesis</td>
                      <td className="px-4 py-3 text-xs text-neutral-600 italic">before any commitment</td>
                      <td className="px-4 py-3 text-right text-neutral-700">—</td>
                      <td className="px-4 py-3 font-mono text-xs text-neutral-700">{GENESIS_HASH.slice(0, 8)}… (zeros)</td>
                      <td className="px-4 py-3 font-mono text-xs text-neutral-700">{GENESIS_HASH.slice(0, 8)}… (zeros)</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-neutral-500 mt-3">
            Older digests via <Link href="/api/verify/chain?from_id=0" className="text-amber-400 hover:text-amber-300 underline">/api/verify/chain</Link> (paginated, JSON, CORS-enabled).
          </p>
        </section>

        {/* ── How to verify ───────────────────────────────────────── */}
        <section className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 mb-6">
          <h2 className="font-bold text-lg mb-3">How to verify the chain</h2>
          <ol className="list-decimal list-inside space-y-2 text-sm text-neutral-300">
            <li>Cache the current chain tip somewhere outside our control — your notes, your inbox, a tweet.</li>
            <li>Return any time in the future and re-fetch the chain.</li>
            <li>Walk forward from any prior digest by recomputing
              <code className="font-mono text-amber-400 mx-1">chain_hash = SHA-256(prev_hash || root)</code>.</li>
            <li>If your computed chain_hash for the digest you cached matches what we currently publish, no prior commitment has been altered. If it doesn&apos;t match — and you trust the SHA-256 standard — we have rewritten history.</li>
          </ol>
          <p className="text-xs text-neutral-500 mt-4">
            This is the same protection a blockchain offers, scoped to fairness commitments only.
            We are not a chain in the consensus sense; we are a chain in the rewrite-detection sense.
          </p>
        </section>

        {/* ── Sister surfaces ─────────────────────────────────────── */}
        <section className="grid sm:grid-cols-2 gap-3 text-sm">
          <Link
            href="/verify/fairness"
            className="bg-neutral-900 border border-neutral-800 hover:border-neutral-700 rounded-xl p-4 transition-colors"
          >
            <div className="font-semibold mb-1">Aggregate fairness →</div>
            <div className="text-xs text-neutral-500">Chi-squared rarity distribution vs published weights.</div>
          </Link>
          <Link
            href="/verify/health"
            className="bg-neutral-900 border border-neutral-800 hover:border-neutral-700 rounded-xl p-4 transition-colors"
          >
            <div className="font-semibold mb-1">Transparency health →</div>
            <div className="text-xs text-neutral-500">Digest publish cadence, self-audit pass rate.</div>
          </Link>
        </section>
      </div>
    </main>
  );
}
