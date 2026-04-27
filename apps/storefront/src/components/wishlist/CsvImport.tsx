"use client";

import { useState } from "react";

// Wishlist CSV parser — forgiving shape, header-driven or positional.
// Columns (any order when header-driven):
//   sku           — required (we match SKU-first for bulk)
//   max_price     — optional, decimal
//   condition_min — optional, default NM (NM/LP/MP/HP/DMG)
//   notes         — optional
//
// Positional fallback when no "sku" cell in the first row:
//   sku, max_price, condition_min, notes

export interface ParsedWishRow {
  sku: string;
  maxPrice: number | null;
  conditionMin: string;
  notes: string | null;
}

export interface WishParseResult {
  rows: ParsedWishRow[];
  warnings: string[];
}

const VALID_CONDITIONS = new Set(["NM", "LP", "MP", "HP", "DMG"]);

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let buf = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') { buf += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (c === "," && !inQuotes) {
      out.push(buf); buf = "";
    } else {
      buf += c;
    }
  }
  out.push(buf);
  return out.map((s) => s.trim());
}

export function parseWishlistCsv(raw: string): WishParseResult {
  const warnings: string[] = [];
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { rows: [], warnings };

  const firstCells = splitCsvLine(lines[0]).map((c) => c.toLowerCase());
  const hasHeader = firstCells.some((c) => c === "sku");

  type Col = "sku" | "max_price" | "condition_min" | "notes";
  const headerIdx: Record<Col, number> = { sku: -1, max_price: -1, condition_min: -1, notes: -1 };

  if (hasHeader) {
    const norm = firstCells.map((c) => c.replace(/\s+/g, "_"));
    for (let i = 0; i < norm.length; i++) {
      const col = norm[i];
      if (col === "sku") headerIdx.sku = i;
      else if (col === "max_price" || col === "price" || col === "target" || col === "max")
        headerIdx.max_price = i;
      else if (col === "condition_min" || col === "condition" || col === "cond" || col === "min_condition")
        headerIdx.condition_min = i;
      else if (col === "notes" || col === "note") headerIdx.notes = i;
    }
    if (headerIdx.sku < 0) warnings.push("Header found but no 'sku' column");
  }

  const dataLines = hasHeader ? lines.slice(1) : lines;
  const rows: ParsedWishRow[] = [];

  for (let idx = 0; idx < dataLines.length; idx++) {
    const cells = splitCsvLine(dataLines[idx]);
    const lineNo = idx + (hasHeader ? 2 : 1);
    const at = (col: Col, fallback: number) => {
      const i = hasHeader ? headerIdx[col] : fallback;
      return i >= 0 && i < cells.length ? cells[i] : "";
    };

    const sku = at("sku", 0);
    if (!sku) { warnings.push(`Line ${lineNo}: no SKU`); continue; }

    const priceRaw = at("max_price", 1).replace(/[£$€,]/g, "").trim();
    const maxPrice = priceRaw ? parseFloat(priceRaw) : null;
    if (priceRaw && (maxPrice == null || !Number.isFinite(maxPrice))) {
      warnings.push(`Line ${lineNo}: bad price "${priceRaw}"`);
    }

    const condRaw = (at("condition_min", 2) || "NM").toUpperCase();
    const conditionMin = VALID_CONDITIONS.has(condRaw) ? condRaw : "NM";
    if (at("condition_min", 2) && !VALID_CONDITIONS.has(condRaw)) {
      warnings.push(`Line ${lineNo}: unknown condition "${condRaw}" — using NM`);
    }

    const notes = at("notes", 3) || null;

    rows.push({
      sku: sku.toUpperCase(),
      maxPrice: Number.isFinite(maxPrice ?? NaN) ? maxPrice : null,
      conditionMin,
      notes,
    });
  }

  return { rows, warnings };
}

interface Props {
  onClose: () => void;
  onImport: (rows: ParsedWishRow[]) => Promise<{ added: number; failed: string[] }>;
}

export default function WishlistCsvImport({ onClose, onImport }: Props) {
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<WishParseResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ added: number; failed: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleParse() { setResult(null); setError(null); setParsed(parseWishlistCsv(text)); }
  async function handleImport() {
    if (!parsed || parsed.rows.length === 0) { setError("Nothing to import."); return; }
    setImporting(true); setError(null);
    try { setResult(await onImport(parsed.rows)); }
    catch { setError("Import failed — try again."); }
    finally { setImporting(false); }
  }

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
            <h2 className="text-xl font-bold">Import wishlist from CSV</h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Columns: sku, max_price, condition_min, notes. Header row optional.
            </p>
          </div>
          <button onClick={onClose} className="text-neutral-500 hover:text-white text-2xl leading-none">&times;</button>
        </div>

        <textarea
          value={text}
          onChange={(e) => { setText(e.target.value); setParsed(null); setResult(null); }}
          placeholder={`sku,max_price,condition_min\nOP01-120,30.00,NM\nOP01-013,40.00,LP`}
          rows={10}
          className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-amber-500 resize-y"
        />

        {error && <div className="mt-3 bg-red-900/30 border border-red-700/40 text-red-300 rounded-lg px-3 py-2 text-xs">{error}</div>}

        {parsed && !result && (
          <div className="mt-4 bg-neutral-950/40 border border-neutral-800 rounded-lg p-3">
            <p className="text-sm font-semibold">Parsed: {parsed.rows.length} row{parsed.rows.length === 1 ? "" : "s"}</p>
            {parsed.warnings.length > 0 && (
              <ul className="mt-2 text-xs text-amber-400 space-y-0.5 max-h-32 overflow-y-auto">
                {parsed.warnings.map((w, i) => <li key={i}>⚠ {w}</li>)}
              </ul>
            )}
          </div>
        )}

        {result && (
          <div className="mt-4 bg-emerald-900/20 border border-emerald-700/40 rounded-lg p-3 text-sm">
            <p className="text-emerald-400 font-semibold">Imported {result.added} wish{result.added === 1 ? "" : "es"}.</p>
            {result.failed.length > 0 && (
              <div className="mt-2">
                <p className="text-amber-400 text-xs">
                  Couldn&apos;t add {result.failed.length} SKU{result.failed.length === 1 ? "" : "s"}:
                </p>
                <p className="text-xs font-mono text-neutral-400 mt-0.5 break-all">{result.failed.join(", ")}</p>
              </div>
            )}
          </div>
        )}

        <div className="mt-5 flex items-center gap-2 justify-end">
          <button onClick={onClose} className="text-sm bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded-lg px-4 py-2 transition-colors">
            {result ? "Close" : "Cancel"}
          </button>
          {!parsed && (
            <button onClick={handleParse} disabled={text.trim().length === 0} className="text-sm bg-neutral-700 hover:bg-neutral-600 disabled:opacity-40 rounded-lg px-4 py-2 transition-colors">
              Preview
            </button>
          )}
          {parsed && !result && (
            <button onClick={handleImport} disabled={importing || parsed.rows.length === 0} className="text-sm bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black font-bold rounded-lg px-4 py-2 transition-colors">
              {importing ? "Importing..." : `Add ${parsed.rows.length} wishes`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
