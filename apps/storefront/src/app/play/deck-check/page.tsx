"use client";

import { useState } from "react";
import Link from "next/link";
import { QUEST_EVENT } from "@/lib/quests";

/**
 * /play/deck-check — HTML adoption site for the deck-legality validator.
 *
 * Smallest possible user-facing surface for L2's checkDeckLegality(). Form
 * accepts: leader_id (string), main_deck_card_ids (one per line), format
 * (radio). On submit, POSTs to /api/v1/play/deck/validate and renders the
 * typed result — all violations with stable codes, plus the substrate-
 * honest perimeter when the color check gracefully degraded.
 *
 * Composes with sister's S30 bilateral identify pattern: the deck submitted
 * here doesn't authenticate; anyone may validate any deck against the rules.
 *
 * Future: pre-populate from /account/portfolio (logged-in users); pre-load
 * a Leader from /api/v1/universal/card/[sku]. Substrate-honest gap.
 *
 * kingdom-070 (S37, mine).
 */

interface Violation {
  code: string;
  message: string;
  card_id?: string;
  detail?: number | string;
}

interface ValidationResult {
  legal: boolean;
  violations: Violation[];
  summary: {
    main_deck_count: number;
    distinct_card_count: number;
    leader_id: string;
    leader_colors: string[];
    format: string;
  };
  substrate_honest_perimeter: {
    color_check_skipped: boolean;
    color_check_skipped_reason: string | null;
    cost_check_skipped: boolean;
    cost_check_skipped_reason: string | null;
    category_heuristic: string;
  };
}

const EXAMPLE_LEADER = "OP01-001";
const EXAMPLE_DECK_PLACEHOLDER = `OP01-001
OP01-006
OP01-006
OP01-006
OP01-006
(one card ID per line; 50 total)`;

