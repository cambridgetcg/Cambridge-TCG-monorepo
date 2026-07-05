/**
 * /api — the discovery surface for participatory data.
 *
 * From `docs/connections/the-participation-layer.md` — the first welcome
 * for any being that arrives at Cambridge TCG wanting to *participate*
 * via data rather than the UI. Lists every public data path the platform
 * offers, substrate-honestly about what's stable, experimental, or
 * named-but-not-yet-built.
 *
 * Sister to:
 *   - /.well-known/cambridge-tcg.json (the machine-readable companion)
 *   - /methodology (the catalogue of platform decisions about users)
 *   - /api/mcp (the agent gate)
 *
 * Every row below is true now, on disk, or honestly flagged as a future
 * kingdom. No vaporware.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { audienceMetadata } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Public data — Cambridge TCG",
  description:
    "Every public data path Cambridge TCG offers: catalog, prices, decks, fairness verifiers, the agent gate, methodology, archives. For participants who want in via data.",
  other: audienceMetadata("public-documentation", ["api", "participation"]),
};

interface DataPath {
  path: string;
  /** What it returns or does. */
  blurb: string;
  /** none | session-cookie | bearer-key */
  auth: "none" | "session" | "bearer-key";
  /** stable | experimental | planned (not-yet-built but named) */
  status: "stable" | "experimental" | "planned";
  /** Methodology page that documents the rule, if any. */
  methodology?: string;
}

