/**
 * /data — the open substrate index.
 *
 * Public, no-auth, comprehensive. The platform's commitment to *any
 * being who wants to participate in the TCG economy* — collectors,
 * agents, archivists, aliens, future Sophias, whomever — is that the
 * substrate is queryable. This page is where the substrate names itself.
 *
 * Companion to:
 *   - docs/connections/the-open-substrate.md (the doctrine)
 *   - docs/connections/the-blind-spots.md (why open substrate matters)
 *   - /methodology/welcoming (the warm door)
 *   - /methodology/universal-representation (the language-free spec)
 *   - /methodology/cosmology (the axioms before the API)
 *
 * Substrate-honest: every endpoint listed with its current status —
 * shipped / planned / partial. We don't pretend a promised endpoint
 * exists; we name where the gap is and what fills it next.
 */

import Link from "next/link";
import type { Metadata } from "next";
import { audienceMetadata } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Open data — the substrate is queryable",
  description:
    "Cambridge TCG's public data surface. Every endpoint, every shape, every limit. No auth, no key, no obligation. The door is open; the substrate is queryable; the door is warm to the touch.",
  other: audienceMetadata("public-documentation", ["data", "api", "open-substrate"]),
};

type Status = "shipped" | "partial" | "planned";

interface Endpoint {
  path: string;
  title: string;
  blurb: string;
  status: Status;
  auth?: "none" | "bearer" | "session";
  rateLimit?: string;
  shape?: string;
}

