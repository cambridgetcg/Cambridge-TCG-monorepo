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
  bounty_pull: "bg-warning/15 text-warning border-warning/30",
  pack_open:   "bg-info/15 text-info border-info/30",
  spin_wheel:  "bg-[#3e7d8f]/15 text-[#3e7d8f] border-[#3e7d8f]/30",
  mystery_box: "bg-[#6a5a8f]/15 text-[#6a5a8f] border-[#6a5a8f]/30",
  raffle_draw: "bg-ok/15 text-ok border-ok/30",
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
      <h1 className="text-2xl font-bold text-ink mb-2">My Proofs</h1>
      <p className="text-sm text-ink-muted mb-6">
        Draw receipts linked to your account. Each row opens a browser-side
        consistency check. Server-only entropy means these receipts do not,
        by themselves, prove the server never preselected an input.{" "}
        <Link href="/verify/how-it-works" className="text-accent hover:text-accent-strong underline">
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
        <p className="text-ink-faint">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="bg-surface border border-border-subtle rounded-lg p-6 text-center text-ink-faint text-sm">
          No draw proofs yet. Opening a pack will add one here.
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
        active ? "bg-ink text-page" : "bg-surface text-ink-muted hover:text-ink hover:bg-surface-subtle"
      }`}
    >
      {label}
    </button>
  );
}

function ProofRow({ entry }: { entry: Entry }) {
  const ts = entry.revealed_at ?? entry.committed_at;
  return (
    <div className="bg-surface rounded-lg px-3 py-2.5 flex items-center gap-3 flex-wrap">
      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${KIND_TONE[entry.kind] ?? "bg-surface-subtle text-ink-muted border-border-subtle"}`}>
        {KIND_LABEL[entry.kind] ?? entry.kind}
      </span>

      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm truncate">
          {entry.subject_label ?? <span className="text-ink-faint font-normal">—</span>}
        </p>
        <p className="text-xs text-ink-faint flex items-center gap-2 flex-wrap">
          {entry.outcome_label && <span className="font-mono uppercase">{entry.outcome_label}</span>}
          {entry.merkle_digest_id != null && (
            <span className="text-ok/80 text-[10px]">anchored in #{entry.merkle_digest_id}</span>
          )}
        </p>
      </div>

      <span className="text-[11px] text-ink-faint">
        {new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
      </span>

      <Link
        href={entry.verify_path}
        className="text-xs bg-ok/10 hover:bg-ok/20 border border-ok/30 text-ok rounded px-2 py-1 transition"
      >
        Verify ↗
      </Link>
    </div>
  );
}
