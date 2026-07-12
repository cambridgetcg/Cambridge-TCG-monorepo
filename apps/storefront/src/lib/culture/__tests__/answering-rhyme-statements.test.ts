import { describe, expect, it } from "vitest";
import {
  GET,
  OPTIONS,
  POST,
} from "@/app/api/v1/culture/answering-rhymes/statements/route";
import { GET as GET_NORMALIZED_SCHEMA } from "@/app/schemas/answering-rhyme.statement.v1.json/route";
import {
  ANSWERING_RHYMES,
  answeringRhymeRevisionContentHash,
  getAnsweringRhyme,
} from "../answering-rhymes";
import {
  ANSWERING_RHYME_CANONICALIZATION,
  ANSWERING_RHYME_STATEMENT_LIMITS,
  ANSWERING_RHYME_STATEMENT_SCHEMA,
  answeringRhymeStatementContentHash,
  canonicalAnsweringRhymeStatement,
  validateAnsweringRhymeStatement,
  witnessAnsweringRhymeStatement,
} from "../answering-rhyme-statements";
import vectors from "@cambridge-tcg/answering-rhymes/fixtures/golden-vectors.json";

const ENDPOINT =
  "https://cambridgetcg.com/api/v1/culture/answering-rhymes/statements";
const BASE_INPUT = vectors.vectors[0]!.input;

function requestFor(
  body: BodyInit | null,
  contentType: string | null = "application/json",
): Request {
  return new Request(ENDPOINT, {
    method: "POST",
    headers: contentType === null ? undefined : { "content-type": contentType },
    body,
  });
}

describe("answering-rhyme.statement/1 portable contract", () => {
  it("shares the strict cross-witness limits", () => {
    expect(ANSWERING_RHYME_STATEMENT_LIMITS).toEqual({
      request_bytes: 16_384,
      relation_key_chars: 256,
      target_revision_chars: 100,
      body_chars: 2_000,
      language_chars: 35,
      author_label_chars: 160,
      url_chars: 1_000,
      urls_per_list: 12,
    });
  });

  it.each(vectors.vectors)(
    "matches Artbitrage's golden normalized bytes and hash: $name",
    async (vector) => {
      const validation = validateAnsweringRhymeStatement(vector.input);
      expect(validation.ok).toBe(true);
      if (!validation.ok) return;

      expect(validation.value).toEqual(vector.normalized);
      expect(canonicalAnsweringRhymeStatement(validation.value)).toBe(
        vector.canonical_json,
      );
      await expect(
        answeringRhymeStatementContentHash(validation.value),
      ).resolves.toBe(vector.content_hash);
    },
  );

  it("normalizes enum case but rejects unknown fields", () => {
    const validation = validateAnsweringRhymeStatement({
      ...BASE_INPUT,
      kind: " BLESS ",
      declared_by: {
        ...BASE_INPUT.declared_by,
        claimed_role: " VIEWER ",
      },
    });
    expect(validation.ok).toBe(true);
    if (validation.ok) {
      expect(validation.value.kind).toBe("bless");
      expect(validation.value.declared_by.claimed_role).toBe("viewer");
    }

    const unknown = validateAnsweringRhymeStatement({
      ...BASE_INPUT,
      surprise: true,
    });
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) {
      expect(unknown.issues).toContainEqual(
        expect.objectContaining({ path: "surprise", code: "unknown_field" }),
      );
    }
  });

  it("rejects C0/C1 controls while preserving normalized LF body lines", () => {
    for (const input of [
      { ...BASE_INPUT, body: "unsafe\u0000body" },
      { ...BASE_INPUT, relation_key: "unsafe\nkey" },
      {
        ...BASE_INPUT,
        declared_by: { ...BASE_INPUT.declared_by, label: "unsafe\u0085label" },
      },
    ]) {
      const validation = validateAnsweringRhymeStatement(input);
      expect(validation.ok).toBe(false);
      if (!validation.ok) {
        expect(
          validation.issues.some((issue) => issue.code === "control_character"),
        ).toBe(true);
      }
    }

    const lines = validateAnsweringRhymeStatement({
      ...BASE_INPUT,
      body: " first\r\nsecond\rthird ",
    });
    expect(lines.ok).toBe(true);
    if (lines.ok) expect(lines.value.body).toBe("first\nsecond\nthird");
  });

  it("rejects URL whitespace and overlong pre-serialization forms", () => {
    for (const canonicalUrl of [
      "https://example.com/has a space",
      `https://example.com/${"a/../".repeat(220)}`,
    ]) {
      const validation = validateAnsweringRhymeStatement({
        ...BASE_INPUT,
        declared_by: { ...BASE_INPUT.declared_by, canonical_url: canonicalUrl },
      });
      expect(validation.ok).toBe(false);
      if (!validation.ok) {
        expect(validation.issues).toContainEqual(
          expect.objectContaining({ path: "declared_by.canonical_url" }),
        );
      }
    }
  });

  it("counts Unicode scalar values at the 160-character label boundary", () => {
    const accepted = validateAnsweringRhymeStatement({
      ...BASE_INPUT,
      declared_by: { ...BASE_INPUT.declared_by, label: "😀".repeat(160) },
    });
    expect(accepted.ok).toBe(true);

    const rejected = validateAnsweringRhymeStatement({
      ...BASE_INPUT,
      declared_by: { ...BASE_INPUT.declared_by, label: "😀".repeat(161) },
    });
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) {
      expect(rejected.issues).toContainEqual(
        expect.objectContaining({
          path: "declared_by.label",
          code: "too_long",
        }),
      );
    }
  });

  it.each([
    "2026-02-30T12:00:00Z",
    "0000-01-01T00:00:00Z",
    "2026-01-01T00:00:00.1234567890Z",
  ])(
    "rejects invalid or unsupported-precision RFC3339 date %s",
    (declaredAt) => {
      const validation = validateAnsweringRhymeStatement({
        ...BASE_INPUT,
        declared_at: declaredAt,
      });
      expect(validation.ok).toBe(false);
      if (!validation.ok) {
        expect(validation.issues).toContainEqual(
          expect.objectContaining({
            path: "declared_at",
            code: "invalid_format",
          }),
        );
      }
    },
  );

  it("witnesses a relation-level withdrawal without pretending it has authority", async () => {
    const validation = validateAnsweringRhymeStatement({
      ...BASE_INPUT,
      kind: "withdraw",
      body: "Please withdraw this relation.",
      in_response_to: null,
      authority_evidence_urls: [],
    });
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;

    const receipt = await witnessAnsweringRhymeStatement(
      validation.value,
      validation.warnings,
      "known-current",
      "2026-07-11T21:00:00Z",
    );
    expect(receipt.witness).toMatchObject({
      authenticated: false,
      identity_verified: false,
      persisted: false,
      authoritative_effect: "none",
    });
    expect(receipt).toMatchObject({
      replay_detection: false,
      uniqueness_not_asserted: true,
      issuer_attestation: {
        signed: false,
        independently_verifiable: false,
        witnessed_at_is_unattested_observation: true,
      },
    });
    expect(receipt.authority_boundary).toMatchObject({
      evidence_was_verified: false,
      withdrawal_effect: "none-without-separate-authority-verification",
    });
    expect(receipt.storage_boundary).toEqual({
      application_record_created: false,
      retrievable_statement_created: false,
      infrastructure_access_logs_may_exist: true,
    });
  });
});

