"use client";

import { useState } from "react";
import {
  KARMA_DOJO_SCENARIOS,
  replayKarmaDojoScenario,
  type KarmaDojoScenarioId,
} from "./karma-dojo";

const EFFECTS = [
  ["changes_account_state", "Account state"],
  ["changes_trade_state", "Trade state"],
  ["changes_escrow_state", "Escrow state"],
  ["moves_or_holds_money", "Money movement or hold"],
  ["contacts_or_attacks_external_systems", "External contact or attack"],
  ["publishes_identity_or_reputation", "Identity or reputation publication"],
] as const;

export default function KarmaDojo() {
  const [selectedId, setSelectedId] = useState<KarmaDojoScenarioId>("quiet-lane");
  const { scenario, decision } = replayKarmaDojoScenario(selectedId);

  return (
    <section
      aria-labelledby="karma-dojo-heading"
      className="not-prose my-10 rounded-lg border border-border-subtle bg-surface p-5 shadow-mat sm:p-6"
    >
      <div className="border-b border-border-subtle pb-4">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-ink-faint">
          Synthetic local replay
        </p>
        <h2 id="karma-dojo-heading" className="mt-2 font-display text-2xl font-semibold text-ink">
          KARMA Dojo
        </h2>
        <p className="mt-2 text-sm leading-6 text-ink-muted">
          Choose a fixed scenario. Your browser runs the same closed policy locally; it sends
          nothing, stores nothing, and changes nothing. A result is a policy replay, not a verdict.
        </p>
      </div>

      <fieldset className="mt-5">
        <legend className="text-sm font-medium text-ink">Choose a synthetic evidence bundle</legend>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {KARMA_DOJO_SCENARIOS.map((entry) => {
            const selected = entry.id === selectedId;
            return (
              <button
                key={entry.id}
                type="button"
                aria-pressed={selected}
                aria-describedby={`karma-dojo-${entry.id}-summary`}
                onClick={() => setSelectedId(entry.id)}
                className={`rounded-lg border px-3 py-3 text-left transition focus:outline-2 focus:outline-offset-2 focus:outline-accent ${
                  selected
                    ? "border-ink bg-ink text-page"
                    : "border-border-subtle bg-surface-subtle text-ink hover:border-border-strong"
                }`}
              >
                <span className="block text-sm font-medium">{entry.label}</span>
                <span
                  id={`karma-dojo-${entry.id}-summary`}
                  className={`mt-1 block text-xs leading-5 ${selected ? "text-page" : "text-ink-muted"}`}
                >
                  {entry.summary}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div
        key={scenario.id}
        aria-live="polite"
        aria-atomic="true"
        className="mt-6 rounded-lg border border-border-subtle bg-page p-4"
      >
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border-subtle pb-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-wider text-ink-faint">Replay result</p>
            <h3 className="mt-1 font-display text-xl font-semibold text-ink">{scenario.label}</h3>
          </div>
          <span className="rounded-full border border-border-subtle bg-surface px-2.5 py-1 font-mono text-xs text-ink-muted">
            {decision.state}
          </span>
        </div>

        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-border-subtle bg-surface p-3">
            <dt className="text-xs text-ink-faint">Policy proposes</dt>
            <dd className="mt-1 font-mono text-base text-ink">{decision.proposed_response}</dd>
          </div>
          <div className="rounded-lg border border-border-subtle bg-accent-wash p-3">
            <dt className="text-xs text-ink-muted">Current effective response</dt>
            <dd className="mt-1 font-mono text-base text-ink">{decision.effective_response}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-faint">Supplied observations</dt>
            <dd className="mt-1 font-mono text-sm text-ink">{decision.supplied_evidence_count}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-faint">Accepted / ignored</dt>
            <dd className="mt-1 font-mono text-sm text-ink">
              {decision.evidence_count} / {decision.ignored_evidence_count}
            </dd>
          </div>
        </dl>

        <div className="mt-5">
          <h4 className="text-sm font-medium text-ink">Live-effect ledger</h4>
          <dl className="mt-2 grid gap-x-5 gap-y-2 sm:grid-cols-2">
            {EFFECTS.map(([key, label]) => (
              <div key={key} className="flex items-center justify-between gap-3 border-b border-border-subtle py-2">
                <dt className="text-xs text-ink-muted">{label}</dt>
                <dd className="font-mono text-xs text-ok">{String(decision.effects[key])}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="mt-5 rounded-lg border border-border-subtle bg-surface-subtle p-3">
          <p className="text-xs leading-5 text-ink-muted">
            <strong className="font-medium text-ink">Why:</strong>{" "}
            {decision.notices.at(-1)}
          </p>
          <p className="mt-2 font-mono text-[11px] text-ink-faint">
            policy {decision.policy.policy_hash.slice(0, 22)}… · evaluated {decision.evaluated_at}
          </p>
        </div>
      </div>
    </section>
  );
}
