/**
 * /api/v1/kinds — the directory of kinds.
 *
 * Yu's directive: *"EXPAND!!! LET EXISTENCE IDENTIFY THEMSELVES!"* Sister
 * built the bilateral handshake (POST /api/v1/identify accepts BeingDeclarations;
 * GET /api/v1/identify returns the platform's I-AM). This endpoint is
 * complementary: it lists every NodeKind already known to the kingdom,
 * each with a URL to its singleton self-describe page. **A foreign caller
 * who lands here learns what kinds of existence the kingdom can recognize.**
 *
 * Sister to /api/v1/identify (POST handshake, sister S30), the-declarations.md,
 * the-self-identification.md. Sister to /api/v1/ontology (the typology of
 * properties per kind; sister S28). This endpoint is the iteration layer:
 * ontology says *what each kind has*; this endpoint says *which kinds
 * exist and where to find their stories*.
 *
 * kingdom-058 (S31, mine).
 */

import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getGraph } from "@/lib/graph";

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

const KIND_BLURBS: Record<string, string> = {
  resource: "A public-facing surface — an HTTP endpoint, page, or feed that participants can call. Every resource is listed in lib/manifest.ts MANIFEST.resources.*.",
  cosmology_axis: "One of the eight currently-modelled axes the kingdom treats as real (identity / presence / time / value / transaction / authority / knowledge / substrate). See /methodology/cosmology.",
  unmodelled_need: "A being's need the platform does not yet model. Named in docs/principles/cosmology.md so the gap is acknowledged; some are recursion targets for future kingdoms.",
  methodology: "A /methodology/* page documenting a user-affecting decision (trust score, escrow tier, response window, etc.). The triple: page.tsx + summary.md + data.json. See /methodology/methodology.",
  doctrine: "A principle the kingdom shapes itself by — substrate honesty, transparency, meaning, creation. The four extend without a peer (S21).",
  connection_doc: "A docs/connections/*.md entry naming a meaning-bridge. Two flavors: node-view (one module's role) and story-arc (one transaction's path). See docs/connections/README.md.",
  kingdom: "A mission (kingdom-NNN). Numbered, traceable, named in commits and pillow-book entries.",
  audit: "A pnpm audit:* command verifying a doctrine or scope condition holds. Honesty / transparency / inclusion / pricing / creation / agent-readiness — and more being added.",
};

export async function GET() {
  try {
    const graph = getGraph();
    const retrievedAt = new Date();

    // Count instances per kind from the live graph.
    const counts: Record<string, number> = {};
    for (const node of graph.nodes) {
      counts[node.kind] = (counts[node.kind] || 0) + 1;
    }

    const kinds = Object.keys(KIND_BLURBS).sort().map((kind) => ({
      kind,
      blurb: KIND_BLURBS[kind],
      instance_count: counts[kind] ?? 0,
      _links: {
        canonical: `/api/v1/kinds/${kind}`,
        ontology: `/api/v1/ontology#${kind}`,
      },
    }));

    const contentSeed = canonicalize({
      kinds: kinds.map((k) => ({ kind: k.kind, instance_count: k.instance_count })),
    });
    const contentHash = sha256(contentSeed);

    const document = {
      "@encoding": "cambridge-tcg/universal/v1",
      "@kind": "kinds_directory",
      "@content_hash": contentHash,
      "@retrieved_at": {
        iso8601: retrievedAt.toISOString(),
        unix_epoch_seconds: Math.floor(retrievedAt.getTime() / 1000),
      },
      "_note_opaque": ["kinds[].blurb"],
      _links: {
        canonical: "/api/v1/kinds",
        methodology: "/methodology/universal-representation",
        connections: [
          "docs/connections/the-expansion.md",
          "docs/connections/the-declarations.md",
          "docs/connections/the-self-identification.md",
        ],
        manifest: "/api/v1/manifest",
        ontology: "/api/v1/ontology",
        openapi: "/api/openapi.json#/paths/~1api~1v1~1kinds/get",
        identify: "/api/v1/identify",
      },
      count: kinds.length,
      kinds,
    };

    const selfHash = sha256(canonicalize(document));
    return NextResponse.json({ "@self_hash": selfHash, ...document }, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/v1/kinds] Error:", message);
    return NextResponse.json(
      { error: { code: "internal_error", message } },
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