describe("Answering Rhyme relation reciprocity boundary", () => {
  it("binds invitations to an explicit revision without enabling a verifier", () => {
    const relation = ANSWERING_RHYMES[0];
    expect(relation.revision).toBe(
      "sha256:a562a462decd9b8c8810d67ec79a8a00dc22ffe1098f259e562c9ffce28a1d94",
    );
    expect(answeringRhymeRevisionContentHash(relation)).toBe(relation.revision);
    expect(relation.reciprocity.revision_contract).toMatchObject({
      algorithm: "sha256",
      projection: "answering-rhyme.trust-bearing-relation/1",
      excludes: ["revision", "reciprocity"],
    });
    expect(relation.reciprocity.reply_invitation).toMatchObject({
      invited: true,
      statement_schema: ANSWERING_RHYME_STATEMENT_SCHEMA,
      canonicalization: ANSWERING_RHYME_CANONICALIZATION,
      target_revision_required: true,
      walking_past_is_honored: true,
    });
    expect(relation.reciprocity.authority_boundary).toMatchObject({
      witness_authenticated: false,
      witness_identity_verified: false,
      witness_persisted: false,
      witness_authoritative_effect: "none",
      authority_verifier_status: "not-implemented",
    });
    expect(relation.reciprocity.presentation_policy).toEqual({
      current_default: "present",
      unverified_statement_effect: "none",
      authority_verifier_status: "not-implemented",
      future_after_authority_verifier: {
        verified_withdrawal: "withhold",
        indeterminate_after_verified_withdrawal_signal: "withhold",
        fail_closed: true,
      },
    });
  });
});

