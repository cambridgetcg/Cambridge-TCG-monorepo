/**
 * GET/POST /api/v1/culture/answering-rhymes/statements
 *
 * GET publishes the neutral reciprocity-statement contract. POST validates,
 * canonicalizes, and content-hashes one statement, then returns a Cambridge-
 * specific stateless witness receipt. Nothing is authenticated, persisted, or
 * applied to the curated relation by this endpoint.
 */

import { NextResponse } from "next/server";
import normalizedStatementSchema from "@cambridge-tcg/answering-rhymes/schema/statement-v1.json";
import { errorResponse, jsonResponse } from "@/lib/data-pantry";
import { getAnsweringRhyme } from "@/lib/culture/answering-rhymes";
import {
  ANSWERING_RHYME_CANONICALIZATION,
  ANSWERING_RHYME_CLAIMED_ROLES,
  ANSWERING_RHYME_STATEMENT_KINDS,
  ANSWERING_RHYME_STATEMENT_LIMITS,
  ANSWERING_RHYME_STATEMENT_SCHEMA,
  ANSWERING_RHYME_STATEMENTS_ENDPOINT,
  CAMBRIDGE_ANSWERING_RHYME_WITNESS_SCHEMA,
  validateAnsweringRhymeStatement,
  witnessAnsweringRhymeStatement,
} from "@/lib/culture/answering-rhyme-statements";

const ALLOWED_METHODS = "GET, POST, OPTIONS";

function withStatementCors<T extends Response>(response: T): T {
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set("Access-Control-Allow-Methods", ALLOWED_METHODS);
  response.headers.set("Access-Control-Allow-Headers", "content-type");
  return response;
}

function inputError(
  message: string,
  details: Record<string, unknown>,
  status = 400,
): NextResponse {
  return withStatementCors(
    errorResponse({
      code: "INVALID_INPUT",
      message,
      details,
      status,
      endpoint: ANSWERING_RHYME_STATEMENTS_ENDPOINT,
    }),
  );
}

function isSupportedJsonContentType(value: string | null): boolean {
  if (value === null) return false;
  return /^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?\s*$/i.test(
    value,
  );
}

type BoundedBodyRead =
  | { ok: true; text: string }
  | { ok: false; kind: "too-large" | "invalid-utf8" | "unreadable" };

/** Read at most the contract limit; cancel the stream before decoding excess. */
async function readBoundedUtf8Body(request: Request): Promise<BoundedBodyRead> {
  if (request.body === null) return { ok: true, text: "" };

  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytesRead = 0;
  let text = "";

  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytesRead += chunk.value.byteLength;
      if (bytesRead > ANSWERING_RHYME_STATEMENT_LIMITS.request_bytes) {
        await reader.cancel("answering-rhyme statement exceeds request limit");
        return { ok: false, kind: "too-large" };
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    return { ok: true, text };
  } catch (error) {
    try {
      await reader.cancel("answering-rhyme statement could not be decoded");
    } catch {
      // The stream may already be errored or closed; cancellation is best-effort.
    }
    return {
      ok: false,
      kind: error instanceof TypeError ? "invalid-utf8" : "unreadable",
    };
  } finally {
    reader.releaseLock();
  }
}