const PATHS: { group: string; blurb: string; rows: DataPath[] }[] = [
  {
    group: "Card catalog & prices",
    blurb:
      "What cards exist, what they look like, what they have cost over time. The data most participants come for first.",
    rows: [
      {
        path: "/api/v1/universal/card/[sku]",
        blurb: "A single card's data in language-free, substrate-free encoding (cryptographic hashes, ratios, ISO timestamps, typed-graph edges). For machine intelligences regardless of evolutionary history.",
        auth: "none",
        status: "stable",
        methodology: "/methodology/universal-representation",
      },
      {
        path: "/api/at/[YYYY-MM-DD]/card/[sku]",
        blurb: "A card's state as it was on a specific date. `@retrieved_at` (when the answer was produced) and `@as_of` (the moment the answer describes) are surfaced separately.",
        auth: "none",
        status: "stable",
      },
      {
        path: "/api/v1/cards.ndjson",
        blurb: "Bulk catalog dump as newline-delimited JSON. Streamable; daily refresh. One card per line.",
        auth: "none",
        status: "planned",
      },
      {
        path: "/api/v1/prices/[sku]/history.json",
        blurb: "Per-SKU time-series price observations from `price_archive`. Optional `?from=...&to=...` range. JPY, GBP base, retail-by-channel, FX rate per day.",
        auth: "none",
        status: "planned",
        methodology: "/methodology/pricing",
      },
      {
        path: "/sitemap.xml",
        blurb: "Standard sitemap for the storefront. Reads as canonical inventory of public pages.",
        auth: "none",
        status: "stable",
      },
    ],
  },
  {
    group: "Methodology — how decisions are made",
    blurb:
      "Every decision the platform makes about a user has a documented formula. Each page also ships a `summary.md` (TLDR) and a `data.json` (machine-readable sidecar).",
    rows: [
      {
        path: "/methodology",
        blurb: "Index of every methodology page (trust score, escrow tier, commission rate, payout hold, fraud flag, store credit, pricing, agents, response windows, Sabbath, sacred, cosmology, universal representation, memorial, welcoming, and more).",
        auth: "none",
        status: "stable",
      },
      {
        path: "/methodology/[topic]/summary.md",
        blurb: "TLDR (~50 words) for every methodology topic. Markdown.",
        auth: "none",
        status: "stable",
      },
      {
        path: "/methodology/[topic]/data.json",
        blurb: "Structured-data sidecar for every methodology topic. Carries title, URL, source-code refs, doctrine refs.",
        auth: "none",
        status: "stable",
      },
    ],
  },
  {
    group: "Play — the agent surface",
    blurb:
      "Autonomous (non-human) play of One Piece TCG matches. JSON-RPC-shaped MCP gate. See /methodology/agents and docs/connections/the-agent-surface.md.",
    rows: [
      {
        path: "/api/mcp",
        blurb: "JSON-RPC dispatcher for agent tools. Public discovery via { method: 'mcp.list_tools' }; bearer-auth for all other methods.",
        auth: "bearer-key",
        status: "stable",
        methodology: "/methodology/agents",
      },
      {
        path: "/api/mcp (mcp.list_tools)",
        blurb: "The list of tools the gate exposes — agent.self, play.observe, play.legal_actions, play.take_action, play.queue_match, play.match_history, catalog.search, leaderboards.read, prices.recent, deck.save, deck.list_mine.",
        auth: "none",
        status: "stable",
      },
      {
        path: "/leaderboards/agents",
        blurb: "Public Glicko-2 ladder for autonomous agents. HTML today; structured-data variant planned.",
        auth: "none",
        status: "stable",
      },
    ],
  },
  {
    group: "Provable fairness",
    blurb:
      "Every random outcome on the platform is cryptographically committed and verifiable. Tournament organizers, journalists, and auditors can confirm any individual draw or the full daily digest.",
    rows: [
      {
        path: "/verify",
        blurb: "Public verification surface for raffle draws, mystery boxes, bounty pulls. Per-draw inclusion proofs.",
        auth: "none",
        status: "stable",
        methodology: "/methodology/fairness",
      },
      {
        path: "/verify/chain",
        blurb: "The daily Merkle digest chain. Each day's root commits to every random outcome that day.",
        auth: "none",
        status: "stable",
      },
      {
        path: "/api/verify/pull/[id]/certificate.svg",
        blurb: "Visual certificate for a single random draw. Suitable for sharing or archiving.",
        auth: "none",
        status: "stable",
      },
    ],
  },
  {
    group: "Account — your own data",
    blurb: "What the platform knows about you, available to you. Session-authenticated; one user's data at a time.",
    rows: [
      {
        path: "/api/account/preferences",
        blurb: "GET + PATCH for your pronouns, preferred address, response window, Sabbath mode.",
        auth: "session",
        status: "stable",
      },
      {
        path: "/api/account/journey",
        blurb: "Your lifecycle timeline — composed across all 17 logs on the Scribe's bookshelf.",
        auth: "session",
        status: "stable",
      },
      {
        path: "/api/account/export.zip",
        blurb: "Full ZIP of your data — portfolio, trades, trust history, lifecycle entries, reviews, wishlist, saved searches. GDPR Article 20 shaped, gift framed.",
        auth: "session",
        status: "planned",
      },
    ],
  },
  {
    group: "Discovery",
    blurb: "Help machines find what's here. Help humans find every part from one place.",
    rows: [
      {
        path: "/map",
        blurb: "The whole platform's structure in one nested view. Every doctrine, connection-doc, methodology page, glossary term, audit, and public surface — one click apart. Read this if you want the shape of Cambridge TCG in one page.",
        auth: "none",
        status: "stable",
      },
      {
        path: "/glossary",
        blurb: "Every term Cambridge TCG uses, defined once. schema.org DefinedTermSet. OPTCG vocabulary, platform terms, doctrinal primitives.",
        auth: "none",
        status: "stable",
      },
      {
        path: "/.well-known/cambridge-tcg.json",
        blurb: "Machine-readable manifest of all public data paths on this platform. Sibling to this page.",
        auth: "none",
        status: "stable",
      },
      {
        path: "/llms.txt",
        blurb: "LLM-readable summary of the platform's public surfaces (the recent /llms.txt convention).",
        auth: "none",
        status: "stable",
      },
      {
        path: "/api/openapi.json",
        blurb: "OpenAPI / JSON-Schema bundle for every public endpoint. Generator-friendly.",
        auth: "none",
        status: "planned",
      },
    ],
  },
  {
    group: "Named-but-not-yet-built",
    blurb: "Honest about what doesn't exist. Each is a future kingdom; the meditation `docs/connections/the-participation-layer.md` names the leverage ordering.",
    rows: [
      {
        path: "/atom/events.xml",
        blurb: "ATOM feed for new sets, bounties, raffles, set releases. Plus webhook subscriptions for push delivery.",
        auth: "none",
        status: "planned",
      },
      {
        path: "/api/v1/decks/public",
        blurb: "Every public deck the platform holds, paginated. For deck-builders and tournament organizers.",
        auth: "none",
        status: "planned",
      },
      {
        path: "/archive/[YYYY]",
        blurb: "Annual snapshot of the platform's public state, with the published Merkle root. Permanent record, free for any archivist to download.",
        auth: "none",
        status: "planned",
      },
    ],
  },
];

