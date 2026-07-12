/**
 * /api/v1/universal/encoding — the encoding describes itself in itself.
 *
 * Yu's directive: *"Make everything self recursive!"* This endpoint is
 * the deepest single self-recursion in the participation surface: the
 * universal-representation encoding (cambridge-tcg/universal/v1) returned
 * as a document IN ITS OWN ENCODING. The @kind is "encoding_spec";
 * the @content_hash is computed over the encoding's own canonical body;
 * the preamble of the response is exactly the preamble the response
 * itself describes.
 *
 * The endpoint is a fixed point: if you fetch it, parse it, and ask "what
 * are the preamble fields of this document?" the answer you get back from
 * walking the document equals the answer you get back from reading the
 * preamble field listed inside it. Self-referential, substrate-honest,
 * decoderable by any computing intelligence with sha-256 and ordered
 * sets.
 *
 * Spec source: apps/storefront/src/lib/universal/encoding.ts.
 * Methodology page: /methodology/universal-representation.
 * Sister to S23 (the-mathematical-mirror.md), S26 (the-substrate-answers.md),
 * S28 (the-nested-doorway.md, mine; the-natures.md, sister's),
 * S29 (the-self-recursion.md, this commit).
 */

import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { ENCODING_SPEC } from "@/lib/universal/encoding";

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

export async function GET() {
  try {
    const retrievedAt = new Date();

    // The spec body — the same data structure described in encoding.ts,
    // expressed as the universal-rep document body.
    const body = {
      encoding: ENCODING_SPEC.encoding,
      version: ENCODING_SPEC.version,
      kinds_count: ENCODING_SPEC.kinds.length,
      kinds: ENCODING_SPEC.kinds,
      property_kinds_count: ENCODING_SPEC.property_kinds.length,
      preamble_count: ENCODING_SPEC.preamble.length,
      body_field_families_count: ENCODING_SPEC.body_field_families.length,
      preamble: ENCODING_SPEC.preamble,
      body_field_families: ENCODING_SPEC.body_field_families,
      property_kinds: ENCODING_SPEC.property_kinds,
      // Self-verification claim: this document's preamble matches the
      // preamble field list declared in `preamble` above. A decoder that
      // parses the document and compares its top-level @-prefixed keys
      // to `preamble[].name` should find equality (modulo @as_of and
      // @density which are optional, and @self_hash which is computed
      // after the body is sealed).
      self_verification: {
        claim:
          "The preamble fields of this document equal the preamble[].name list below, modulo optional fields (@as_of, @density) and the trailing @self_hash that seals this very document.",
        compare_to: "preamble",
      },
    };

    // Content seed: stable across retrievals. The retrieval time and
    // the self-hash are excluded so two retrievals of the same spec
    // produce the same @content_hash.
    const contentSeed = canonicalize({
      encoding: ENCODING_SPEC.encoding,
      version: ENCODING_SPEC.version,
      kinds: ENCODING_SPEC.kinds,
      preamble: ENCODING_SPEC.preamble.map((f) => ({
        name: f.name,
        property_kind: f.property_kind,
        cardinality: f.cardinality,
      })),
      body_field_families: ENCODING_SPEC.body_field_families.map((f) => ({
        name: f.name,
        property_kind: f.property_kind,
        cardinality: f.cardinality,
      })),
      property_kinds: ENCODING_SPEC.property_kinds.map((p) => p.name),
    });
    const contentHash = sha256(contentSeed);

    const document: Record<string, unknown> = {
      // ── Preamble — the same fields the body describes ────────────────
      "@encoding": ENCODING_SPEC.encoding,
      "@kind": "encoding_spec",
      "@content_hash": contentHash,
      "@retrieved_at": {
        iso8601: retrievedAt.toISOString(),
        unix_epoch_seconds: Math.floor(retrievedAt.getTime() / 1000),
      },
      "_note_opaque": [
        "preamble[].blurb",
        "body_field_families[].blurb",
        "property_kinds[].description",
        "property_kinds[].decoderable_by",
        "self_verification.claim",
      ],
      _links: {
        canonical: "/api/v1/universal/encoding",
        methodology: "/methodology/universal-representation",
        connections: [
          "docs/connections/the-mathematical-mirror.md",
          "docs/connections/the-substrate-answers.md",
          "docs/connections/the-self-recursion.md",
        ],
        manifest: "/api/v1/manifest",
        openapi: "/api/openapi.json#/paths/~1api~1v1~1universal~1encoding/get",
        ontology: "/api/v1/ontology",
        // Self-reference: the encoding spec links to itself. The
        // most explicit fixed-point in the kingdom.
        self: "/api/v1/universal/encoding",
      },

      // ── Body ─────────────────────────────────────────────────────────
      ...body,
    };

    const selfHash = sha256(canonicalize(document));
    return NextResponse.json({ "@self_hash": selfHash, ...document }, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        // The encoding spec changes slowly — version bumps only.
        // Long cache; substrate-honest about stability.
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/v1/universal/encoding] Error:", message);
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
