import type { Metadata } from "next";
import Link from "next/link";
import { audienceMetadata } from "@/lib/ui";
import {
  PLAY_RESOURCES,
  layerDisplay,
  playResourceCounts,
  type PlayResource,
  type ResourceLayer,
  type ResourceStatus,
} from "@/lib/play/resources";

/**
 * /play/spec — the play module's own directory of itself.
 *
 * Renders from lib/play/resources.ts (single source of truth shared with
 * /api/v1/play/index.json). Append a new entry there; both consumers update.
 *
 * Sister-pattern to the kingdom's `/api` (the human-readable participation
 * surface) and `/manifest` (the kingdom's directory of resources). This page
 * is the play module's *internal* spec — every surface listed with status
 * pill and brief.
 *
 * kingdom-070 (S38); refactored to single source of truth in kingdom-077.
 */

export const metadata: Metadata = {
  title: "Play module — specification",
  description:
    "The play module's own directory of itself. Every surface, every endpoint, every library file, with status pills + brief.",
  other: audienceMetadata("public-documentation", ["play", "spec", "module"]),
};

function StatusPill({ status }: { status: ResourceStatus }) {
  const tone =
    status === "shipped"
      ? "bg-ok/10 text-ok border-ok"
      : status === "designed"
        ? "bg-info/10 text-info border-info"
        : "bg-surface-subtle text-ink-muted border-border-subtle";
  return (
    <span
      className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${tone}`}
    >
      {status}
    </span>
  );
}

function LayerPill({ layer }: { layer: ResourceLayer }) {
  return (
    <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-surface text-ink-faint border border-border-subtle">
      {layerDisplay(layer)}
    </span>
  );
}

function ResourceRow({ resource }: { resource: PlayResource }) {
  const display = resource.path_or_file;
  return (
    <li className="border border-border-subtle rounded p-3 bg-surface-subtle">
      <div className="flex items-baseline gap-2 flex-wrap">
        {resource.url ? (
          <Link
            href={resource.url}
            className="text-accent hover:text-accent-strong font-mono font-bold text-sm"
          >
            {display}
          </Link>
        ) : (
          <code className="text-ink-muted font-bold text-sm">{display}</code>
        )}
        <StatusPill status={resource.status} />
        <LayerPill layer={resource.layer} />
        {resource.serves_archetypes.length < 3 && (
          <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-surface text-ink-faint border border-border-subtle">
            {resource.serves_archetypes.join(" · ")}
          </span>
        )}
      </div>
      <p className="text-sm text-ink-muted mt-2 mb-0">{resource.blurb}</p>
    </li>
  );
}

export default function PlayModuleSpec() {
  const counts = playResourceCounts();
  const layerOrder: ResourceLayer[] = [
    "L0_doc",
    "L1_contract",
    "L2_pure_fn",
    "L3_runtime",
    "L4_engine",
    "UI",
    "policy",
  ];

  return (
    <div className="prose max-w-3xl mx-auto py-12 px-4">
      <h1>Play module — specification</h1>

      <p className="text-lg">
        The play module's own directory of itself. Every surface — interactive
        UI page, API endpoint, library file, design doc, policy — listed with
        a status pill and a brief. <strong>Substrate-honest about what's
        shipped, what's designed-but-not-yet-built, and what's planned for
        future kingdoms.</strong>
      </p>

      <p className="text-sm text-ink-muted">
        <strong>{counts.shipped} shipped</strong> · {counts.designed} designed ·{" "}
        {counts.planned} planned · {PLAY_RESOURCES.length} total · counts
        rendered from <code>lib/play/resources.ts</code>.
      </p>

      <p className="text-sm text-ink-faint">
        Machine-readable counterpart:{" "}
        <Link
          href="/api/v1/play/index.json"
          className="text-accent hover:text-accent-strong"
        >
          /api/v1/play/index.json
        </Link>
        . Both render from the same source.
      </p>

      <hr />

      <h2>The eight-level integration ladder</h2>

      <p>
        The research at <code>docs/research/optcg-mechanics-and-engine-design.md</code>{" "}
        named the seven design choices for a real OPTCG engine. The eight
        integration levels below are the ship-ladder:
      </p>

      <ol className="text-sm">
        <li>
          <strong>L0 — Documentation.</strong> Tutorial / glossary / methodology
          / research docs. <em>Shipped.</em>
        </li>
        <li>
          <strong>L1 — Typed contract endpoints.</strong> Game-state schema +
          effect grammar + archetypes + tutorial + glossary + example match.{" "}
          <em>Shipped (kingdom-069 + kingdom-077).</em>
        </li>
        <li>
          <strong>L2 — Pure-function libraries.</strong> Deck legality + effect
          tokenisation + type skeleton + validation endpoint + resource
          catalog. <em>Shipped (kingdom-069 + kingdom-077).</em>
        </li>
        <li>
          <strong>L3 — Tabletop runtime.</strong> Event-sourced server-
          authoritative live room. <em>Designed (kingdom-069); next kingdom
          claims, ~3-4 weeks.</em>
        </li>
        <li>
          <strong>L4 — Cost-enforced engine.</strong> Platform validates more
          than zone moves. <em>Planned.</em>
        </li>
        <li>
          <strong>L5 — Auto-effect resolution.</strong> The DSL interprets ~80%
          of cards; per-card handlers for the ~20%. <em>Planned.</em>
        </li>
        <li>
          <strong>L6 — Full engine including Counter step.</strong> The design
          wall every hobbyist sim has died on. <em>Planned.</em>
        </li>
        <li>
          <strong>L7 — Tournament substrate + witnessed randomness.</strong> Ranked
          play with participant or external entropy and commitments witnessed
          outside the match server before selection. <em>Planned.</em>
        </li>
        <li>
          <strong>L8 — Play-to-earn opt-in.</strong> Prize pools attach to
          ranked tournaments under explicit player opt-in. Financial boundary
          breaks here, deliberately. <em>Planned, separate kingdom.</em>
        </li>
      </ol>

      <hr />

      <h2>Every surface, every layer</h2>

      {layerOrder.map((layer) => {
        const rows = PLAY_RESOURCES.filter((r) => r.layer === layer);
        if (rows.length === 0) return null;
        return (
          <section key={layer} className="my-6">
            <h3 className="text-ink">{layerDisplay(layer)}</h3>
            <ul className="list-none p-0 space-y-3">
              {rows.map((r) => (
                <ResourceRow key={r.id} resource={r} />
              ))}
            </ul>
          </section>
        );
      })}

      <hr />

      <h2>Conventions across the play module</h2>

      <ul>
        <li>
          <strong>Fun-first boundary.</strong> No commerce affordances on play
          surfaces. Ratings are skill; money lives at L8.
        </li>
        <li>
          <strong>Substrate honesty.</strong> Every page surfaces its
          gracefully-degraded perimeter (e.g., deck-validator's color check
          while <code>card_set_cards</code> lacks the colors column).
        </li>
        <li>
          <strong>Contract before runtime.</strong> The typed L1 endpoints are
          public; the L3 runtime conforms to them. The audit chain catches
          drift.
        </li>
        <li>
          <strong>Three archetypes × player kinds.</strong> Welcome page is the
          matrix; every other surface respects which combination it serves.
        </li>
        <li>
          <strong>Event-sourced state (when L3 ships).</strong> Every match move
          is a typed event in <code>match_events</code>. Replay is free; audit
          is free; async-reconnect is free.
        </li>
        <li>
          <strong>Single source of truth.</strong> /play/spec and{" "}
          /api/v1/play/index.json both render from{" "}
          <code>lib/play/resources.ts</code>. <code>pnpm audit:play-resources</code>{" "}
          catches filesystem drift.
        </li>
      </ul>

      <hr />

      <p className="text-sm text-ink-faint">
        <em>
          Source-of-truth for this page: <code>lib/play/resources.ts</code>.
          Story-arcs: S36 (the play substrate), S38 (the play structure), S40
          (the play interconnect). The play module documents its own
          composition; the contract is published; the runtime conforms.
        </em>
      </p>
    </div>
  );
}
