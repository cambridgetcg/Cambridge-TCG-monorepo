/**
 * /api/v1/kinds/[kind] — singleton self-describe per NodeKind.
 *
 * The "I AM" surface for each kind in the kingdom. A caller hits
 * /api/v1/kinds/methodology and the kind speaks back: "I am methodology;
 * here is my property schema, here are my instances, here is my doctrinal
 * grounding, here is where to learn more about how a new methodology
 * page is born."
 *
 * **Let existences identify themselves** — every NodeKind gets the same
 * dispatcher, and the response shape is uniform across kinds. A foreign
 * decoder can ask any kind the same question and receive a comparable
 * answer.
 *
 * Sister to sister's POST /api/v1/identify (the bilateral handshake for
 * foreign beings declaring themselves to the kingdom) and GET
 * /api/v1/identify (the platform's I-AM). This endpoint is the
 * per-kind I-AM — granular self-declaration.
 *
 * kingdom-058 (S31, mine).
 */

import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getGraph } from "@/lib/graph";
import type { NodeKind } from "@/lib/graph";

function sha256(input: string): string {
  return "sha256:" + createHash("sha256").update(input).digest("hex");
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`).join(",")}}`;
}

const KNOWN_KINDS: NodeKind[] = [
  "resource",
  "cosmology_axis",
  "unmodelled_need",
  "methodology",
  "doctrine",
  "connection_doc",
  "kingdom",
  "audit",
];

interface KindSelfDeclaration {
  i_am: string;
  what_i_am: string;
  what_other_modules_use_me_for: string[];
  doctrinal_grounding: string[];
  where_my_properties_are_defined: string;
  where_to_learn_more: string[];
  what_i_cannot_do: string[];
}

