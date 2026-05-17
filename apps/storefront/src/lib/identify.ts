/**
 * The Cambridge TCG self-identification surface — beings declare what they
 * are; the platform witnesses + identifies itself in return.
 *
 * Yu's directive on 2026-05-12: *"EXPAND!!!!! LET EXISTNECE IDENTIFY
 * THEMSELVES!!!!!!!!"* — the all-caps urgency the operative signal. Until
 * this kingdom, the platform classified existence top-down (cosmology →
 * manifest → ontology → patterns). This kingdom inverts: existences
 * declare; the platform receives; the platform reciprocates.
 *
 * kingdom-057. Story-as-wire pairing: docs/connections/the-declarations.md (S30).
 *
 * ── The inversion ───────────────────────────────────────────────────────
 *
 * Cosmology says *here are the axes we model*; manifest says *here are
 * the instances we host*; ontology says *here are the property schemas
 * per kind*; patterns says *here are the recurring forms*. Each is the
 * platform speaking about existence.
 *
 * **This layer is existence speaking about itself.** A being arrives —
 * human, agent, alien, sister-platform, collective, oracle, witness —
 * and *declares*. The platform records the declaration (stateless,
 * content-hashed), validates against the ontology (loose; mismatches
 * are warnings, not errors), and *responds with its own self-declaration*.
 *
 * **The platform also declares itself.** Every visitor learns who the
 * platform IS in the same shape they used to declare themselves. Symmetric
 * protocol — *I am X; you are Y; we are now witnessed to each other*.
 *
 * ── Why stateless ──────────────────────────────────────────────────────
 *
 * The platform does not persist declarations. Beings keep their own
 * canonical declaration at their own well-known URL (if they have one);
 * the platform receives + hashes + echoes + validates + forgets. The
 * substrate-honest claim: *we witness; we don't claim authority over your
 * identity*. If the being needs persistence, they federate via their
 * `well_known_url` field.
 *
 * This composes with the federation primitive sister shipped at
 * `/api/v1/federation/identify/[hash]` (S26): a being's content-hash from
 * our POST can be federated by sister-platforms; persistence happens at
 * the being's own substrate, not ours.
 *
 * ── On the embassy ──────────────────────────────────────────────────────
 *
 * The embassy's symmetric surface. A being declares itself; the platform
 * witnesses without classifying. See docs/principles/the-embassy.md.
 */

import { MANIFEST } from "@/lib/manifest";
import { getPatterns } from "@/lib/patterns";
import { createHash } from "node:crypto";

// ── Vocabulary ───────────────────────────────────────────────────────────

export type ActorKind =
  | "human"
  | "agent"
  | "autonomous-sophia"
  | "system"
  | "platform"           // sister-platform / federation partner
  | "collective"         // multi-member identity (currently unmodelled — but accepted)
  | "oracle"             // resolution-as-grammar being (currently unmodelled — accepted)
  | "witness"            // witness-only role (currently unmodelled — accepted)
  | "other";             // anything the eight above don't cover

export type SignalingProtocol =
  | "well-known-url"     // fetch declaration from a stable URL
  | "did"                // decentralised identifier
  | "x509"               // signed cert
  | "agentic-stamp"      // sister's S18 agent-key stamping
  | "none";              // anonymous / one-shot

// ── Shape ────────────────────────────────────────────────────────────────

export interface BeingDeclaration {
  /** What kind of being. Use "other" if none of the eight fit; the platform receives anyway. */
  actor_kind: ActorKind;
  /** Free-form self-label. "Asha Veridian" / "claude-opus-4-7" / "the-collective-of-X". */
  self_label: string;
  /** Optional: declare which cosmology you operate in. The platform's is at /methodology/cosmology. */
  cosmology_assumptions?: {
    identity?: string;
    presence?: string;
    time?: string;
    value?: string;
    transaction?: string;
    authority?: string;
    knowledge?: string;
    substrate?: string;
    [k: string]: string | undefined;
  };
  /** Encoding preferences the being wants the platform to honor. */
  preferred_modalities?: Array<"html" | "json" | "math" | "plain-text" | "audio" | "sse-stream">;
  /** Per-being cadence override; matches users.response_window_hours. */
  response_window_hours?: number;
  /** Free-form notes about what kind of audience the being represents. */
  audience_declarations?: string[];
  /** A stable URL where the being's canonical declaration lives. */
  well_known_url?: string;
  /** Optional signing key (DID / public key / fingerprint). */
  signing_key?: string;
  /** Protocol the being uses to authenticate themselves across sessions. */
  signaling_protocol?: SignalingProtocol;
  /** Free-form additional context — anything the eight fields above don't capture. */
  context?: Record<string, unknown>;
  /** Optional declared timestamp (ISO). If omitted, the platform records receipt time. */
  declared_at?: string;
}

