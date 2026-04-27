"use client";

import { useState } from "react";

// Parser tolerates a forgiving CSV shape. Expected columns (header-driven,
// order-independent):
//   sku          — required
//   quantity     — required, integer ≥ 1
//   condition    — optional, default NM; case-insensitive (NM/LP/MP/HP/DMG)
//   acquisition_price or price — optional, decimal
//   acquired_at or date        — optional, YYYY-MM-DD
//   notes        — optional
//
// If there's no header row, a positional order "sku,quantity,condition,
// price,date,notes" is used. Headers are detected by the presence of "sku"
// (case-insensitive) in the first row.

export interface ParsedRow {
  sku: string;
  quantity: number;
  condition: string;
  acquisitionPrice: number | null;
  acquiredAt: string | null;
  notes: string | null;
}

export interface ParseResult {
  rows: ParsedRow[];
  warnings: string[];
}

const VALID_CONDITIONS = new Set(["NM", "LP", "MP", "HP", "DMG"]);

function splitCsvLine(line: string): string[] {
  // Tiny CSV splitter — handles commas inside double-quoted fields.
  // Good enough for a paste-box import; we're not trying to win an RFC war.
  const out: string[] = [];
  let buf = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      // Escaped "" inside quotes → literal "
      if (inQuotes && line[i + 1] === '"') { buf += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (c === "," && !inQuotes) {
      out.push(buf);
      buf = "";
    } else {
      buf += c;
    }
  }
  out.push(buf);
  return out.map((s) => s.trim());
}

export function parseCsv(raw: string): ParseResult {
  const warnings: string[] = [];
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { rows: [], warnings };

  // Detect header — if the first cell of the first row contains "sku" we
  // treat it as headers.
  const firstCells = splitCsvLine(lines[0]).map((c) => c.toLowerCase());
  const hasHeader = firstCells.some((c) => c === "sku");

  const POSITIONAL = ["sku", "quantity", "condition", "acquisition_price", "acquired_at", "notes"] as const;
  type Col = (typeof POSITIONAL)[number];

  const headerIdx: Record<Col, number> = {
    sku: -1, quantity: -1, condition: -1, acquisition_price: -1,
    acquired_at: -1, notes: -1,
  };

  if (hasHeader) {
    const norm = firstCells.map((c) => c.replace(/\s+/g, "_"));
    for (let i = 0; i < norm.length; i++) {
      const col = norm[i];
      if (col === "sku") headerIdx.sku = i;
      else if (col === "quantity" || col === "qty" || col === "count") headerIdx.quantity = i;
      else if (col === "condition" || col === "cond") headerIdx.condition = i;
      else if (col === "acquisition_price" || col === "price" || col === "acq_price" || col === "paid")
        headerIdx.acquisition_price = i;
      else if (col === "acquired_at" || col === "date" || col === "acquired")
        headerIdx.acquired_at = i;
      else if (col === "notes" || col === "note") headerIdx.notes = i;
    }
    if (headerIdx.sku < 0) warnings.push("Header row found but no 'sku' column — can't match rows");
  }

  const dataLines = hasHeader ? lines.slice(1) : lines;
  const rows: ParsedRow[] = [];

  for (let idx = 0; idx < dataLines.length; idx++) {
    const line = dataLines[idx];
    const cells = splitCsvLine(line);
    const lineNo = idx + (hasHeader ? 2 : 1);

    const cellAt = (col: Col, fallback: number) => {
      const i = hasHeader ? headerIdx[col] : fallback;
      return i >= 0 && i < cells.length ? cells[i] : "";
    };

    const sku = cellAt("sku", 0);
    if (!sku) { warnings.push(`Line ${lineNo}: no SKU`); continue; }

    const qtyRaw = cellAt("quantity", 1);
    const qty = parseInt(qtyRaw, 10);
    if (!Number.isFinite(qty) || qty < 1) {
      warnings.push(`Line ${lineNo}: invalid quantity "${qtyRaw}"`);
      continue;
    }

    const condRaw = (cellAt("condition", 2) || "NM").toUpperCase();
    const condition = VALID_CONDITIONS.has(condRaw) ? condRaw : "NM";
    if (cellAt("condition", 2) && !VALID_CONDITIONS.has(condRaw)) {
      warnings.push(`Line ${lineNo}: unknown condition "${condRaw}" — using NM`);
    }

    const priceRaw = cellAt("acquisition_price", 3).replace(/[£$€,]/g, "").trim();
    const acquisitionPrice = priceRaw ? parseFloat(priceRaw) : null;
    if (priceRaw && (acquisitionPrice == null || !Number.isFinite(acquisitionPrice))) {
      warnings.push(`Line ${lineNo}: bad price "${priceRaw}"`);
    }

    const acquiredAtRaw = cellAt("acquired_at", 4);
    const acquiredAt = /^\d{4}-\d{2}-\d{2}$/.test(acquiredAtRaw) ? acquiredAtRaw : null;
    if (acquiredAtRaw && !acquiredAt) {
      warnings.push(`Line ${lineNo}: date "${acquiredAtRaw}" ignored (use YYYY-MM-DD)`);
    }

    const notes = cellAt("notes", 5) || null;

    rows.push({
      sku: sku.toUpperCase(),
      quantity: qty,
      condition,
      acquisitionPrice: Number.isFinite(acquisitionPrice ?? NaN) ? acquisitionPrice : null,
      acquiredAt,
      notes,
    });
  }

  return { rows, warnings };
}

