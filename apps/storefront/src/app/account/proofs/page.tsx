"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { Audience } from "@/lib/ui";
interface Entry {
  kind: string;
  id: string;
  verify_path: string;
  subject_label: string | null;
  outcome_label: string | null;
  committed_at: string;
  revealed_at: string | null;
  merkle_digest_id: number | null;
  merkle_leaf_index: number | null;
}

const KIND_LABEL: Record<string, string> = {
  bounty_pull: "Bounty Pull",
  pack_open:   "Pack Open",
  spin_wheel:  "Spin",
  mystery_box: "Mystery Box",
  raffle_draw: "Raffle",
};

const KIND_TONE: Record<string, string> = {
  bounty_pull: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  pack_open:   "bg-sky-500/15 text-sky-400 border-sky-500/30",
  spin_wheel:  "bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/30",
  mystery_box: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  raffle_draw: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
};

export default function MyProofsPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    fetch("/api/account/proofs")
      .then((r) => r.json())
      .then((d) => { if (d?.entries) setEntries(d.entries); })
      .finally(() => setLoading(false));
  }, []);

  const kinds = Array.from(new Set(entries.map((e) => e.kind)));
  const filtered = filter === "all" ? entries : entries.filter((e) => e.kind === filter);

  return (
    <div>
      <Audience kind="consumer" />
      <h1 className="text-2xl font-bold text-white mb-2">My Proofs</h1>
      <p className="text-sm text-neutral-400 mb-6">
        Every provably-fair draw you&apos;ve been part of. Each row links to the
        public verifier — math runs in your browser; our server can&apos;t fake
        the answer.{" "}
        <Link href="/verify/how-it-works" className="text-amber-400 hover:text-amber-300 underline">
          How it works
        </Link>
      </p>

      {/* Kind filter tabs */}
      {kinds.length > 1 && (
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
          <FilterBtn label="All" active={filter === "all"} onClick={() => setFilter("all")} />
          {kinds.map((k) => (
            <FilterBtn
              key={k}
              label={KIND_LABEL[k] ?? k}
              active={filter === k}
              onClick={() => setFilter(k)}
            />
          ))}
        </div>
      )}

      {loading ? (
        <p className="text-neutral-500">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 text-center text-neutral-500 text-sm">
          No provably-fair draws yet. Opening a Bounty Pull or pack will add a proof here.
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((e) => (
            <ProofRow key={`${e.kind}-${e.id}`} entry={e} />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
        active ? "bg-amber-500 text-black" : "bg-neutral-900 text-neutral-400 hover:text-white hover:bg-neutral-800"
      }`}
    >
      {label}
    </button>
  );
}

function ProofRow({ entry }: { entry: Entry }) {
  const ts = entry.revealed_at ?? entry.committed_at;
  return (
    <div className="bg-neutral-900 rounded-xl px-3 py-2.5 flex items-center gap-3 flex-wrap">
      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${KIND_TONE[entry.kind] ?? "bg-neutral-800 text-neutral-300 border-neutral-700"}`}>
        {KIND_LABEL[entry.kind] ?? entry.kind}
      </span>

      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm truncate">
          {entry.subject_label ?? <span className="text-neutral-500 font-normal">—</span>}
        </p>
        <p className="text-xs text-neutral-500 flex items-center gap-2 flex-wrap">
          {entry.outcome_label && <span className="font-mono uppercase">{entry.outcome_label}</span>}
          {entry.merkle_digest_id != null && (
            <span className="text-emerald-500/80 text-[10px]">anchored in #{entry.merkle_digest_id}</span>
          )}
        </p>
      </div>

      <span className="text-[11px] text-neutral-600">
        {new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
      </span>

      <Link
        href={entry.verify_path}
        className="text-xs bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 rounded px-2 py-1 transition"
      >
        Verify ↗
      </Link>
    </div>
  );
}