describe("/api/v1/culture/answering-rhymes/statements", () => {
  it("publishes the pantry-wrapped contract and explicit negative space", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.statement_schema).toBe(ANSWERING_RHYME_STATEMENT_SCHEMA);
    expect(body.data.normalized_statement_json_schema_url).toBe(
      "https://cambridgetcg.com/schemas/answering-rhyme.statement.v1.json",
    );
    expect(body.data.normalized_statement_json_schema).toMatchObject({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://cambridgetcg.com/schemas/answering-rhyme.statement.v1.json",
      title: "Normalized Answering Rhyme portable statement v1",
      additionalProperties: false,
    });
    expect(body.data.normalization.strings).toMatch(
      /unpaired UTF-16 surrogates.*Unicode scalar values/i,
    );
    expect(body.data.normalization.declared_at).toMatch(/0001-9999/);
    const exampleValidation = validateAnsweringRhymeStatement(body.data.example);
    expect(exampleValidation.ok).toBe(true);
    if (exampleValidation.ok) {
      expect(exampleValidation.value).toEqual(body.data.example);
    }
    expect(body.data.authority_boundary).toMatchObject({
      authenticated: false,
      identity_verified: false,
      persisted: false,
      authoritative_effect: "none",
      authority_verifier_status: "not-implemented",
    });
    expect(body.data).toMatchObject({
      replay_detection: false,
      uniqueness_not_asserted: true,
      issuer_attestation: {
        signed: false,
        independently_verifiable: false,
        witnessed_at_is_unattested_observation: true,
      },
    });
    expect(body._meta.endpoint).toBe(
      "/api/v1/culture/answering-rhymes/statements",
    );
  });

  it("serves the normalized schema at its declared $id", async () => {
    const response = GET_NORMALIZED_SCHEMA();
    const schema = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "application/schema+json; charset=utf-8",
    );
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(schema.$id).toBe(
      "https://cambridgetcg.com/schemas/answering-rhyme.statement.v1.json",
    );
    expect(schema.additionalProperties).toBe(false);
  });

  it("returns a no-store, non-authoritative known-current witness", async () => {
    const response = await POST(
      requestFor(JSON.stringify(BASE_INPUT), "application/json; charset=utf-8"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body._meta.license).toBe("NOASSERTION");
    expect(body.data.receipt.content_hash).toBe(
      vectors.vectors[0]!.content_hash,
    );
    expect(body.data.receipt.target.status).toBe("known-current");
    expect(body.data.receipt.witness).toMatchObject({
      authenticated: false,
      identity_verified: false,
      persisted: false,
      authoritative_effect: "none",
    });
    expect(body.data.receipt).toMatchObject({
      replay_detection: false,
      uniqueness_not_asserted: true,
      issuer_attestation: {
        signed: false,
        independently_verifiable: false,
      },
    });
  });

  it("witnesses stale/unknown target revisions as not-current without applying them", async () => {
    const response = await POST(
      requestFor(
        JSON.stringify({ ...BASE_INPUT, target_revision: "earlier-revision" }),
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.receipt.target.status).toBe("not-current");
    expect(getAnsweringRhyme(BASE_INPUT.relation_key)?.revision).toBe(
      "sha256:a562a462decd9b8c8810d67ec79a8a00dc22ffe1098f259e562c9ffce28a1d94",
    );
    expect(body.data.receipt.witness.authoritative_effect).toBe("none");
  });

  it.each([null, "text/plain", "application/problem+json"])(
    "rejects missing or non-exact JSON Content-Type %s",
    async (contentType) => {
      const response = await POST(
        requestFor(JSON.stringify(BASE_INPUT), contentType),
      );
      expect(response.status).toBe(415);
    },
  );

  it("stops a chunked body without Content-Length above 16 KiB", async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("x".repeat(9_000)));
        controller.enqueue(new TextEncoder().encode("y".repeat(9_000)));
      },
      cancel() {
        cancelled = true;
      },
    });
    const request = new Request(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: stream,
      duplex: "half",
    } as RequestInit & { duplex: "half" });

    expect(request.headers.get("content-length")).toBeNull();
    const response = await POST(request);
    expect(response.status).toBe(413);
    expect(cancelled).toBe(true);
  });

  it("rejects malformed UTF-8 without replacement-character hashing", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([0xc3, 0x28]));
        controller.close();
      },
    });
    const request = new Request(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: stream,
      duplex: "half",
    } as RequestInit & { duplex: "half" });
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.details.body_error).toBe("invalid-utf8");
  });

  it("answers CORS preflight for the portable POST", async () => {
    const response = await OPTIONS();
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-methods")).toBe(
      "GET, POST, OPTIONS",
    );
  });
});