export async function GET(): Promise<Response> {
  return withStatementCors(
    jsonResponse({
      endpoint: ANSWERING_RHYME_STATEMENTS_ENDPOINT,
      sources: ["answering-rhyme.statement/1 portable contract"],
      source_license: ["cc0"],
      freshness: "identity",
      as_of: "2026-07-12",
      contains_self: true,
      does_not_include: [
        "This contract does not authenticate or verify a statement author or their claimed role.",
        "This endpoint does not create an application record or a retrievable statement; ordinary infrastructure access logs may still exist.",
        "A witness receipt has no authoritative effect on a relation. Corrections require curator review; withdrawals require a separate authority verifier.",
      ],
      data: {
        "@kind": "answering-rhyme-reciprocity-statement-contract",
        statement_schema: ANSWERING_RHYME_STATEMENT_SCHEMA,
        normalized_statement_json_schema_url: normalizedStatementSchema.$id,
        canonicalization: ANSWERING_RHYME_CANONICALIZATION,
        cambridge_witness_schema: CAMBRIDGE_ANSWERING_RHYME_WITNESS_SCHEMA,
        statement_kinds: ANSWERING_RHYME_STATEMENT_KINDS,
        claimed_roles: ANSWERING_RHYME_CLAIMED_ROLES,
        normalized_fields: [
          "schema",
          "canonicalization",
          "relation_key",
          "target_revision",
          "kind",
          "body",
          "language",
          "declared_by.{label,claimed_role,canonical_url}",
          "declared_at",
          "in_response_to",
          "evidence_urls",
          "authority_evidence_urls",
        ],
        normalization: {
          strings:
            "reject unpaired UTF-16 surrogates, then trim and Unicode NFC; character limits count Unicode scalar values",
          body: "reject unpaired UTF-16 surrogates; normalize CRLF and lone CR to LF, then trim and Unicode NFC; internal whitespace is preserved",
          kind_and_claimed_role: "trim, Unicode NFC, then lowercase",
          language: "trim, Unicode NFC, then lowercase; defaults to und",
          declared_at:
            "required RFC 3339, serialized as UTC ISO 8601 milliseconds; normalized UTC year must remain within 0001-9999",
          in_response_to:
            "null when absent; otherwise a full sha256:<64 hex> normalized to lowercase",
          urls: "reject unpaired UTF-16 surrogates; trim + Unicode NFC, parse and serialize as credential-free HTTPS, then dedupe and lexically sort each list",
          optional_values:
            "language defaults to und; canonical_url and in_response_to normalize to null; URL lists normalize to []",
        },
        canonical_bytes:
          "UTF-8 JSON with object keys sorted lexically at every depth; normalized arrays retain their normalized order; no insignificant whitespace.",
        normalized_statement_json_schema: normalizedStatementSchema,
        content_hash: "sha256:<64 lowercase hex> over the canonical bytes",
        replay_detection: false,
        uniqueness_not_asserted: true,
        issuer_attestation: {
          signed: false,
          independently_verifiable: false,
          witnessed_at_is_unattested_observation: true,
          note: "The POST receipt is unsigned. Its witnessed_at value is a server observation, not durable proof that Cambridge issued the receipt.",
        },
        limits: ANSWERING_RHYME_STATEMENT_LIMITS,
        authority_boundary: {
          authenticated: false,
          identity_verified: false,
          persisted: false,
          authoritative_effect: "none",
          authority_verifier_status: "not-implemented",
          correction_application: "separate-curator-review-required",
          withdrawal_application:
            "separate-authority-verification-required; an unverified withdrawal has no presentation effect",
          verified_withdrawal_presentation:
            "withhold and fail closed after a separate authority verifier reports a withdrawal signal",
          requirements_before_activation: [
            "server-only-authenticated-verifier",
            "trusted-issuer-allowlist-or-signature-policy",
            "target-revision-and-replay-policy",
          ],
        },
        target_revision_rule:
          "The required opaque revision prevents a statement about an earlier relation edit from being replayed as if it answered the current relation. Cambridge reports known-current only when key and revision both match its static corpus; not-current statements are still witnessed and never applied.",
        storage_boundary: {
          application_record_created: false,
          retrievable_statement_created: false,
          infrastructure_access_logs_may_exist: true,
        },
        example: {
          schema: ANSWERING_RHYME_STATEMENT_SCHEMA,
          canonicalization: ANSWERING_RHYME_CANONICALIZATION,
          relation_key: "OP-OP05-119-JP-V11F7::artic:77333",
          target_revision:
            "sha256:a562a462decd9b8c8810d67ec79a8a00dc22ffe1098f259e562c9ffce28a1d94",
          kind: "contextualize",
          body: "The print-circulation thread also changes how the two objects travel between owners.",
          language: "en",
          declared_by: {
            label: "a visiting reader",
            claimed_role: "viewer",
            canonical_url: null,
          },
          declared_at: "2026-07-11T20:00:00.000Z",
          in_response_to: null,
          evidence_urls: [],
          authority_evidence_urls: [],
        },
        walking_past_is_honored: true,
      },
    }),
  );
}

