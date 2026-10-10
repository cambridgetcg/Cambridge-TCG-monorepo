import { describe, expect, it, vi } from "vitest";
import { MANIFEST } from "@/lib/manifest";
import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import { POST as validateIdentifier } from "@/app/api/v1/identifiers/validate/route";
import { assessResponse, expectedFor } from "../../scripts/deploy-verify-contract";

vi.mock("server-only", () => ({}));

const endpoint = "/api/v1/identifiers/validate";
const resource = Object.values(MANIFEST.resources).flat().find((r) => r.path === endpoint)!;

describe("reference-tool discovery contracts", () => {
  it("declares a public stateless POST and verifies its missing-media-type response", async () => {
    expect(resource.auth).toBe("public");
    expect(resource.methods).toContain("POST");
    expect(resource.contract).toBe("envelope");
    const response = await validateIdentifier(new Request(`https://example.test${endpoint}`, { method: "POST" }));
    expect(expectedFor(resource).codes).toEqual([415]);
    expect((await assessResponse(resource, response)).passed).toBe(true);
  });

  it("keeps OpenAPI declarations aligned with actual validator output", async () => {
    const spec = await (await getOpenApi()).json();
    const operation = spec.paths[endpoint].post;
    expect(operation.security).toEqual([]);
    expect(operation["x-max-request-bytes"]).toBe(1024);
    const requestSchema = spec.components.schemas.IdentifierValidationRequest;
    expect(requestSchema.required).toEqual(["identifier"]);
    expect(requestSchema.additionalProperties).toBe(false);
    expect(requestSchema.properties.identifier.maxLength).toBe(256);

    const response = await validateIdentifier(new Request(`https://example.test${endpoint}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: "OP-OP01-001-JP" }),
    }));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    const body = await response.json();
    expect(body.data.status).toBe("normalization_suggested");
    expect(body.data.normalized_identifier).toBe("op-op01-001-ja");
    expect(body.data.scope).toBe("syntax_only");
    expect(body._meta.license).toBe("NOASSERTION");
    const resultSchema = spec.components.schemas.IdentifierValidationResult;
    expect(Object.keys(body.data).sort()).toEqual(Object.keys(resultSchema.properties).sort());
    for (const key of resultSchema.required) expect(body.data).toHaveProperty(key);
    expect(resultSchema.properties.status.enum).toContain(body.data.status);
    expect(resultSchema.properties.game.properties.status.enum).toContain(body.data.game.status);
  });
});