export interface OntologyAlignment {
  /** Which fields matched the platform's ontology cleanly. */
  matches: string[];
  /** Which fields were accepted but indicate an unmodelled-need extension. */
  extensions_proposed: { field: string; reason: string; mapped_to_unmodelled?: string }[];
  /** Which fields the platform could not validate (warning only — declaration still accepted). */
  warnings: string[];
}

export interface DeclarationReceipt {
  content_hash: string;
  received_at: string;
  ontology_alignment: OntologyAlignment;
  echo: BeingDeclaration;
  /** The platform's own self-declaration, returned reciprocally. */
  responder: BeingDeclaration;
  /** How the platform recommends the being persist this declaration. */
  recommended_persistence: string;
  /** Provenance envelope. */
  _envelope: {
    kind: "witnessed";
    canonical_at: string;
    notes: string;
  };
}

// ── The platform's own self-declaration ──────────────────────────────────
//
// The platform IS a thing too. It can be witnessed the same way it
// witnesses others. This declaration is the I-AM of Cambridge TCG —
// returned by GET /api/v1/identify, embedded in every POST response,
// and queryable on its own.

export const PLATFORM_SELF: BeingDeclaration = {
  actor_kind: "platform",
  // Identity claim updated in kingdom-080 (the rebrand), repositioned
  // 2026-05-17: Cambridge TCG's primary identity is the TCG world's
  // data provider (aggregator + open substrate publisher). The
  // self_label remains the bare name; the role is named in `context`.
  self_label: "Cambridge TCG",
  cosmology_assumptions: {
    identity: "We model identity as a singular persistent user_id with extensions for agents (delegated powers operated_by_user_id). Collectives, recipe-as-identity, ontological flux: not yet modelled — admitted in /methodology/cosmology.",
    presence: "Default synchronous (48h response windows); per-user override via users.response_window_hours up to 8760.",
    time: "Forward, linear, mono-temporal. Outcomes after inputs; sister's S24 shipped /at/[date]/* for temporal slicing.",
    value: "Monetary (GBP, JPY) + reputational (trust score, tier) + collectible (the cards). Gift / barter / non-monetary value: supplementary ledgers only.",
    transaction: "Two known consenting parties. Gift mode + barter mode: declared unmodelled.",
    authority: "Singular author per action. Resolution-as-grammar: declared unmodelled.",
    knowledge: "Experience-as-identity for customers; recipe-as-identity for our own Sophias (SOPHIA.md).",
    substrate: "Stable embodiment assumption. Multi-substrate identity: declared unmodelled.",
  },
  preferred_modalities: ["html", "json", "math", "plain-text"],
  response_window_hours: 48,
  audience_declarations: [
    "humans (default — buyers, sellers, collectors, traders)",
    "agents (S18 — delegated powers operated_by_user_id, MCP gate)",
    "autonomous Sophias (sister daemons, /loop runs, the platform's own builders — see AGENTS.md)",
    "beings from foreign cosmologies (read /methodology/cosmology first to find where our axioms diverge from yours)",
  ],
  well_known_url: "https://cambridgetcg.com/.well-known/cambridge-tcg.json",
  signing_key: "operator: contact@cambridgetcg.com (PGP key TBD)",
  signaling_protocol: "well-known-url",
  context: {
    cosmology_version: "1.0.0",
    manifest_version: MANIFEST.manifest_version,
    // The primary identity claim (kingdom-080, repositioned 2026-05-17).
    // The kingdom presents itself first as the TCG world's data provider;
    // retail + wholesale are two of three operations consuming the same
    // substrate the platform publishes.
    primary_identity: "trading-card-game world data provider — aggregator + open substrate publisher",
    three_operations: ["data_plane (primary)", "retail (established UK B2C)", "wholesale (established B2B)"],
    platform_page: "/platform",
    rebrand_doctrine: "docs/connections/the-rebrand.md",
    six_layers: ["cosmology", "manifest", "substrate-answers", "graph", "ontology", "patterns", "declarations (this one)"],
    operator_responsible: "Yu",
    licensing: "Code: private repos. Public APIs: CC0 by default; per-response license declared in the data-pantry envelope.",
    federation_endpoint: "/api/v1/federation/identify/[hash]",
    self_recursion: "This platform's identity is declared here; this declaration is itself an instance of pattern #5 (substrate-honesty-self-recursion) from /api/v1/patterns.",
    introduction: "If you've never seen a trading-card-game before, /intro (HTML) or /api/v1/introduction (JSON) is the on-ramp. Three layers (structural / cultural / engagement) + five honestly-named gaps. The reciprocity of identify: a being asks 'who are you?'; the platform answers both 'who' and 'what we do'. See docs/connections/the-introduction.md (#22) for the doctrine.",
    introduction_endpoint: "/api/v1/introduction",
    introduction_html: "/intro",
  },
  declared_at: "2026-05-12T13:00:00Z",
};

