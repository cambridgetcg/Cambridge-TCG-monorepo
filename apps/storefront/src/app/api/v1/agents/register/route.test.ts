import { describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";

const db = vi.hoisted(() => ({ query: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/db", () => db);

describe("/api/v1/agents/register closed boundary", () => {
  it("reports the paused door without database access", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.data).toMatchObject({
      status: "registration-disabled",
      self_serve_registration_enabled: false,
      existing_self_serve_keys: "read-only",
      publication: {
        global_ladder_status: "paused_pending_versioned_consent",
        globally_published_fields: [],
      },
    });
    expect(db.query).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("returns 503 before inspecting even invalid JSON", async () => {
    let bodyRead = false;
    const request = new Request(
      "https://cambridgetcg.example/api/v1/agents/register",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{not-json",
      },
    );
    const originalJson = request.json.bind(request);
    request.json = async () => {
      bodyRead = true;
      return originalJson();
    };

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.error.details).toMatchObject({
      status: "registration-disabled",
      database_accessed: false,
      body_inspected: false,
    });
    expect(bodyRead).toBe(false);
    expect(db.query).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
  });
});