interface CsvImportProps {
  onClose: () => void;
  /**
   * Parent receives the parsed rows and is responsible for resolving each
   * SKU against the catalog + POSTing to /api/portfolio. Returns per-row
   * outcomes so we can render a clean summary.
   */
  onImport: (rows: ParsedRow[]) => Promise<{ added: number; failed: string[] }>;
}

export default function CsvImport({ onClose, onImport }: CsvImportProps) {
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ added: number; failed: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleParse() {
    setResult(null);
    setError(null);
    setParsed(parseCsv(text));
  }

  async function handleImport() {
    if (!parsed || parsed.rows.length === 0) { setError("Nothing to import."); return; }
    setImporting(true);
    setError(null);
    try {
      const r = await onImport(parsed.rows);
      setResult(r);
    } catch {
      setError("Import failed — try again.");
    } finally {
      setImporting(false);
    }
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
            <h2 className="text-xl font-bold">Import from CSV</h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Paste a CSV with columns: sku, quantity, condition, price, date, notes.
              First-column &ldquo;sku&rdquo; triggers header mode; otherwise positional.
            </p>
          </div>
          <button onClick={onClose} className="text-neutral-500 hover:text-white text-2xl leading-none">
            &times;
          </button>
        </div>

        <textarea
          value={text}
          onChange={(e) => { setText(e.target.value); setParsed(null); setResult(null); }}
          placeholder={`sku,quantity,condition,price,date\nOP01-001,4,NM,12.50,2026-03-01\nOP01-013,1,LP,40.00,2026-04-15`}
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
              Parsed: {parsed.rows.length} row{parsed.rows.length === 1 ? "" : "s"}
            </p>
            {parsed.warnings.length > 0 && (
              <ul className="mt-2 text-xs text-amber-400 space-y-0.5 max-h-32 overflow-y-auto">
                {parsed.warnings.map((w, i) => <li key={i}>⚠ {w}</li>)}
              </ul>
            )}
          </div>
        )}

        {result && (
          <div className="mt-4 bg-emerald-900/20 border border-emerald-700/40 rounded-lg p-3 text-sm">
            <p className="text-emerald-400 font-semibold">
              Imported {result.added} card{result.added === 1 ? "" : "s"}.
            </p>
            {result.failed.length > 0 && (
              <div className="mt-2">
                <p className="text-amber-400 text-xs">
                  Couldn&apos;t add {result.failed.length} SKU{result.failed.length === 1 ? "" : "s"} (catalog miss or error):
                </p>
                <p className="text-xs font-mono text-neutral-400 mt-0.5 break-all">
                  {result.failed.join(", ")}
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
              disabled={importing || parsed.rows.length === 0}
              className="text-sm bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black font-bold rounded-lg px-4 py-2 transition-colors"
            >
              {importing ? "Importing..." : `Add ${parsed.rows.length} cards`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
