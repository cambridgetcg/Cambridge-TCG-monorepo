import { describe, it, expect } from "vitest";
import { methodNotAllowed } from "../errors";

// Regression: the pantry 405 handler must carry the two machine-recovery
// affordances Next's bare 405 omitted — an `Allow` header and an
// `allowed_methods` list — alongside the standard error envelope.

describe("methodNotAllowed", () => {
  it("returns 405 with an Allow header and allowed_methods detail", async () => {
    const res = methodNotAllowed({ allowed: ["get", "post"], endpoint: "/api/v1/thing" });
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("GET, POST");

    const body = await res.json();
    expect(body.error.code).toBe("INVALID_INPUT");
    expect(body.error.details.allowed_methods).toEqual(["GET", "POST"]);
    // Standard envelope still present (request_id + _meta) so agents parse
    // it the same way as every other pantry error.
    expect(typeof body.error.request_id).toBe("string");
    expect(body._meta).toBeTruthy();
    expect(body._meta.endpoint).toBe("/api/v1/thing");
  });

  it("uppercases and de-duplicates the method list", async () => {
    const res = methodNotAllowed({ allowed: ["Post", "post", "PATCH"] });
    expect(res.headers.get("Allow")).toBe("POST, PATCH");
    const body = await res.json();
    expect(body.error.details.allowed_methods).toEqual(["POST", "PATCH"]);
  });

  it("names the single allowed method in the default message", async () => {
    const res = methodNotAllowed({ allowed: ["POST"] });
    const body = await res.json();
    expect(body.error.message).toContain("POST");
    expect(body.error.message).toContain("method"); // human, actionable
  });
});