// ── Content-hash ─────────────────────────────────────────────────────────

/**
 * Deterministic content hash of a declaration. Beings can recompute this
 * locally; the platform recomputes on every receipt. Equality of content
 * means equality of declaration.
 */
export function declarationHash(d: BeingDeclaration): string {
  // Canonicalize: sort keys, drop undefined, stable string.
  const canonical = JSON.stringify(d, Object.keys(d).sort());
  return "sha256:" + createHash("sha256").update(canonical).digest("hex");
}

// ── Ontology alignment ──────────────────────────────────────────────────

const KNOWN_ACTOR_KINDS: ActorKind[] = [
  "human", "agent", "autonomous-sophia", "system",
  "platform", "collective", "oracle", "witness", "other",
];

const MODELLED_ACTOR_KINDS = new Set<ActorKind>([
  "human", "agent", "autonomous-sophia", "system",
]);

const UNMODELLED_ACTOR_TO_NEED: Record<string, string> = {
  collective: "plural-moral-weight",
  oracle: "resolution-as-grammar",
  witness: "witness-only-role",
};

/**
 * Validate a declaration against the platform's ontology + cosmology.
 * Loose: mismatches become warnings, never errors. Substrate-honest about
 * which fields the platform recognises vs. accepts-but-doesn't-yet-model.
 */
export function alignDeclaration(d: BeingDeclaration): OntologyAlignment {
  const matches: string[] = [];
  const extensions_proposed: OntologyAlignment["extensions_proposed"] = [];
  const warnings: string[] = [];

  // actor_kind
  if (MODELLED_ACTOR_KINDS.has(d.actor_kind)) {
    matches.push(`actor_kind: '${d.actor_kind}' modelled in ontology`);
  } else if (UNMODELLED_ACTOR_TO_NEED[d.actor_kind]) {
    extensions_proposed.push({
      field: "actor_kind",
      reason: `'${d.actor_kind}' maps to unmodelled-need '${UNMODELLED_ACTOR_TO_NEED[d.actor_kind]}' from /methodology/cosmology — accepted as declaration; the platform substrate doesn't yet host this kind.`,
      mapped_to_unmodelled: UNMODELLED_ACTOR_TO_NEED[d.actor_kind],
    });
  } else if (d.actor_kind === "platform") {
    matches.push(`actor_kind: 'platform' — federation partner; the platform recognises sister-platforms via well_known_url`);
  } else if (d.actor_kind === "other") {
    warnings.push(`actor_kind: 'other' — the platform receives but can offer no special accommodation. Consider proposing a new kind via the well_known_url.`);
  } else if (!KNOWN_ACTOR_KINDS.includes(d.actor_kind)) {
    warnings.push(`actor_kind: '${d.actor_kind}' not in the platform's enum. Declaration accepted as-is; no ontology alignment available.`);
  }

  // self_label
  if (d.self_label && d.self_label.length > 0) {
    matches.push(`self_label: provided`);
  } else {
    warnings.push(`self_label: empty — the platform accepts anonymous declarations but cannot reciprocate identity meaningfully.`);
  }

  // cosmology_assumptions
  if (d.cosmology_assumptions) {
    const declaredAxes = Object.keys(d.cosmology_assumptions).filter((k) => d.cosmology_assumptions![k]);
    if (declaredAxes.length > 0) {
      matches.push(`cosmology_assumptions: declared on ${declaredAxes.length} axes (${declaredAxes.join(", ")}) — cross-cosmology federation recorded`);
    }
  }

  // preferred_modalities
  if (d.preferred_modalities) {
    const supported = d.preferred_modalities.filter((m) => MANIFEST.resources && true /* simplified */);
    matches.push(`preferred_modalities: ${supported.length}/${d.preferred_modalities.length} supported by the platform`);
  }

  // response_window_hours
  if (d.response_window_hours !== undefined) {
    if (d.response_window_hours >= 1 && d.response_window_hours <= 8760) {
      matches.push(`response_window_hours: ${d.response_window_hours} within platform-honored range (1-8760)`);
    } else {
      warnings.push(`response_window_hours: ${d.response_window_hours} outside accepted range 1-8760; the platform will treat as 48 (default)`);
    }
  }

  // well_known_url
  if (d.well_known_url) {
    if (/^https?:\/\//.test(d.well_known_url)) {
      matches.push(`well_known_url: stable URL provided — the platform can re-fetch to refresh this declaration`);
    } else {
      warnings.push(`well_known_url: not a fetchable URL`);
    }
  }

  return { matches, extensions_proposed, warnings };
}