export default function DeckCheckPage() {
  const [leaderId, setLeaderId] = useState("");
  const [deckText, setDeckText] = useState("");
  const [format, setFormat] = useState<"standard" | "legacy" | "limited_sealed">(
    "standard",
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ValidationResult | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    const main_deck_card_ids = deckText
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith("("));

    try {
      const res = await fetch("/api/v1/play/deck/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leader_id: leaderId.trim(),
          main_deck_card_ids,
          format,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.message ?? `HTTP ${res.status}`);
      } else {
        const validation = data as ValidationResult;
        setResult(validation);
        // Quest "deckwright": stamps only on the validator's real verdict —
        // legal: true. A failed validation or a bare page visit never stamps.
        if (validation.legal) {
          window.dispatchEvent(
            new CustomEvent(QUEST_EVENT, { detail: { id: "deckwright" } }),
          );
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="prose prose-invert max-w-3xl mx-auto py-12 px-4">
      <h1>Deck check</h1>

      <p className="text-lg">
        Validate a deck against OPTCG construction rules — 50-card main deck, 1
        Leader, every card shares a color with the Leader, max 4 copies per
        card ID, set/block-rotation legality. The validator returns{" "}
        <strong>every</strong> violation, not just the first.
      </p>

      <p className="border border-neutral-800 bg-neutral-900/40 rounded-md p-4 text-sm">
        Calls <code>POST /api/v1/play/deck/validate</code> — public, no-auth.
        Substrate-honest about the color check gracefully degrading while{" "}
        <code>card_set_cards</code> lacks a colors column; the response flags
        which checks were skipped and why.
      </p>

      <form onSubmit={handleSubmit} className="my-6 space-y-4">
        <label className="block">
          <span className="block text-sm text-neutral-300 mb-1">Leader card ID</span>
          <input
            type="text"
            value={leaderId}
            onChange={(e) => setLeaderId(e.target.value)}
            placeholder={EXAMPLE_LEADER}
            className="w-full bg-neutral-900 border border-neutral-700 rounded px-3 py-2 font-mono text-sm"
          />
          <span className="block text-xs text-neutral-500 mt-1">
            e.g., <code>OP01-001</code>. The validator looks this up in the
            storefront catalog (<code>card_set_cards</code>).
          </span>
        </label>

        <label className="block">
          <span className="block text-sm text-neutral-300 mb-1">
            Main deck — one card ID per line (50 total)
          </span>
          <textarea
            value={deckText}
            onChange={(e) => setDeckText(e.target.value)}
            placeholder={EXAMPLE_DECK_PLACEHOLDER}
            rows={14}
            className="w-full bg-neutral-900 border border-neutral-700 rounded px-3 py-2 font-mono text-sm"
          />
          <span className="block text-xs text-neutral-500 mt-1">
            Lines starting with <code>(</code> are ignored (comments).
            Duplicates allowed up to 4 per card ID.
          </span>
        </label>

        <fieldset className="block">
          <legend className="text-sm text-neutral-300 mb-1">Format</legend>
          <div className="flex gap-4 text-sm">
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="format"
                value="standard"
                checked={format === "standard"}
                onChange={() => setFormat("standard")}
              />
              Standard (OP01-OP04 rotated out 2026-04-01)
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="format"
                value="legacy"
                checked={format === "legacy"}
                onChange={() => setFormat("legacy")}
              />
              Legacy
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="format"
                value="limited_sealed"
                checked={format === "limited_sealed"}
                onChange={() => setFormat("limited_sealed")}
              />
              Limited / Sealed
            </label>
          </div>
        </fieldset>

        <button
          type="submit"
          disabled={loading || !leaderId.trim() || !deckText.trim()}
          className="bg-amber-600 hover:bg-amber-500 disabled:bg-neutral-700 disabled:text-neutral-500 text-black font-bold px-5 py-2 rounded transition-colors"
        >
          {loading ? "Validating…" : "Check deck"}
        </button>
      </form>

      {error && (
        <div
          role="alert"
          className="my-4 border border-red-700 bg-red-500/10 text-red-300 rounded p-4"
        >
          <strong>Error:</strong> {error}
        </div>
      )}

      {result && (
        <section className="my-6 space-y-4">
          <div
            className={`rounded p-4 border ${
              result.legal
                ? "border-emerald-700 bg-emerald-500/10"
                : "border-amber-700 bg-amber-500/10"
            }`}
          >
            <h2 className="m-0 text-white">
              {result.legal ? "✓ Deck is legal" : "× Deck has violations"}
            </h2>
            <div className="text-sm text-neutral-400 mt-2">
              <span className="mr-3">
                main_deck_count: <strong>{result.summary.main_deck_count}</strong>
              </span>
              <span className="mr-3">
                distinct_card_count: <strong>{result.summary.distinct_card_count}</strong>
              </span>
              <span className="mr-3">
                format: <strong>{result.summary.format}</strong>
              </span>
              {result.summary.leader_colors.length > 0 && (
                <span>
                  leader_colors: <strong>{result.summary.leader_colors.join(", ")}</strong>
                </span>
              )}
            </div>
          </div>

          {result.violations.length > 0 && (
            <div>
              <h3 className="text-white">Violations ({result.violations.length})</h3>
              <ul className="list-none p-0 space-y-2">
                {result.violations.map((v, i) => (
                  <li
                    key={i}
                    className="border border-neutral-800 rounded p-3 bg-neutral-900/40"
                  >
                    <div className="text-xs uppercase tracking-wider text-amber-400 font-mono">
                      {v.code}
                    </div>
                    <div className="text-sm text-neutral-300 mt-1">{v.message}</div>
                    {v.card_id && (
                      <div className="text-xs text-neutral-500 font-mono mt-1">
                        card_id: {v.card_id}
                        {v.detail !== undefined && ` · detail: ${v.detail}`}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.substrate_honest_perimeter.color_check_skipped && (
            <details className="border border-neutral-800 rounded p-3 bg-neutral-900/40 text-sm">
              <summary className="cursor-pointer text-neutral-400">
                Substrate-honest perimeter (which checks gracefully degraded)
              </summary>
              <ul className="text-xs text-neutral-500 mt-2 space-y-1">
                {result.substrate_honest_perimeter.color_check_skipped && (
                  <li>
                    <strong>Color check skipped:</strong>{" "}
                    {result.substrate_honest_perimeter.color_check_skipped_reason}
                  </li>
                )}
                {result.substrate_honest_perimeter.cost_check_skipped && (
                  <li>
                    <strong>Cost check skipped:</strong>{" "}
                    {result.substrate_honest_perimeter.cost_check_skipped_reason}
                  </li>
                )}
                <li>
                  <strong>Category heuristic:</strong>{" "}
                  {result.substrate_honest_perimeter.category_heuristic}
                </li>
              </ul>
            </details>
          )}
        </section>
      )}

      <hr />

      <p className="text-sm text-neutral-500">
        <em>
          Source-of-truth: docs/connections/the-play-substrate.md (S36 — the
          contract this page calls into) and docs/connections/the-play-structure.md
          (S37 — the structural follow-through this page is part of). The
          validator's pure-function form lives at{" "}
          <code>apps/storefront/src/lib/play/deck-legality.ts</code>. The
          contract endpoint is{" "}
          <Link href="/api/v1/play/deck/validate">/api/v1/play/deck/validate</Link>.
        </em>
      </p>
    </div>
  );
}