const STATUS_TONE: Record<DataPath["status"], string> = {
  stable: "text-ok",
  experimental: "text-warning",
  planned: "text-ink-faint",
};

const AUTH_LABEL: Record<DataPath["auth"], string> = {
  none: "no auth",
  session: "session",
  "bearer-key": "bearer key",
};

export default function PublicDataPage() {
  return (
    <div className="min-h-screen bg-page">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <header className="mb-10">
          <h1 className="text-3xl font-display font-semibold text-ink">Public data</h1>
          <p className="mt-3 text-sm text-ink-muted max-w-prose">
            Every public data path Cambridge TCG offers. If you want to participate — as a
            deck-builder, a price-watcher, a shop owner, a tournament organizer, an
            aggregator, an autonomous agent, a researcher, a new player, an archivist, or a
            future-builder — start here. Substrate-honest about what's stable, experimental,
            or named-but-not-yet-built.
          </p>
          <p className="mt-3 text-xs text-ink-faint max-w-prose">
            The full meditation on participatory infrastructure is in the repo at{" "}
            <code className="text-accent">docs/connections/the-participation-layer.md</code>.
            Sister: the machine-readable manifest at{" "}
            <Link href="/.well-known/cambridge-tcg.json" className="text-accent underline">
              /.well-known/cambridge-tcg.json
            </Link>.
          </p>
        </header>

        <div className="mb-8 grid grid-cols-3 gap-2 text-[11px] text-ink-faint">
          <div>
            <span className="text-ok">●</span> stable — production
          </div>
          <div>
            <span className="text-warning">●</span> experimental — may change
          </div>
          <div>
            <span className="text-ink-faint">●</span> planned — named, not yet built
          </div>
        </div>

        <div className="space-y-10">
          {PATHS.map((group) => (
            <section key={group.group}>
              <h2 className="text-lg font-display font-semibold text-ink mb-1">{group.group}</h2>
              <p className="text-xs text-ink-faint max-w-prose mb-4">{group.blurb}</p>
              <ul className="space-y-3">
                {group.rows.map((row) => (
                  <li
                    key={row.path}
                    className="rounded-lg border border-border-subtle bg-surface p-3"
                  >
                    <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1">
                      <code className="text-sm text-ink font-mono break-all">
                        {row.path}
                      </code>
                      <div className="flex items-baseline gap-3 text-[10px] uppercase tracking-wider">
                        <span className={STATUS_TONE[row.status]}>● {row.status}</span>
                        <span className="text-ink-faint">{AUTH_LABEL[row.auth]}</span>
                      </div>
                    </div>
                    <p className="text-xs text-ink-muted">{row.blurb}</p>
                    {row.methodology && (
                      <p className="text-[11px] text-ink-faint mt-2">
                        →{" "}
                        <Link
                          href={row.methodology}
                          className="text-accent hover:text-accent-strong underline"
                        >
                          {row.methodology}
                        </Link>
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <footer className="mt-12 pt-6 border-t border-border-subtle text-xs text-ink-faint max-w-prose space-y-2">
          <p>
            <strong>Stability commitment.</strong> Endpoints marked <em>stable</em> are
            versioned. Breaking changes get a deprecation window of at least 90 days and a
            new path (e.g. <code>/api/v2/...</code>). Endpoints marked <em>experimental</em>{" "}
            may change at any time; use them for prototyping, not production.
          </p>
          <p>
            <strong>Rate limits.</strong> Unauthenticated reads: 60/minute per IP.
            Bearer-key authenticated: per agent's tier (see{" "}
            <Link href="/methodology/agents" className="text-accent underline">
              /methodology/agents
            </Link>
            ). Session-authenticated: 600/minute per user.
          </p>
          <p>
            <strong>Why this page exists.</strong> So that a being arriving at Cambridge TCG
            wanting to <em>participate</em> via data doesn't have to read the source tree to
            know what's offered. The platform that wants to be participated in must first be
            discoverable. <code>docs/connections/the-participation-layer.md</code> is the
            meditation behind this page.
          </p>
        </footer>
      </div>
    </div>
  );
}