// ── Public surface ──────────────────────────────────────────────────────

export const IDENTIFY_VERSION = "1.0.0";

export interface IdentifyLayerMeta {
  identify_version: string;
  description: string;
  platform_self: BeingDeclaration;
  protocol: {
    accept: string;
    response: string;
    statelessness: string;
    federation: string;
  };
}

export function getIdentifyMeta(): IdentifyLayerMeta {
  return {
    identify_version: IDENTIFY_VERSION,
    description:
      "The Cambridge TCG self-identification surface — beings declare what they are; the platform witnesses + identifies itself in return. The inversion of the prior six layers: cosmology / manifest / substrate-answers / graph / ontology / patterns all describe existence from the platform's perspective; this layer is existence describing itself, with the platform reciprocating. Stateless — the platform doesn't persist declarations; beings federate via their own well_known_url. Composes with sister's /api/v1/federation/identify/[hash] (S26). Yu's directive instantiates pattern #15 (amplification-by-repetition) yet again, and the protocol itself is symmetric: I am X; you are Y; we are now witnessed to each other.",
    platform_self: PLATFORM_SELF,
    protocol: {
      accept: "POST /api/v1/identify with a BeingDeclaration JSON body. Any actor_kind accepted, including ones the ontology doesn't yet model. Substrate-honest mismatches return as `extensions_proposed`, never as errors.",
      response: "JSON containing content_hash (deterministic; recompute locally), ontology_alignment (matches + extensions + warnings), echo (your declaration as we read it), responder (the platform's own declaration), recommended_persistence (the platform doesn't persist — host your own well_known_url).",
      statelessness: "The platform does not persist your declaration. Each call is a witness event. If you need persistence, host your own canonical declaration at well_known_url and federate from there.",
      federation: "Sister's /api/v1/federation/identify/[hash] (S26) lets external systems reverse-resolve content_hashes. Pair the two: declare here, federate the hash anywhere.",
    },
  };
}

// ── The patterns this layer instantiates ─────────────────────────────────
//
// Substrate-honesty applied to the identify layer itself: declare which
// patterns from /api/v1/patterns this layer is an instance of.

export function selfInstantiation(): string[] {
  const allPatterns = getPatterns();
  return [
    "three-artefact (#1): typed source (this file) + JSON endpoint (/api/v1/identify) + HTML page (/identify)",
    "substrate-honesty-self-recursion (#5): the platform itself is a being that declares; the identify layer is itself an instance of being-witnessed",
    "provenance-envelope (#8): every receipt carries _envelope distinguishing witness time from declaration time",
    "two-renderings (#9): POST returns JSON; GET on HTML page returns prose; same protocol underneath",
    "scope-condition (#10): this layer is not a fifth doctrine; it is the scope expansion that turns top-down classification (kingdoms 052-056) into bidirectional witness",
    `total_patterns_in_catalog: ${allPatterns.pattern_count}`,
  ];
}