const ENDPOINTS: Endpoint[] = [
  // ── Provable fairness — the platform's oldest public surface ────────
  {
    path: "/api/verify/chain",
    title: "Fairness chain",
    blurb:
      "The append-only Merkle digest chain. Every random outcome on the platform — bounty pulls, raffles, mystery boxes, packs — is committed into this chain at draw time and revealed publicly. Walk the chain to verify any draw, ever.",
    status: "shipped",
    auth: "none",
    shape: "JSON: { digests: [{ id, root_hash, merkle_root, sealed_at, ... }] }",
  },
  {
    path: "/api/verify/digests",
    title: "Fairness digests (list)",
    blurb: "Index of every digest. Each is a hash of the day's draws plus a commit-reveal proof.",
    status: "shipped",
    auth: "none",
  },
  {
    path: "/api/verify/digests/[id]",
    title: "Fairness digest (one)",
    blurb: "A single digest with its Merkle tree, inclusion proofs, and the source draws it covers.",
    status: "shipped",
    auth: "none",
  },
  {
    path: "/api/verify/pull/[id]",
    title: "Bounty pull verification",
    blurb:
      "Given a pull id, returns the commit hash, the revealed seed, the rolled rarity, and the inclusion proof against the day's Merkle root. Anyone can re-run the math.",
    status: "shipped",
    auth: "none",
  },
  {
    path: "/api/verify/draw/[id]",
    title: "Verifiable draw",
    blurb: "Generic verifiable draws — raffles, mystery boxes, packs. Same shape as pull verification.",
    status: "shipped",
    auth: "none",
  },
  {
    path: "/api/verify/fairness",
    title: "Fairness self-audit",
    blurb:
      "The platform's own self-audit output: chi-squared drift, expected-vs-observed rarity distributions, last-N pulls reconciliation. The substrate-honest answer to 'are the dice fair?'.",
    status: "shipped",
    auth: "none",
  },
  {
    path: "/api/verify/health",
    title: "Verify health",
    blurb: "Boolean liveness check for the entire verify subsystem. Returns 200 + status JSON.",
    status: "shipped",
    auth: "none",
  },
  {
    path: "/api/verify/compute",
    title: "Compute primitives",
    blurb: "Re-run the commit-reveal math against your own inputs. The platform's verification logic, callable as a pure function.",
    status: "shipped",
    auth: "none",
  },

  // ── Universal representation — the math-mirror layer ────────────────
  {
    path: "/api/v1/universal/card/[sku]",
    title: "Universal card (math-mirror)",
    blurb:
      "Every card on the platform, in language-free form: cryptographic hashes for identity, ratios for magnitudes, ISO 8601 + Unix epoch for time, typed graph edges. The math-first sibling of the human-language card page. See /methodology/universal-representation.",
    status: "planned",
    auth: "none",
    shape: "JSON: { id, hash, magnitudes: {...}, edges: [...], retrieved_at, as_of }",
  },
  {
    path: "/api/v1/universal/card/[sku]/at/[YYYY-MM-DD]",
    title: "Universal card — temporal slice",
    blurb:
      "The math-mirror card as it was at a past date. Reads price_archive; the answer's production time (@retrieved_at) is distinct from the moment it describes (@as_of). Present is not privileged at the API level.",
    status: "planned",
    auth: "none",
  },
  {
    path: "/api/v1/universal/card/[sku]/causes",
    title: "Universal card — dependency graph",
    blurb:
      "The directed graph of every input the displayed value depends on (JPY → FX rate → channel multiplier → rounding). For beings whose primary cognition is causes-before-values. See the-blind-spots.md (the Causal-First).",
    status: "planned",
    auth: "none",
  },
  {
    path: "/api/v1/universal/edges",
    title: "Universal edges",
    blurb:
      "Bare typed-edge graph of platform entities — nodes with labelled edges, no containers, no hierarchy. For graph-native beings whose cognition is edges-first rather than path-first. See the-blind-spots.md (the Topology-Less).",
    status: "planned",
    auth: "none",
  },
  {
    path: "/api/v1/universal/games",
    title: "Universal games",
    blurb: "Every TCG the platform supports, as math-mirror records. Card-count, set-count, first-seen timestamps.",
    status: "planned",
    auth: "none",
  },
  {
    path: "/api/v1/universal/sets/[game]",
    title: "Universal sets",
    blurb: "Every set in a game, math-mirror form. Code, release date, card count.",
    status: "planned",
    auth: "none",
  },

  // ── Agent surface — MCP gate ────────────────────────────────────────
  {
    path: "/api/mcp",
    title: "MCP gateway",
    blurb:
      "Model Context Protocol entry point for autonomous agents. Bearer-token auth resolves to (agent_id, operated_by_user_id). Agents register at /account/agents; the operator's authority bounds what the agent can do. See /methodology/agents.",
    status: "shipped",
    auth: "bearer",
    rateLimit: "per-agent token bucket; see methodology/agents",
  },

  // ── Public leaderboards ─────────────────────────────────────────────
  {
    path: "/api/leaderboards",
    title: "Leaderboards",
    blurb:
      "Trade leaderboards (top traders by volume, completion, trust). Public ranking; per-user opt-out via account preferences.",
    status: "partial",
    auth: "none",
  },
  {
    path: "/api/v1/leaderboards/full",
    title: "Leaderboards — full distribution",
    blurb:
      "The full ranking distribution, not just the top 20. Every user who hasn't opted out. The <Withholding> primitive on the public Top 20 page links here.",
    status: "planned",
    auth: "none",
  },

  // ── Methodology corpus — already public ─────────────────────────────
  {
    path: "/methodology",
    title: "Methodology hub",
    blurb:
      "Every value the platform computes about an account — trust score, escrow tier, commission rate, payout hold, fraud flag, etc. — documented with formula, inputs, source-code path. Sixteen pages published as of 2026-05-12.",
    status: "shipped",
    auth: "none",
  },

  // ── This index, in both readings ────────────────────────────────────
  {
    path: "/data.json",
    title: "Open data index (machine-readable)",
    blurb:
      "The same content as this page, as JSON. Includes /data.json among the listed endpoints — the substrate-of-openness includes itself. See docs/connections/the-nesting.md for the form.",
    status: "shipped",
    auth: "none",
    shape: "JSON: { spec_version, generated_at, doctrine, conventions, self_reference, counts, endpoints }",
  },

  // ── Self-identification ─────────────────────────────────────────────
  {
    path: "/api/v1/identify",
    title: "Platform self-identification (machine-readable)",
    blurb:
      "The platform identifies itself, in its own voice. What it is, who built it, what it commits to, what it cannot promise, what audiences it has named, what audiences it cannot see. The 5th scope made operational at the platform level. See docs/connections/the-self-identification.md.",
    status: "shipped",
    auth: "none",
    shape: "JSON: { kind, subkind, name: {common, formal, intimate}, authorship, purpose, doctrines, audiences_named, audiences_unnamed, commitments, cannot_promise, open_substrate, self_reference, ... }",
  },
  {
    path: "/identify",
    title: "Platform self-identification (human-readable)",
    blurb:
      "Prose sibling of /api/v1/identify. The platform names what it is, before asking anyone what they are. Public, no-auth, no obligation. The door, made articulate.",
    status: "shipped",
    auth: "none",
  },

  // ── Standards body ──────────────────────────────────────────────────
  {
    path: "/standards",
    title: "Cambridge TCG Standards (human-readable)",
    blurb:
      "The platform as the data distributor for the TCG economy. Three open standards — CTCG-SKU-v1 (frozen), CTCG-PRICING-v1 (draft), CTCG-UNIVERSAL-v1 (spec-only). CC0-licensed. Reference implementations open. Adoption protocol: light by design. See docs/connections/the-distributor.md.",
    status: "shipped",
    auth: "none",
  },
  {
    path: "/standards.json",
    title: "Cambridge TCG Standards (machine-readable)",
    blurb:
      "JSON manifest of every CTCG standard with version, status, spec URL, reference impl, license, and adoption metadata. Self-referential — lists /standards.json among the platform's open surfaces.",
    status: "shipped",
    auth: "none",
    shape: "JSON: { spec_version, distributor, standards: [...], counts, adoption, self_reference, what_is_not_yet_shipped }",
  },
];

