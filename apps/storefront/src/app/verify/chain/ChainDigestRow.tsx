"use client";

/**
 * ChainDigestRow — one digest row of the fairness chain, expandable.
 *
 * Before this component the full root / prev_hash / chain_hash were only
 * reachable through `title` tooltips (invisible on touch, unreachable by
 * keyboard). Clicking the row (or its # button) now expands a detail row
 * showing every hash in full — genuinely useful, and the genuine "open one
 * entry" moment that completes the "walk-the-chain" quest.
 *
 * Quest law: the stamp fires on the FIRST expand only — never on render,
 * never on the bare page load. Zero network calls (window event only).
 */

import { useState } from "react";
import { QUEST_EVENT } from "@/lib/quests";

export interface ChainDigestRowData {
  id: number;
  root: string;
  prev_hash: string | null;
  chain_hash: string | null;
  leaf_count: number;
  /** Preformatted display strings (formatted server-side). */
  window_from_display: string;
  window_to_display: string;
}

function shortHash(h: string | null): string {
  if (!h) return "—";
  return `${h.slice(0, 8)}…${h.slice(-6)}`;
}

function HashLine({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="text-xs">
      <span className="text-neutral-500">{label}: </span>
      <span className="font-mono text-neutral-300 break-all">{value ?? "—"}</span>
    </div>
  );
}

export default function ChainDigestRow({ d }: { d: ChainDigestRowData }) {
  const [open, setOpen] = useState(false);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) {
      window.dispatchEvent(
        new CustomEvent(QUEST_EVENT, { detail: { id: "walk-the-chain" } }),
      );
    }
  }

  return (
    <>
      <tr
        className="border-b border-neutral-800 last:border-0 cursor-pointer hover:bg-neutral-800/30 transition-colors"
        onClick={toggle}
      >
        <td className="px-4 py-3 font-mono text-amber-400">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggle();
            }}
            aria-expanded={open}
            aria-label={`Digest ${d.id} — ${open ? "collapse" : "expand"} full hashes`}
            className="font-mono text-amber-400 hover:text-amber-300"
          >
            <span aria-hidden="true" className="inline-block w-3 text-neutral-500">
              {open ? "▾" : "▸"}
            </span>
            {d.id}
          </button>
        </td>
        <td className="px-4 py-3 text-xs text-neutral-400">
          <div>{d.window_from_display}</div>
          <div className="text-neutral-600">→ {d.window_to_display}</div>
        </td>
        <td className="px-4 py-3 text-right font-mono text-neutral-300">
          {d.leaf_count.toLocaleString("en-GB")}
        </td>
        <td className="px-4 py-3 font-mono text-xs text-neutral-400" title={d.root}>
          {shortHash(d.root)}
        </td>
        <td
          className="px-4 py-3 font-mono text-xs text-emerald-400"
          title={d.chain_hash ?? ""}
        >
          {shortHash(d.chain_hash)}
        </td>
      </tr>
      {open && (
        <tr className="border-b border-neutral-800 last:border-0 bg-neutral-950/60">
          <td colSpan={5} className="px-4 py-3 space-y-1.5">
            <HashLine label="root" value={d.root} />
            <HashLine label="prev_hash" value={d.prev_hash} />
            <HashLine label="chain_hash" value={d.chain_hash} />
            <p className="text-[10px] text-neutral-600 pt-1">
              chain_hash = SHA-256(prev_hash || root) — recompute it yourself
              to confirm this link.
            </p>
          </td>
        </tr>
      )}
    </>
  );
}