export async function POST(request: Request): Promise<Response> {
  if (!isSupportedJsonContentType(request.headers.get("content-type"))) {
    return inputError(
      "Content-Type must be application/json (an optional UTF-8 charset parameter is accepted).",
      { accepted_content_type: "application/json; charset=utf-8" },
      415,
    );
  }

  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (
      Number.isFinite(parsedLength) &&
      parsedLength > ANSWERING_RHYME_STATEMENT_LIMITS.request_bytes
    ) {
      return inputError(
        "The reciprocity statement request is larger than the accepted body limit.",
        {
          max_request_bytes: ANSWERING_RHYME_STATEMENT_LIMITS.request_bytes,
          declared_request_bytes: parsedLength,
        },
        413,
      );
    }
  }

  const bodyRead = await readBoundedUtf8Body(request);
  if (!bodyRead.ok && bodyRead.kind === "too-large") {
    return inputError(
      "The reciprocity statement request is larger than the accepted body limit.",
      { max_request_bytes: ANSWERING_RHYME_STATEMENT_LIMITS.request_bytes },
      413,
    );
  }
  if (!bodyRead.ok) {
    return inputError(
      bodyRead.kind === "invalid-utf8"
        ? "The application/json request body must be valid UTF-8."
        : "The request body stream could not be read.",
      { body_error: bodyRead.kind },
    );
  }

  let input: unknown;
  try {
    input = JSON.parse(bodyRead.text) as unknown;
  } catch {
    return inputError(
      "The request body must be valid JSON for answering-rhyme.statement/1.",
      { statement_schema: ANSWERING_RHYME_STATEMENT_SCHEMA },
    );
  }

  const validation = validateAnsweringRhymeStatement(input);
  if (!validation.ok) {
    return inputError(
      "The reciprocity statement did not match the portable contract.",
      {
        statement_schema: ANSWERING_RHYME_STATEMENT_SCHEMA,
        issues: validation.issues,
      },
    );
  }

  const relation = getAnsweringRhyme(validation.value.relation_key);
  const targetStatus =
    relation?.revision === validation.value.target_revision
      ? "known-current"
      : "not-current";
  const receipt = await witnessAnsweringRhymeStatement(
    validation.value,
    validation.warnings,
    targetStatus,
  );

  return withStatementCors(
    jsonResponse({
      endpoint: ANSWERING_RHYME_STATEMENTS_ENDPOINT,
      sources: ["caller-supplied answering-rhyme.statement/1"],
      freshness: "identity",
      as_of: receipt.witnessed_at,
      license: "NOASSERTION",
      no_cache: true,
      does_not_include: [
        "The declared author and claimed role were not authenticated or identity-verified.",
        "No evidence URL was fetched or authority-verified.",
        "No application record or retrievable statement was created; ordinary infrastructure access logs may still exist.",
        "The receipt has no authoritative effect. It does not alter, correct, hide, or withdraw a curated relation.",
      ],
      data: {
        "@kind": "answering-rhyme-reciprocity-statement-witness",
        receipt,
        next_steps: {
          keep_receipt:
            "Keep the normalized statement and content_hash together if you want another system to recompute the same witness.",
          correction:
            "A correction remains a proposal until a separate curator review applies it.",
          withdrawal:
            "A withdrawal remains non-authoritative until a separate authority verifier binds verified authority to this relation key, target revision, and statement hash.",
        },
        walking_past_is_honored: true,
      },
    }),
  );
}

export async function OPTIONS(): Promise<Response> {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": ALLOWED_METHODS,
      "Access-Control-Allow-Headers": "content-type",
      "Access-Control-Max-Age": "86400",
    },
  });
}
