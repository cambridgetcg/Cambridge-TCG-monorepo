import { describe, expect, it } from "vitest";
import { declarationHash } from "@/lib/identify";
import { POST } from "./route";

function request(body: unknown): Request {
  return new Request("https://cambridgetcg.example/api/v1/identify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function rawRequest(body: BodyInit): Request {
  return new Request("https://cambridgetcg.example/api/v1/identify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

async function post(body: unknown) {
  const response = await POST(request(body) as never);
  return { response, body: await response.json() };
}

describe("POST /api/v1/identify declaration hash contract", () => {
  it("distinguishes nested declarations that the legacy replacer collapsed", async () => {
    const alpha = await post({
      actor_kind: "agent",
      self_label: "nested-probe",
      declared_at: "2026-08-16T00:00:00Z",
      context: { shape: { color: "alpha" } },
    });
    const beta = await post({
      actor_kind: "agent",
      self_label: "nested-probe",
      declared_at: "2026-08-16T00:00:00Z",
      context: { shape: { color: "beta" } },
    });

    expect(alpha.response.status).toBe(200);
    expect(beta.response.status).toBe(200);
    expect(alpha.body.echo.context.shape.color).toBe("alpha");
    expect(beta.body.echo.context.shape.color).toBe("beta");
    expect(alpha.body.content_hash).not.toBe(beta.body.content_hash);
  });

  it("is stable across deep key order and hashes exactly the normalized echo", async () => {
    const left = await post({
      actor_kind: "agent",
      self_label: "ordered-probe",
      context: { z: 2, nested: { omega: true, alpha: false }, a: 1 },
    });
    const right = await post({
      self_label: "ordered-probe",
      context: { a: 1, nested: { alpha: false, omega: true }, z: 2 },
      actor_kind: "agent",
    });

    expect(left.body.content_hash).toBe(right.body.content_hash);
    expect(left.body.content_hash).toBe(declarationHash(left.body.echo));
    expect(right.body.content_hash).toBe(declarationHash(right.body.echo));
  });

  it("keeps witness time out of an absent being-declared timestamp", async () => {
    const declaration = {
      actor_kind: "agent",
      self_label: "time-boundary",
      context: { purpose: "same declaration, same hash" },
    };
    const first = await post(declaration);
    const second = await post(declaration);

    expect(first.body.echo).not.toHaveProperty("declared_at");
    expect(second.body.echo).not.toHaveProperty("declared_at");
    expect(first.body.received_at).toEqual(expect.any(String));
    expect(second.body.received_at).toEqual(expect.any(String));
    expect(first.body.content_hash).toBe(second.body.content_hash);
  });

  it("exposes the migration and explicitly refuses credential claims", async () => {
    const result = await post({
      actor_kind: "agent",
      self_label: "contract-reader",
    });

    expect(result.body.content_hash_contract).toMatchObject({
      id: "cambridgetcg.being-declaration-content-hash/1",
      changed_on: "2026-08-16",
      legacy_unversioned_top_level_replacer_supported: false,
      semantics: {
        fingerprints_normalized_echo: true,
        authenticates_declarer: false,
        verifies_identity: false,
        grants_authority: false,
        is_signature: false,
        is_secret: false,
      },
    });
    expect(result.body.recommended_persistence).toContain(
      "resolves card hashes only",
    );
    expect(result.body._envelope).toMatchObject({
      declaration_federation_endpoint: null,
      existing_card_hash_resolver: "/api/v1/federation/identify/[hash]",
    });
  });

  it("returns 400 rather than hashing ambiguous valid JSON", async () => {
    const negativeZeroRequest = new Request(
      "https://cambridgetcg.example/api/v1/identify",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: '{"actor_kind":"agent","self_label":"negative-zero","response_window_hours":-0}',
      },
    );
    const loneSurrogateRequest = request({
      actor_kind: "agent",
      self_label: "\ud800",
    });

    const negativeZero = await POST(negativeZeroRequest as never);
    const loneSurrogate = await POST(loneSurrogateRequest as never);

    expect(negativeZero.status).toBe(400);
    expect(negativeZero.headers.get("cache-control")).toBe("no-store");
    expect(await negativeZero.json()).toMatchObject({
      error: "invalid_declaration",
      content_hash_created: false,
    });
    expect(loneSurrogate.status).toBe(400);
    expect(await loneSurrogate.json()).toMatchObject({
      error: "invalid_declaration",
      content_hash_created: false,
    });
  });

  it("rejects array roots instead of silently declaring an anonymous being", async () => {
    const result = await post([]);

    expect(result.response.status).toBe(400);
    expect(result.response.headers.get("cache-control")).toBe("no-store");
    expect(result.body).toMatchObject({
      error: "invalid_body",
      message: "Body must be a JSON object.",
    });
  });

  it("drops ill-typed nested fields with explicit losses before composing", async () => {
    const result = await post({
      actor_kind: "agent",
      self_label: "normalization-probe",
      cosmology_assumptions: { identity: {}, time: 42 },
      preferred_modalities: [42, { x: 1 }, "json"],
      context: ["not", "a", "record"],
      capabilities: {
        provider_shape: { invented: true },
        streaming: { sse: "yes", ndjson: true },
        invented_capability: true,
      },
    });

    expect(result.response.status).toBe(200);
    expect(result.body.echo).toMatchObject({
      actor_kind: "agent",
      self_label: "normalization-probe",
      cosmology_assumptions: {},
      preferred_modalities: ["json"],
      capabilities: { streaming: { ndjson: true } },
    });
    expect(result.body.echo).not.toHaveProperty("context");
    expect(result.body.echo.capabilities).not.toHaveProperty("provider_shape");
    expect(result.body.normalization_warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("cosmology_assumptions.identity"),
        expect.stringContaining("preferred_modalities[0]"),
        expect.stringContaining("context"),
        expect.stringContaining("capabilities.provider_shape"),
        expect.stringContaining("capabilities.streaming.sse"),
        expect.stringContaining("capabilities.invented_capability"),
      ]),
    );
    expect(result.body.normalization_warning_summary).toEqual({
      total: result.body.normalization_warnings.length,
      returned: result.body.normalization_warnings.length,
      truncated: false,
    });
    expect(result.body.ontology_alignment.warnings).toEqual(
      expect.arrayContaining(result.body.normalization_warnings),
    );
    expect(JSON.stringify(result.body.for_you)).not.toContain("[object Object]");
    expect(result.body.content_hash).toBe(declarationHash(result.body.echo));
  });

  it("treats prototype-named axes and fields as data, never inherited metadata", async () => {
    const alphaResponse = await POST(rawRequest(
      '{"actor_kind":"agent","self_label":"prototype-axis","cosmology_assumptions":{"__proto__":"alpha"},"toString":"ignored","__proto__":"ignored"}',
    ) as never);
    const betaResponse = await POST(rawRequest(
      '{"actor_kind":"agent","self_label":"prototype-axis","cosmology_assumptions":{"__proto__":"beta"},"toString":"ignored","__proto__":"ignored"}',
    ) as never);
    const alpha = await alphaResponse.json();
    const beta = await betaResponse.json();

    expect(alphaResponse.status).toBe(200);
    expect(betaResponse.status).toBe(200);
    expect(alpha.echo.cosmology_assumptions.__proto__).toBe("alpha");
    expect(beta.echo.cosmology_assumptions.__proto__).toBe("beta");
    expect(alpha.content_hash).not.toBe(beta.content_hash);
    expect(alpha.unrecognized_fields).toEqual([
      { field: "toString", did_you_mean: null },
      { field: "__proto__", did_you_mean: null },
    ]);

    const inheritedActor = await post({
      actor_kind: "toString",
      self_label: "not-an-inherited-map-entry",
    });
    expect(inheritedActor.body.ontology_alignment.extensions_proposed).toEqual([]);
    expect(inheritedActor.body.ontology_alignment.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining("not in the platform's enum")]),
    );
  });

  it("rejects invalid UTF-8 before JSON parsing or hashing", async () => {
    const prefix = new TextEncoder().encode(
      '{"actor_kind":"agent","self_label":"',
    );
    const suffix = new TextEncoder().encode('"}');
    const bytes = new Uint8Array(prefix.length + 2 + suffix.length);
    bytes.set(prefix);
    bytes.set([0xc0, 0xaf], prefix.length);
    bytes.set(suffix, prefix.length + 2);

    const response = await POST(rawRequest(bytes) as never);
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({
      error: "invalid_json",
      content_hash_created: false,
    });
  });

  it("returns a no-store error for malformed JSON", async () => {
    const response = await POST(rawRequest('{"actor_kind":') as never);
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ error: "invalid_json" });
  });

  it("rejects oversized raw bodies before parsing", async () => {
    const response = await POST(rawRequest(" ".repeat(65_537)) as never);
    expect(response.status).toBe(413);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({
      error: "body_too_large",
      content_hash_created: false,
    });
  });

  it("bounds warning response amplification for large invalid arrays", async () => {
    const result = await post({
      actor_kind: "agent",
      self_label: "bounded-warning-probe",
      preferred_modalities: Array.from({ length: 300 }, () => 0),
    });

    expect(result.response.status).toBe(200);
    expect(result.body.echo).not.toHaveProperty("preferred_modalities");
    expect(result.body.normalization_warnings).toHaveLength(1);
    expect(result.body.normalization_warnings[0]).toContain("at most 256 items");
    expect(result.body.normalization_warning_summary).toEqual({
      total: 1,
      returned: 1,
      truncated: false,
    });
  });

  it("caps individual normalization warnings and reports truncation", async () => {
    const result = await post({
      actor_kind: "agent",
      self_label: "warning-collector-probe",
      preferred_modalities: Array.from({ length: 256 }, () => 0),
    });

    expect(result.response.status).toBe(200);
    expect(result.body.echo.preferred_modalities).toEqual([]);
    expect(result.body.normalization_warnings).toHaveLength(64);
    expect(result.body.normalization_warning_summary).toEqual({
      total: 256,
      returned: 64,
      truncated: true,
    });
  });

  it("caps unrecognized-field reporting and discloses the loss", async () => {
    const unknown = Object.fromEntries(
      Array.from({ length: 80 }, (_, index) => [`unknown_${index}`, true]),
    );
    const result = await post({
      actor_kind: "agent",
      self_label: "bounded-unknown-probe",
      ...unknown,
    });

    expect(result.response.status).toBe(200);
    expect(result.body.unrecognized_fields).toHaveLength(64);
    expect(result.body.unrecognized_fields_truncated).toBe(true);
    expect(result.body.ontology_alignment.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining("additional unrecognized fields")]),
    );
  });
});