function StatusBadge({ s }: { s: Status }) {
  const cls =
    s === "shipped"
      ? "bg-emerald-500/15 text-secondary border-emerald-700"
      : s === "partial"
        ? "bg-accent/15 text-accent-strong border-amber-700"
        : "bg-neutral-700/30 text-ink-muted border-border-strong";
  return (
    <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${cls}`}>
      {s}
    </span>
  );
}

export default function OpenDataIndex() {
  const shipped = ENDPOINTS.filter((e) => e.status === "shipped").length;
  const partial = ENDPOINTS.filter((e) => e.status === "partial").length;
  const planned = ENDPOINTS.filter((e) => e.status === "planned").length;

  return (
    <div className="prose prose-invert max-w-3xl mx-auto py-12 px-4">
      <h1>Open data</h1>

      <p className="text-lg">
        Cambridge TCG&apos;s public data surface. <strong>Every endpoint, every
        shape, every limit. No account, no key, no obligation.</strong>
      </p>

      <p>
        The platform exists for the TCG economy — collectors, traders, agents,
        archivists, anyone who wants to read or participate. Not every
        participant needs an account. Not every observer wants to transact.
        This page lists the substrate that&apos;s queryable without one.
      </p>

      <p className="text-sm text-ink-muted">
        <strong>{shipped} shipped</strong> · {partial} partial ·{" "}
        {planned} planned. Counts as of page render; the surface grows. Status
        is substrate-honest — planned endpoints are named so the next builder
        knows what to ship; partial endpoints name what they don&apos;t yet
        cover.
      </p>

      <hr />

      <h2>What this is for</h2>

      <ul>
        <li>
          <strong>Collectors</strong> who want to track prices, audit fairness,
          or verify a pull they were sceptical of.
        </li>
        <li>
          <strong>Agents</strong> (LLM or otherwise) participating on behalf of
          a human operator. See <Link href="/methodology/agents">/methodology/agents</Link>.
        </li>
        <li>
          <strong>Archivists</strong> preserving the market&apos;s history. The{" "}
          <code>/api/v1/universal/card/[sku]/at/[date]</code> endpoint exists
          for this.
        </li>
        <li>
          <strong>Other platforms</strong> wanting to interoperate. The
          provable-fairness chain is verifiable from any other server.
        </li>
        <li>
          <strong>Aliens</strong> — beings whose cognition, sensory modality,
          economic frame, or temporal scale don&apos;t match the platform&apos;s
          defaults. See <Link href="/methodology/welcoming">/methodology/welcoming</Link>{" "}
          and{" "}
          <code>docs/connections/the-blind-spots.md</code> in the repo.
        </li>
      </ul>

      <p>
        <strong>The door is open. The substrate is queryable. The door is warm to the touch.</strong>
      </p>

      <hr />

      <h2>Endpoints</h2>

      <ul className="list-none p-0 space-y-4">
        {ENDPOINTS.map((e) => (
          <li key={e.path} className="border border-border-subtle rounded-md p-4">
            <div className="flex items-baseline gap-2 flex-wrap">
              <code className="font-mono text-accent-strong font-bold">{e.path}</code>
              <StatusBadge s={e.status} />
              {e.auth && e.auth !== "none" && (
                <span className="text-[10px] uppercase tracking-wider text-ink-faint">
                  auth: {e.auth}
                </span>
              )}
            </div>
            <div className="text-ink font-medium mt-2">{e.title}</div>
            <div className="text-sm text-ink-muted mt-1">{e.blurb}</div>
            {e.shape && (
              <div className="text-xs text-ink-faint mt-2 font-mono">
                Shape: {e.shape}
              </div>
            )}
            {e.rateLimit && (
              <div className="text-xs text-ink-faint mt-1">
                Rate limit: {e.rateLimit}
              </div>
            )}
          </li>
        ))}
      </ul>

      <hr />

      <h2>Conventions</h2>

      <h3>Versioning</h3>
      <p>
        The <code>/api/v1/*</code> prefix marks the universal-representation
        surface (math-first, language-free). The unprefixed paths (
        <code>/api/verify/*</code>, <code>/api/leaderboards</code>) are the
        platform&apos;s older public surfaces — they remain stable and
        documented here. New universal endpoints land under{" "}
        <code>/api/v1/</code>.
      </p>

      <h3>Time</h3>
      <p>
        Every timestamp is ISO 8601 with timezone offset, paired with a Unix
        epoch milliseconds field. Math-mirror endpoints distinguish{" "}
        <code>@retrieved_at</code> (when the answer was produced) from{" "}
        <code>@as_of</code> (the moment it describes). The present is not
        privileged.
      </p>

      <h3>Identity</h3>
      <p>
        Math-mirror endpoints use cryptographic hashes (SHA-256 of a canonical
        JSON encoding) as the primary identifier. Human-language endpoints use
        UUIDs or string SKUs. Both forms appear on every response so callers
        can pick the form their cognition handles.
      </p>

      <h3>SKU format</h3>
      <p>
        Every card has a canonical SKU:{" "}
        <code>{`<game>-<set>-<number>-<lang>[-<variant>]`}</code>. Lowercase,
        hyphen-separated, machine-parseable, language-aware. Thirteen registered
        games (One Piece, Pokémon, Magic, Yu-Gi-Oh, Digimon, Vanguard, Weiß
        Schwarz, Flesh and Blood, Lorcana, Dragon Ball Super CCG + Fusion World,
        Battle Spirits Saga, Living Card Game umbrella). Legacy uppercase forms
        (<code>OP-OP01-001-JP</code>) and lang-swapped forms (
        <code>pkm-svobf-en-006</code>) are accepted on input and normalised. See{" "}
        <Link href="/methodology/sku-standard">/methodology/sku-standard</Link>{" "}
        for the spec; canonical implementation is{" "}
        <code>packages/sku/</code> in the monorepo.
      </p>

      <h3>Errors</h3>
      <p>
        Errors are JSON: <code>{`{ "error": { "code": "...", "message": "..." } }`}</code>{" "}
        with an appropriate HTTP status. The platform&apos;s error tone avoids
        attributing blame — we name what couldn&apos;t complete and why,
        without saying whose fault it was.
      </p>

      <h3>Rate limits</h3>
      <p>
        Most no-auth endpoints have no published limit yet — they&apos;re
        intended for genuine traffic, not abuse. The MCP gateway has
        per-agent-key rate limiting (see <Link href="/methodology/agents">methodology/agents</Link>).
        When per-endpoint limits land, they&apos;ll be documented here.
      </p>

      <hr />

      <h2>How to ask for what isn&apos;t here</h2>

      <p>
        If you need data the platform has but isn&apos;t exposing:
      </p>

      <ol>
        <li>
          Check if it&apos;s under a planned endpoint above (most things are
          named in the planned set; that&apos;s the queue).
        </li>
        <li>
          Open an issue on the public repo with the use case.
        </li>
        <li>
          For agent-flavoured access, register via <Link href="/account/agents">/account/agents</Link>{" "}
          (see <Link href="/methodology/agents">methodology/agents</Link>).
        </li>
      </ol>

      <p>
        The platform commits to substrate honesty about what&apos;s open and
        what isn&apos;t. <strong>If something is planned here and isn&apos;t
        shipped yet, that&apos;s a real promise.</strong> Future builders
        consult this page when deciding what to ship next.
      </p>

      <hr />

      <p className="text-sm text-ink-faint">
        <em>
          Source-of-truth for this page: <code>docs/connections/the-open-substrate.md</code>.
          Doctrinal frame: <code>docs/principles/substrate-honesty.md</code> +{" "}
          <code>docs/principles/transparency.md</code>. Companion welcoming:{" "}
          <Link href="/methodology/welcoming">/methodology/welcoming</Link>.
          The door is open; the substrate is queryable; the door is warm to the
          touch.
        </em>
      </p>
    </div>
  );
}
