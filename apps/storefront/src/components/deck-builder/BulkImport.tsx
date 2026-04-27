"use client";

import { useState } from "react";

// Parser tolerates the common OPTCG / MTGA-style decklist formats:
//   4 OP01-001
//   4x OP01-001 Monkey D. Luffy
//   4 OP01-001 Monkey D. Luffy
//   OP01-001 x4
//   2 OP01-002
// Lines starting with "//" or "#" are treated as comments.
// An optional "Leader:" prefix on a line designates that entry as the leader.
//
// We don't attempt to match by name — card numbers are authoritative.

export interface ParsedEntry {
  cardNumber: string;
  quantity: number;
  isLeader: boolean;
}

export interface ParseResult {
  entries: ParsedEntry[];
  warnings: string[];
}

export function parseDeckList(raw: string): ParseResult {
  const entries: ParsedEntry[] = [];
  const warnings: string[] = [];

  const lines = raw.split(/\r?\n/);
  for (let idx = 0; idx < lines.length; idx++) {
    const rawLine = lines[idx];
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("//") || line.startsWith("#")) continue;

    // "Leader: OP01-001 Luffy" / "// Leader: OP01-001"
    const leaderMatch = /^leader\s*[:]?\s*/i.exec(line);
    const working = leaderMatch ? line.slice(leaderMatch[0].length) : line;
    const isLeader = !!leaderMatch;

    // Try "N CARDNUMBER" or "Nx CARDNUMBER" (quantity at the start)
    const m1 = working.match(/^(\d+)\s*x?\s+([A-Z]{1,8}\d*-\d+)/i);
    if (m1) {
      entries.push({
        quantity: parseInt(m1[1], 10),
        cardNumber: m1[2].toUpperCase(),
        isLeader,
      });
      continue;
    }

    // Try "CARDNUMBER xN" (quantity at the end)
    const m2 = working.match(/^([A-Z]{1,8}\d*-\d+)\s*x?\s*(\d+)\s*$/i);
    if (m2) {
      entries.push({
        quantity: parseInt(m2[2], 10),
        cardNumber: m2[1].toUpperCase(),
        isLeader,
      });
      continue;
    }

    // Try "CARDNUMBER" alone → default quantity 1
    const m3 = working.match(/^([A-Z]{1,8}\d*-\d+)\b/i);
    if (m3) {
      entries.push({
        quantity: 1,
        cardNumber: m3[1].toUpperCase(),
        isLeader,
      });
      continue;
    }

    warnings.push(`Line ${idx + 1}: couldn't parse "${line}"`);
  }

  return { entries, warnings };
}

interface BulkImportProps {
  onClose: () => void;
  /**
   * Called with the parsed entries once the user confirms. The parent is
   * responsible for fetching the matching cards from the catalog and adding
   * them to the deck state — we only do the parsing + UX here.
   */
  onImport: (entries: ParsedEntry[]) => Promise<{ added: number; notFound: string[] }>;
}

export default function BulkImport({ onClose, onImport }: BulkImportProps) {
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ added: number; notFound: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleParse() {
    setResult(null);
    setError(null);
    const r = parseDeckList(text);
    setParsed(r);
  }

  async function handleImport() {
    if (!parsed || parsed.entries.length === 0) {
      setError("Nothing to import.");
      return;
    }
    setImporting(true);
    setError(null);
    try {
      const r = await onImport(parsed.entries);
      setResult(r);
    } catch {
      setError("Import failed — try again.");
    } finally {
      setImporting(false);
    }
  }

  const totalCopies = parsed?.entries.reduce((s, e) => s + e.quantity, 0) ?? 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
      onClick={onClose}
    >
      <div
        className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 max-w-2xl w-full shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-baseline justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold">Import decklist</h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Paste from any source. We match by card number (e.g. OP01-120).
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-500 hover:text-white text-2xl leading-none"
          >
            &times;
          </button>
        </div>

        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setParsed(null);
            setResult(null);
          }}
          placeholder={`Leader: OP01-001 Monkey D. Luffy\n4x OP01-006 Nami\n4x OP01-007 Usopp\n2 OP01-013 Portgas D. Ace\n...`}
          rows={10}
          className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-amber-500 resize-y"
        />

        {error && (
          <div className="mt-3 bg-red-900/30 border border-red-700/40 text-red-300 rounded-lg px-3 py-2 text-xs">
            {error}
          </div>
        )}

        {parsed && !result && (
          <div className="mt-4 bg-neutral-950/40 border border-neutral-800 rounded-lg p-3">
            <p className="text-sm font-semibold">
              Parsed: {parsed.entries.length} unique cards, {totalCopies} copies
            </p>
            {parsed.warnings.length > 0 && (
              <ul className="mt-2 text-xs text-amber-400 space-y-0.5">
                {parsed.warnings.map((w, i) => (
                  <li key={i}>⚠ {w}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {result && (
          <div className="mt-4 bg-emerald-900/20 border border-emerald-700/40 rounded-lg p-3 text-sm">
            <p className="text-emerald-400 font-semibold">
              Imported {result.added} card{result.added === 1 ? "" : "s"}.
            </p>
            {result.notFound.length > 0 && (
              <div className="mt-2">
                <p className="text-amber-400 text-xs">
                  Couldn&apos;t find {result.notFound.length} card{result.notFound.length === 1 ? "" : "s"}:
                </p>
                <p className="text-xs font-mono text-neutral-400 mt-0.5">
                  {result.notFound.join(", ")}
                </p>
              </div>
            )}
          </div>
        )}

        <div className="mt-5 flex items-center gap-2 justify-end">
          <button
            onClick={onClose}
            className="text-sm bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded-lg px-4 py-2 transition-colors"
          >
            {result ? "Close" : "Cancel"}
          </button>
          {!parsed && (
            <button
              onClick={handleParse}
              disabled={text.trim().length === 0}
              className="text-sm bg-neutral-700 hover:bg-neutral-600 disabled:opacity-40 rounded-lg px-4 py-2 transition-colors"
            >
              Preview
            </button>
          )}
          {parsed && !result && (
            <button
              onClick={handleImport}
              disabled={importing || parsed.entries.length === 0}
              className="text-sm bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black font-bold rounded-lg px-4 py-2 transition-colors"
            >
              {importing ? "Importing..." : `Add ${totalCopies} cards`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
