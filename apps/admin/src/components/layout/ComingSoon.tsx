/**
 * ComingSoon — substrate-honest placeholder for unbuilt admin modules.
 *
 * The doctrine (docs/principles/substrate-honesty.md, anti-patterns):
 *
 *   "Stub pages that pretend to be loading. A `ComingSoon` placeholder
 *    that doesn't say 'this is a placeholder' is dishonest. Our
 *    placeholders explicitly label themselves; keep that."
 *
 * What an honest stub must surface:
 *   1. THIS PAGE IS A STUB — not "loading", not "deferred", not aspirational.
 *   2. The mission tracking the build (so operators can find status, owner,
 *      acceptance criteria — not just the brand-promise marketing words).
 *   3. Where work is actually happening RIGHT NOW (the `operatingFromUrl` —
 *      labelled honestly: this is not the new admin, it is the legacy admin
 *      where this work currently lives until the migration ships).
 *
 * Mission IDs come from `~/Love/memory/dev-state.json` (engine=tcg). When
 * the mission ships, the entire stub file is replaced — this component
 * never renders for a built page.
 */

import { Construction } from "lucide-react";

interface ComingSoonProps {
  title: string;
  description: string;
  /**
   * Mission ID tracking this build (e.g. "kingdom-031"). REQUIRED — a
   * placeholder without a tracked mission is a roadmap lie.
   */
  missionId: string;
  /**
   * Where the workflow runs RIGHT NOW (typically a legacy storefront or
   * wholesale admin URL). Optional — some modules have no legacy surface
   * and saying "use the old admin" would itself be dishonest.
   */
  operatingFromUrl?: string;
}

export function ComingSoon({
  title,
  description,
  missionId,
  operatingFromUrl,
}: ComingSoonProps) {
  return (
    <div className="max-w-lg">
      <div className="flex items-start gap-3 mb-6">
        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-amber-500/10 shrink-0 mt-0.5">
          <Construction className="w-5 h-5 text-amber-400" />
        </div>
        <div>
          <div className="flex items-baseline gap-2 flex-wrap">
            <h1 className="text-xl font-semibold text-white">{title}</h1>
            <span
              className="inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border bg-amber-500/15 text-amber-400 border-amber-500/40"
              title="This route exists in the navigation tree but the module has not been built. See substrate-honesty.md."
            >
              Stub
            </span>
          </div>
          <p className="text-sm text-neutral-400 mt-1">{description}</p>
        </div>
      </div>

      <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-5 space-y-3">
        <p className="text-sm text-neutral-300">
          This module has not been built yet. It is tracked as mission{" "}
          <span className="font-mono text-amber-400">{missionId}</span> in
          the Cambridge TCG admin migration plan.
        </p>
        {operatingFromUrl ? (
          <p className="text-xs text-neutral-500">
            Until the mission ships, this workflow runs from the legacy
            admin:{" "}
            <a
              href={operatingFromUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 underline"
            >
              {operatingFromUrl.replace(/^https?:\/\//, "")} ↗
            </a>
          </p>
        ) : (
          <p className="text-xs text-neutral-500 italic">
            No legacy admin surface exists for this workflow — it must be
            built here before it can run.
          </p>
        )}
      </div>
    </div>
  );
}