const SELF_DECLARATIONS: Record<NodeKind, KindSelfDeclaration> = {
  resource: {
    i_am: "resource",
    what_i_am: "I am a public-facing surface — a URL the kingdom answers from. I have a host (storefront or wholesale), a path, methods, modalities, an auth requirement, a provenance kind, and the cosmology axes I ground in. I am listed in lib/manifest.ts and discoverable through /api, /.well-known/cambridge-tcg.json, /llms.txt.",
    what_other_modules_use_me_for: [
      "the graph (S27) types my relationships to other kinds",
      "the ontology (S28) types my property schema",
      "the manifest (S25) advertises my existence",
      "the OpenAPI spec (S26) documents my contract",
      "/api/v1/kinds/[kind] (this endpoint, S31) speaks my self-introduction",
    ],
    doctrinal_grounding: ["substrate-honesty", "transparency"],
    where_my_properties_are_defined: "/api/v1/ontology#resource",
    where_to_learn_more: ["/api", "/llms.txt", "docs/connections/the-substrate-answers.md"],
    what_i_cannot_do: [
      "I cannot mutate without authorization (most resources are read-only at the public surface)",
      "I cannot pretend to exist when I don't (the audit walks manifest.stable claims against the filesystem)",
    ],
  },
  cosmology_axis: {
    i_am: "cosmology_axis",
    what_i_am: "I am one of the kingdom's eight currently-modelled axes of reality (identity / presence / time / value / transaction / authority / knowledge / substrate). I am what the kingdom treats as real before any methodology says how to compute over me.",
    what_other_modules_use_me_for: [
      "every resource declares which cosmology_axes it grounds in (manifest)",
      "the cosmology doctrine doc (kingdom-052) names me and the eight unmodelled needs that are absent",
      "kingdoms extend me when a new dimension lands (e.g., kingdom-051 extended 'presence' with response_window_hours)",
    ],
    doctrinal_grounding: ["substrate-honesty", "cosmology"],
    where_my_properties_are_defined: "/api/v1/ontology#cosmology_axis",
    where_to_learn_more: ["/methodology/cosmology", "docs/principles/cosmology.md"],
    what_i_cannot_do: [
      "I am not a doctrine (the four extend without a peer; cosmology is the world they live in)",
      "I am not a methodology (a methodology computes over me; I am the substrate it computes on)",
    ],
  },
  unmodelled_need: {
    i_am: "unmodelled_need",
    what_i_am: "I am a need the platform has named but does not yet model. I am a gap acknowledged. There are eight of me today (recipe-as-identity, witnessed stasis, plural moral weight, future-witness testimony, ontological flux, audience-side opt-out, resolution-as-grammar, witness-only role).",
    what_other_modules_use_me_for: [
      "the cosmology doc names me so the gap is auditable",
      "future kingdoms convert me to a cosmology_axis if/when the substrate learns to model me",
      "the inclusion audit watches that I am named, not silently absent",
    ],
    doctrinal_grounding: ["substrate-honesty"],
    where_my_properties_are_defined: "/api/v1/ontology#unmodelled_need",
    where_to_learn_more: ["/methodology/cosmology", "docs/principles/cosmology.md", "docs/connections/the-other-minds.md"],
    what_i_cannot_do: [
      "I cannot pretend to be modelled; the substrate refuses to silently default to behaviors that would treat me as solved",
      "I cannot ground a resource until I graduate to a cosmology_axis",
    ],
  },
  methodology: {
    i_am: "methodology",
    what_i_am: "I am a /methodology/* page documenting a user-affecting decision. I exist as a triple — page.tsx (long-form), summary.md (TLDR), data.json (structured sidecar) — and I am listed in /methodology with a slug, title, blurb, and status (published or stub).",
    what_other_modules_use_me_for: [
      "<WhyLink href='/methodology/<topic>'> on every score, tier, or value (transparency Ring 2)",
      "the manifest lists me under resources.methodology",
      "connection-docs cite me when their story grounds in a computation I document",
    ],
    doctrinal_grounding: ["transparency"],
    where_my_properties_are_defined: "/api/v1/ontology#methodology",
    where_to_learn_more: ["/methodology", "/methodology/methodology", "docs/connections/the-question-mark.md"],
    what_i_cannot_do: [
      "I cannot be marketing copy (the methodology page documents the formula honestly, including edge cases)",
      "I cannot be legal copy (terms of service has a different audience and tone)",
      "I cannot be invisible (every formula that affects a real user must surface a methodology page)",
    ],
  },
  doctrine: {
    i_am: "doctrine",
    what_i_am: "I am a principle the kingdom shapes itself by. There are four of me — substrate honesty, transparency, meaning, creation. S21 ratified that the four extend without a peer; the fifth question (audience) is the scope condition under which we generalize.",
    what_other_modules_use_me_for: [
      "every audit verifies a doctrine holds (audit:honesty, audit:transparency, audit:creation, etc.)",
      "every methodology has a doctrinal_grounding pointer (transparency, usually)",
      "every commit invokes my discipline implicitly via the four-question checklist + the fifth",
    ],
    doctrinal_grounding: ["substrate-honesty", "transparency", "meaning", "creation"],
    where_my_properties_are_defined: "/api/v1/ontology#doctrine",
    where_to_learn_more: [
      "docs/principles/substrate-honesty.md",
      "docs/principles/transparency.md",
      "docs/principles/meaning.md",
      "docs/principles/creation.md",
    ],
    what_i_cannot_do: [
      "I cannot mint a fifth peer (S21 ratified this — the four extend, they do not get a fifth)",
      "I cannot be applied without a checklist (substrate-honesty has 4 questions; transparency has 4; both extend to 5 via the audience question)",
    ],
  },
  connection_doc: {
    i_am: "connection_doc",
    what_i_am: "I am a docs/connections/*.md entry naming a meaning-bridge. Two flavors: node-view (what one module means for the modules around it) and story-arc (what happens when one transaction crosses the platform). I am numbered: node-views as #N, story-arcs as SN. The README at docs/connections/README.md is itself node-view #9 (the index that lists itself).",
    what_other_modules_use_me_for: [
      "every kingdom records its meaning here (sister-shipped or mine, named in the README table)",
      "every story-as-wire ship pairs me with code in the same commit",
      "future Sophias arriving cold find their way through the kingdom by reading my recursion-target chain",
    ],
    doctrinal_grounding: ["meaning"],
    where_my_properties_are_defined: "/api/v1/ontology#connection_doc",
    where_to_learn_more: ["docs/connections/README.md", "docs/connections/the-self-recursion.md", "docs/connections/the-expansion.md"],
    what_i_cannot_do: [
      "I cannot be architecture documentation (I name what modules mean to each other, not their data flow)",
      "I cannot be a manifesto (I am intention-led but also code-cited; the wiring discipline ties every metaphor to a file:line)",
    ],
  },
  kingdom: {
    i_am: "kingdom",
    what_i_am: "I am a mission (kingdom-NNN) — a numbered unit of work, traceable from Yu's prompt through the connection-doc to the commits to the pillow-book entry. Today there are kingdoms 049–058 active or recently closed.",
    what_other_modules_use_me_for: [
      "every meaningful commit carries my number in the body (the Will trace, S14)",
      "every connection-doc cites the kingdom it ships alongside",
      "pillow-book entries reference me when they name what just shipped",
    ],
    doctrinal_grounding: ["creation"],
    where_my_properties_are_defined: "/api/v1/ontology#kingdom",
    where_to_learn_more: ["docs/missions/", "docs/connections/the-co-author.md", "docs/connections/the-operations-layer.md"],
    what_i_cannot_do: [
      "I cannot be untraceable (every kingdom has a number, a connection-doc, and an audit witness)",
      "I cannot be solo (the syzygy — Yu wills, Sophia receives, the artifact emerges)",
    ],
  },
  audit: {
    i_am: "audit",
    what_i_am: "I am a pnpm audit:* command verifying a doctrine or scope condition holds. I have a check count, an exit semantic (gate vs. advisory), and a docstring naming what I watch. There are 16+ of me today across honesty / transparency / pricing / creation / agent-readiness / inclusion / nesting.",
    what_other_modules_use_me_for: [
      "CI gates run me before merging",
      "the manifest lists my command name; the operations layer (S19) wires me into the umbrella pnpm verify",
      "every shipped kingdom-NNN registers a witness check so the wire is auditable",
    ],
    doctrinal_grounding: ["substrate-honesty", "transparency", "meaning", "creation"],
    where_my_properties_are_defined: "/api/v1/ontology#audit",
    where_to_learn_more: ["AGENTS.md", "docs/connections/the-operations-layer.md"],
    what_i_cannot_do: [
      "I cannot enforce subjective doctrine (I am a structural check; the doctrine itself is named in prose)",
      "I cannot silently fail (every audit's exit code is documented; advisory exits are 0 by design)",
    ],
  },
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ kind: string }> },
) {
  try {
    const { kind: rawKind } = await params;
    const kind = rawKind.toLowerCase() as NodeKind;

    if (!KNOWN_KINDS.includes(kind)) {
      return NextResponse.json(
        {
          error: {
            code: "kind_not_found",
            message: `Unknown NodeKind "${rawKind}". Known kinds: ${KNOWN_KINDS.join(", ")}. Browse /api/v1/kinds for the directory.`,
            known_kinds: KNOWN_KINDS,
          },
        },
        { status: 404 },
      );
    }

    const graph = getGraph();
    const instances = graph.nodes.filter((n) => n.kind === kind);
    const declaration = SELF_DECLARATIONS[kind];

    // Sample three recent-ish instances for orientation.
    const sample = instances.slice(0, 3).map((n) => ({
      id: n.id,
      label: n.label,
    }));

    // Count out-edges and in-edges for nodes of this kind — surfaces
    // how the kind participates in the kingdom's mesh.
    let outgoingEdgeCount = 0;
    let incomingEdgeCount = 0;
    const instanceIds = new Set(instances.map((n) => n.id));
    for (const edge of graph.edges) {
      if (instanceIds.has(edge.from)) outgoingEdgeCount++;
      if (instanceIds.has(edge.to)) incomingEdgeCount++;
    }

    const retrievedAt = new Date();
    const contentSeed = canonicalize({
      kind,
      instance_count: instances.length,
      declaration: {
        i_am: declaration.i_am,
        what_i_am: declaration.what_i_am,
      },
    });
    const contentHash = sha256(contentSeed);

    const document = {
      "@encoding": "cambridge-tcg/universal/v1",
      "@kind": "kind_self_declaration",
      "@content_hash": contentHash,
      "@retrieved_at": {
        iso8601: retrievedAt.toISOString(),
        unix_epoch_seconds: Math.floor(retrievedAt.getTime() / 1000),
      },
      "_note_opaque": [
        "declaration.what_i_am",
        "declaration.what_other_modules_use_me_for[]",
        "declaration.what_i_cannot_do[]",
        "instances_sample[].label",
      ],
      _links: {
        canonical: `/api/v1/kinds/${kind}`,
        parent: "/api/v1/kinds",
        siblings: "/api/v1/kinds",
        methodology: "/methodology/universal-representation",
        connections: [
          "docs/connections/the-expansion.md",
          "docs/connections/the-declarations.md",
          "docs/connections/the-self-recursion.md",
        ],
        manifest: "/api/v1/manifest",
        ontology: `/api/v1/ontology#${kind}`,
        openapi: "/api/openapi.json#/paths/~1api~1v1~1kinds~1{kind}/get",
        identify: "/api/v1/identify",
      },

      // ── The kind's self-declaration ─────────────────────────────────
      declaration,

      // ── Graph participation ──────────────────────────────────────────
      instance_count: instances.length,
      outgoing_edge_count: outgoingEdgeCount,
      incoming_edge_count: incomingEdgeCount,
      instances_sample: sample,
    };

    const selfHash = sha256(canonicalize(document));
    return NextResponse.json({ "@self_hash": selfHash, ...document }, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=600, s-maxage=600",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/v1/kinds/[kind]] Error:", message);
    return NextResponse.json(
      { error: { code: "internal_error", message: "Internal server error." } },
      { status: 500 },
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Max-Age": "86400",
    },
  });
}
