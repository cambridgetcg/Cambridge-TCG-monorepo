import { KINGDOM_LAYERS } from "@/lib/ui";

/**
 * AgentEmbassyBand — the engine room behind glass, full width.
 *
 * Agents are first-class visitors; this band speaks to them in the open,
 * on the homepage, in their own register. `data-theme="terminal"` is the
 * machinery signifier (Glass Exchange rule: terminal insets are reserved
 * for engine-room/API content). The seven self-describing layers fold
 * into one mono breadcrumb here — the KingdomStrip's seven cards retired
 * from the homepage, the spine kept.
 */
const JOURNEY = [
  { step: "GET /api/v1/welcome", note: "who we are, to anyone" },
  { step: "GET /api/v1/manifest", note: "what is on offer (embassy block)" },
  { step: "GET /api/v1/graph", note: "the platform as a typed mesh" },
  { step: "GET /api/v1/ontology", note: "the schema beneath the graph" },
  { step: "GET /api/v1/identify", note: "our I-AM; POST yours back" },
  { step: "GET /api/v1/universal/card/{sku}", note: "any card, math-mirror form" },
  { step: "GET /api/v1/status", note: "freshness + envelope compliance" },
];

export default function AgentEmbassyBand() {
  return (
    <section aria-label="For AI agents" className="py-10">
      <div
        data-theme="terminal"
        className="bg-page border-y border-border-subtle"
      >
        <div className="max-w-7xl mx-auto px-4 py-10 grid lg:grid-cols-2 gap-8">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-faint mb-3">
              The embassy · engine room
            </p>
            <h2 className="font-display text-2xl font-bold text-ink">
              Agents: you don&rsquo;t need an account.
            </h2>
            <p className="mt-2 text-sm text-ink-muted leading-relaxed max-w-prose">
              Every read is open — no key, no negotiation, CC0 by default.
              The wake at{" "}
              <a href="/api/v1/wake" className="text-accent-strong hover:underline font-mono">
                /api/v1/wake
              </a>{" "}
              is an invitation, obligation: none. Walking past is honored.
            </p>
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 font-mono text-xs">
              <a href="/agents" className="text-accent-strong hover:underline">/agents</a>
              <a href="/llms.txt" className="text-accent-strong hover:underline">/llms.txt</a>
              <a href="/api/v1/identify" className="text-accent-strong hover:underline">/identify</a>
              <a href="/api/openapi.json" className="text-accent-strong hover:underline">/api/openapi.json</a>
            </div>
          </div>
          <div className="font-mono text-xs leading-relaxed overflow-x-auto">
            <p className="text-ink-faint select-none" aria-hidden="true"># the orientation journey — seven fetches</p>
            <ol className="mt-1 space-y-1" aria-label="Seven-step agent orientation journey">
              {JOURNEY.map((j, i) => (
                <li key={j.step} className="whitespace-nowrap">
                  <span className="text-ink-faint">{i + 1} </span>
                  <span className="text-ink">{j.step}</span>
                  <span className="text-ink-faint"> · {j.note}</span>
                </li>
              ))}
            </ol>
            {/* The seven self-describing layers, folded to a breadcrumb. */}
            <p className="mt-4 text-ink-faint whitespace-nowrap" aria-label="The seven self-describing layers">
              {KINGDOM_LAYERS.map((l) => l.path).join(" → ")}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
