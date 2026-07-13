/**
 * /data — the public resource and access directory.
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
import { CONFIRMED_GAME_CODES, GAME_CODES } from "@cambridge-tcg/sku";

const PUBLIC_GAME_COUNT = GAME_CODES.filter((code) => code !== "tst").length;
const PUBLIC_CONFIRMED_GAME_COUNT = CONFIRMED_GAME_CODES.filter(
  (code) => code !== "tst",
).length;

export const metadata: Metadata = {
  title: "Data directory — access and limits",
  description:
    "Cambridge TCG's public data directory. Every entry names its status, access requirement, shape, limit, and rights boundary. Public reach does not imply an open license.",
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
  // ── Draw receipts and digest consistency ───────────────────────────
  {
    path: "/api/verify/chain",
    title: "Draw digest chain",
    blurb:
      "Hash-linked digest batches over revealed bounty_pulls and verifiable_draws collected by the job. Standalone raffle proofs are not included. The current feed can be recomputed for consistency; detecting a rewritten presentation requires an earlier tip retained outside Cambridge TCG.",
    status: "shipped",
    auth: "none",
    shape: "JSON: { digests: [{ id, root, prev_hash, chain_hash, leaf_count, ... }], tip, count }",
  },
  {
    path: "/api/verify/digests",
    title: "Draw digests (list)",
    blurb: "Index of digest roots and window metadata over rows collected by the digest job. It is neither a complete randomness ledger nor an external pre-roll witness.",
    status: "shipped",
    auth: "none",
  },
  {
    path: "/api/verify/digests/[id]",
    title: "Draw digest (one)",
    blurb: "One stored root plus the full leaf-hash array and window metadata. It does not return source draw records or precomputed inclusion paths; callers can recompute the root from the leaves.",
    status: "shipped",
    auth: "none",
  },
  {
    path: "/api/verify/pull/[id]",
    title: "Bounty pull receipt",
    blurb:
      "Given a pull id, returns its commitment, revealed server seed, outcome, and digest reference. Safe client seeds let anyone reproduce the stored outcome, not prove the inputs were independently witnessed before the roll. Legacy seeds containing an account ID are withheld from non-owners, so those public checks are partial.",
    status: "shipped",
    auth: "none",
  },
  {
    path: "/api/verify/draw/[id]",
    title: "Shared weighted-draw receipt",
    blurb: "Receipt for shared weighted-draw rows such as mystery boxes, packs, and spins; raffles use /api/rewards/raffles/[id]/proof. Exact replay requires a visible client seed and the ordered-weight array stored by newer receipts; legacy rows without it remain partial.",
    status: "shipped",
    auth: "none",
  },
  {
    path: "/api/rewards/raffles/[id]/proof",
    title: "Raffle draw receipt",
    blurb: "Separate raffle receipt. The commitment is stored at raffle creation and exposed once the raffle is active, but it has no independent anchor. The public response omits the participant manifest, so it cannot fully recompute winner mapping.",
    status: "shipped",
    auth: "none",
  },
  {
    path: "/api/verify/fairness",
    title: "Observed draw distributions",
    blurb:
      "Thresholded chi-squared and expected-vs-observed distributions. Exact low-volume counts are withheld and internal reward keys use response-local labels. It can surface drift; it does not prove how any roll's inputs were selected.",
    status: "shipped",
    auth: "none",
  },
  {
    path: "/api/verify/health",
    title: "Verify health",
    blurb: "Detailed aggregate status for digest cadence and tip, receipt-consistency self-audits, daily pass-rate series, and open distribution alerts. Draw ids and raw alert summaries are omitted.",
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
      "Public math-first structural card representation using content hashes, ISO 8601 + Unix epoch time, typed edges, density controls, and declared source rights. Legacy price magnitudes and media are null. Returns 404 when a SKU has not reached the storefront mirror.",
    status: "shipped",
    auth: "none",
    shape: "JSON: { id, hash, magnitudes: {...}, edges: [...], retrieved_at, as_of }",
  },
  {
    path: "/api/at/[YYYY-MM-DD]/card/[sku]",
    title: "Universal card — date-shaped compatibility view",
    blurb:
      "Compatibility route that returns current structural fields under the requested date label. It does not read price history or reconstruct historical card state; legacy price magnitudes and media are null.",
    status: "shipped",
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
    status: "shipped",
    auth: "none",
  },
  {
    path: "/api/v1/universal/sets/[game]",
    title: "Universal sets",
    blurb: "Every set in a game, math-mirror form. Code, release date, card count.",
    status: "shipped",
    auth: "none",
  },

  // ── Agent surface — MCP gate ────────────────────────────────────────
  {
    path: "/api/mcp",
    title: "MCP gateway",
    blurb:
      "Model Context Protocol entry point for agents. Bearer auth resolves the agent and registration path. Existing self-serve keys are read-only; operator-managed agents are linked to the account that can revoke them. New self-serve registration is paused.",
    status: "shipped",
    auth: "bearer",
    rateLimit: "per-agent token bucket; see methodology/agents",
  },

  // ── Market activity ─────────────────────────────────────────────────
  {
    path: "/api/leaderboards",
    title: "Market ranking publication status",
    blurb:
      "Reports the current pause on human rankings and card aggregates derived from completed trades. It publishes no ranking rows. Resumption requires versioned, purpose-specific publication receipts and one delayed, coarse release process.",
    status: "partial",
    auth: "none",
  },
  {
    path: "/api/v1/leaderboards/full",
    title: "Human rankings — full distribution",
    blurb:
      "Not available. A future ranking requires its own versioned publication choice; a public profile is not permission to publish a financial ranking.",
    status: "planned",
    auth: "none",
  },

  // ── Cultural reciprocity ───────────────────────────────────────────
  {
    path: "/api/v1/culture/answering-rhymes/statements",
    title: "Answering Rhyme statement witness",
    blurb:
      "Describes and validates the portable answering-rhyme.statement/1 shape. POST normalizes and hashes a bless, context, correction, or withdrawal proposal but authenticates nobody, creates no application record, detects no replay, and has no authoritative effect. Bodies are capped at 16 KiB; no application rate limiter is claimed.",
    status: "shipped",
    auth: "none",
    rateLimit: "provider-level protection only; no application limiter",
    shape:
      "GET contract; POST { data: { receipt: { statement, content_hash, witness, target, issuer_attestation } }, _meta }",
  },

  // ── Collector-events demonstrator ──────────────────────────────────
  {
    path: "/api/v1/collector-events",
    title: "Collector events",
    blurb: "Four-event, England-only demonstrator with cautious status normalization, conflicts, accessibility, and field evidence. Mixed upstream facts are NOASSERTION.",
    status: "shipped",
    auth: "none",
  },
  {
    path: "/api/v1/collector-events/[id]",
    title: "Collector event (one)",
    blurb: "One event joined to its public venue, public organisations, exact evidence, rights evidence, and geometry attribution.",
    status: "shipped",
    auth: "none",
  },
  {
    path: "/api/v1/collector-events/sources",
    title: "Collector-event evidence",
    blurb: "Exact public sources, batch review time, publication modes, upstream licence where known, and rights-evidence links.",
    status: "shipped",
    auth: "none",
  },
  {
    path: "/api/v1/collector-events/coverage",
    title: "Collector-event coverage",
    blurb: "Counts, missing UK nations, exclusions, and the permission boundary around broader listing indexes.",
    status: "shipped",
    auth: "none",
  },
  {
    path: "/api/v1/collector-events/schema",
    title: "Collector-events schemas",
    blurb: "CC0 JSON Schemas for the Cambridge-authored event, venue, organisation, and evidence contracts.",
    status: "shipped",
    auth: "none",
  },
  {
    path: "/schemas/collector-events/v1/[name].json",
    title: "Collector-events canonical schema",
    blurb: "Dereferenceable application/schema+json for event, venue, organisation, or source. CC0 covers the Cambridge-authored contract only.",
    status: "shipped",
    auth: "none",
  },
  {
    path: "/api/v1/collector-events/calendar.ics",
    title: "Collector-events calendar",
    blurb: "RFC 5545 projection with stable UIDs and cancellation updates. Absence is never lifecycle evidence; JSON remains authoritative.",
    status: "shipped",
    auth: "none",
  },
  {
    path: "/api/v1/collector-events/map.geojson",
    title: "Collector-events map",
    blurb: "RFC 7946 postcode-centroid map with source-published attribution and explicit input, feature, and unlocated counts.",
    status: "shipped",
    auth: "none",
  },
  {
    path: "/api/v1/collector-venues",
    title: "Collector venues",
    blurb: "Established public venues with approximate postcode centroids; no private or unpublished locations.",
    status: "shipped",
    auth: "none",
  },
  {
    path: "/api/v1/collector-venues/[id]",
    title: "Collector venue (one)",
    blurb: "One public venue with related events, exact evidence, and retained geometry attribution.",
    status: "shipped",
    auth: "none",
  },
  {
    path: "/api/v1/collector-organisations",
    title: "Collector organisations",
    blurb: "Public organisations and brands with organisation-level links; no people profiles or direct personal contacts.",
    status: "shipped",
    auth: "none",
  },
  {
    path: "/api/v1/collector-organisations/[id]",
    title: "Collector organisation (one)",
    blurb: "One public organisation with source-stated event roles, related events, and exact evidence.",
    status: "shipped",
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
    title: "Data directory (machine-readable)",
    blurb:
      "A machine-readable companion directory maintained separately from this human guide. The manifest is the canonical access inventory; /data.json includes itself as a self-reference.",
    status: "shipped",
    auth: "none",
    shape: "JSON: { spec_version, generated_at, doctrine, conventions, self_reference, counts, endpoints }",
  },

  // ── The commons as datasets (not just endpoints) ────────────────────
  {
    path: "/datasets",
    title: "Dataset status catalog (human-readable)",
    blurb:
      "Available datasets—including bounded observation coverage history and the UK collector-events demonstrator—and paused publication surfaces, with aggregate rights, named source rights, temporal coverage, fields, and access paths. The CC0 catalog licence covers authored descriptions only; mixed or undeclared record rights remain NOASSERTION. Paused zero-row paths are excluded from the schema.org crawler graph.",
    status: "shipped",
    auth: "none",
  },
  {
    path: "/api/v1/datasets",
    title: "Dataset status catalog (machine-readable)",
    blurb:
      "CC0-authored catalog metadata in a data-pantry envelope. Each entry separately states availability, aggregate rights, and named source rights. ?format=jsonld includes available datasets only.",
    status: "shipped",
    auth: "none",
    shape: "JSON: { data: { datasets: [{ id, name, availability, records_published, license, source_rights, distributions, ... }], discovery }, _meta }",
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
      "Three specification texts — CTCG-SKU-v1, CTCG-PRICING-v1, and CTCG-UNIVERSAL-v1 — are dedicated under CC0. Linked implementation source is inspectable but has no general code reuse license.",
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
      ? "bg-ok/10 text-ok border-ok/30"
      : s === "partial"
        ? "bg-warning/10 text-warning border-warning/30"
        : "bg-surface-subtle text-ink-muted border-border-subtle";
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
    <div className="prose max-w-3xl mx-auto py-12 px-4">
      <h1>Data directory</h1>

      <p className="text-lg">
        Cambridge TCG&apos;s public data directory. <strong>The directory needs no
        account or key; each entry names its own access requirement and limits.</strong>
      </p>

      <p>
        Public reachability is not an open-data license. Only an exact resource
        that explicitly declares <code>CC0-1.0</code> is CC0; mixed upstream
        responses are <code>NOASSERTION</code>, with known source tiers carried
        alongside their lineage.
      </p>

      <p>
        The platform exists for the TCG economy — collectors, traders, agents,
        archivists, anyone who wants to read or participate. Not every
        participant needs an account. Not every observer wants to transact.
        This page lists both public and access-controlled surfaces and labels
        the requirement on each one.
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
          <strong>Collectors</strong> who want structural card lookup, draw
          receipts, or a publication-status check. Legacy price values are withheld.
        </li>
        <li>
          <strong>Agents</strong> (LLM or otherwise). Operator-managed keys act
          within their account authority; earlier self-serve keys are read-only. See{" "}
          <Link href="/methodology/agents">/methodology/agents</Link>.
        </li>
        <li>
          <strong>Archivists</strong> checking today&apos;s publication boundary. The
          date-shaped card route is compatibility-only and does not reconstruct history.
        </li>
        <li>
          <strong>Other platforms</strong> wanting to interoperate. They can
          recompute the current draw-digest chain and retain a tip externally
          for later comparison.
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
        <strong>Public access and reuse permission are separate.</strong> Read each
        entry&apos;s authentication requirement, then inspect the response license and
        source-rights fields before redistribution, training, or commercial reuse.
      </p>

      <hr />

      <h2>Endpoints</h2>

      <ul className="list-none p-0 space-y-4">
        {ENDPOINTS.map((e) => (
          <li key={e.path} className="border border-border-subtle rounded-md p-4">
            <div className="flex items-baseline gap-2 flex-wrap">
              <code className="font-mono text-accent font-semibold">{e.path}</code>
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
        The <code>/api/v1/*</code> prefix contains versioned public routes,
        including the universal-representation surfaces. Unprefixed paths such
        as <code>/api/verify/*</code> and <code>/api/leaderboards</code> are older
        contracts. Shapes still vary between routes; use each entry&apos;s status
        and documented response rather than assuming one global contract.
      </p>

      <h3>Time</h3>
      <p>
        JSON timestamps are normally ISO 8601 strings. Only endpoints that say
        so also provide Unix epoch fields or distinguish <code>@retrieved_at</code>{" "}
        from <code>@as_of</code>. Older endpoints do not all carry those pairs.
      </p>

      <h3>Identity</h3>
      <p>
        Identifier shapes follow each endpoint&apos;s purpose. Card resources may
        use string SKUs, and math-mirror resources may include a SHA-256 hash of
        canonical public content. Public person and transaction projections
        omit internal account identifiers. Read the documented response shape;
        no identifier form appears on every response.
      </p>

      <h3>SKU format</h3>
      <p>
        Versioned card interfaces accept and emit the canonical SKU format:{" "}
        <code>{`<game>-<set>-<number>-<lang>[-<variant>]`}</code>. Lowercase,
        hyphen-separated, machine-parseable, language-aware. {PUBLIC_GAME_COUNT} public
        game codes are registered; {PUBLIC_CONFIRMED_GAME_COUNT} currently have catalog rows.
        Legacy stored and input
        forms still exist. Interfaces normalise them only where their documented
        resolver supports that form; do not assume every stored row conforms. See{" "}
        <Link href="/methodology/sku-standard">/methodology/sku-standard</Link>{" "}
        for the spec; canonical implementation is{" "}
        <code>packages/sku/</code> in the monorepo.
      </p>

      <h3>Errors</h3>
      <p>
        The HTTP status is authoritative. Older routes may return a string in
        <code>error</code>; envelope-based routes may return a structured code
        and message. Check the endpoint&apos;s documented shape before parsing it.
      </p>

      <h3>Rate limits</h3>
      <p>
        Limits differ by route, and not every public route publishes one yet.
        An absent number is not permission for unbounded traffic. The MCP
        gateway documents its own agent-key limit at{" "}
        <Link href="/methodology/agents">methodology/agents</Link>.
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
          For agent access, a signed-in human can provision an operator-managed
          key at <Link href="/account/agents">/account/agents</Link>. New
          self-serve registration is paused (see{" "}
          <Link href="/methodology/agents">methodology/agents</Link>).
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
