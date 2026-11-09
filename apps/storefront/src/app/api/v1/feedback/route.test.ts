import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { query } from "@/lib/db";
import { holderKeySha256, newHolderKey } from "@/lib/feedback/door";
import { DELETE, GET, OPTIONS, POST } from "./route";

vi.mock("@/lib/db", () => ({ query: vi.fn() }));
const mockQuery = vi.mocked(query);

const URL_ = "https://cambridgetcg.example/api/v1/feedback";
const post = (body: unknown) => new Request(URL_, { method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) });
const withKey = (method: string, key: string) => new Request(URL_, { method, headers: { authorization: `Bearer ${key}` } });
const stored = { rows: [{ received_at: new Date("2026-11-06T10:00:00Z"), expires_at: new Date("2027-05-05T10:00:00Z") }], rowCount: 1 };

beforeEach(() => {
  mockQuery.mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("/api/v1/feedback while the door is closed", () => {
  it("describes the door without a database read", async () => {
    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.data).toMatchObject({ status: "closed", accepting_messages: false, holder_key: { works_while_closed: true }, notice: { url: "/privacy#feedback-door" } });
    expect(body.data.kinds).toEqual(expect.arrayContaining(["question", "data-error", "contract-drift", "federation-adopter"]));
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("rejects before inspecting or logging caller content", async () => {
    const request = {
      json: vi.fn(() => {
        throw new Error("body must not be inspected");
      }),
      body: null,
    } as unknown as Request;

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(request.json).not.toHaveBeenCalled();
    expect(body.error.details).toMatchObject({
      status: "feedback-closed",
      body_inspected: false,
      logged: false,
      database_accessed: false,
    });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("still lets a holder read and erase an earlier message", async () => {
    const key = newHolderKey();
    mockQuery.mockResolvedValueOnce({ rows: [{ feedback_id: "fb_0123456789abcdef01234567", kind: "question", topic: null, message: "hi", details: {}, reply_to: null, reply_name: null,
      status: "received", answer: null, answered_at: null, received_at: new Date("2026-11-06T10:00:00Z"), expires_at: new Date("2027-05-05T10:00:00Z") }], rowCount: 1 });
    const read = await GET(withKey("GET", key));
    expect(read.status).toBe(200);
    expect((await read.json()).data).toMatchObject({ "@kind": "feedback-status", status: "received", answer: null, held: { message: "hi" } });
    expect(mockQuery).toHaveBeenLastCalledWith(expect.stringContaining("FROM public_feedback"), [holderKeySha256(key)]);

    mockQuery.mockResolvedValueOnce({ rows: [{ feedback_id: "fb_0123456789abcdef01234567" }], rowCount: 1 });
    const erased = await DELETE(withKey("DELETE", key));
    expect(erased.status).toBe(200);
    expect((await erased.json()).data).toMatchObject({ erased: true, feedback_id: "fb_0123456789abcdef01234567" });
  });
});

describe("/api/v1/feedback while the door is open", () => {
  beforeEach(() => {
    vi.stubEnv("PUBLIC_FEEDBACK", "on");
  });

  it("keeps the named fields and answers with a reference and a holder key shown once", async () => {
    mockQuery.mockResolvedValueOnce(stored);
    const response = await POST(post({ kind: "general", topic: "site-issue", message: "The /prices page is slow", reply_to: "ada@example.com", reply_name: "Ada" }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.data).toMatchObject({
      "@kind": "feedback-receipt", status: "received", holder_key_shown_once: true,
      kept: ["kind", "topic", "message", "reply_to", "reply_name"], expires_at: "2027-05-05T10:00:00.000Z",
    });
    expect(body.data.feedback_id).toMatch(/^fb_[0-9a-f]{24}$/);
    const [, params] = mockQuery.mock.calls[0] as unknown as [string, unknown[]];
    expect(params[1]).toBe(holderKeySha256(body.data.holder_key));
    expect(JSON.stringify(params)).not.toContain(body.data.holder_key);
  });

  it("accepts the older report shapes its signposts show", async () => {
    mockQuery.mockResolvedValueOnce(stored);
    const response = await POST(post({ kind: "contract-drift", endpoint: "/api/v1/universal/card/op-op01-001-ja", observed: "missing _meta.source_license", expected: "per OpenAPI spec", reporter_contact: "admin@yourdomain.example" }));
    expect(response.status).toBe(200);
    expect((await response.json()).data.kept).toEqual(["kind", "observed", "expected", "endpoint", "reply_to"]);
  });

  it("refuses what it would not keep, before the database", async () => {
    const unknown = await POST(post({ kind: "general", message: "hi", user_agent: "Mozilla/5.0" }));
    expect(unknown.status).toBe(400);
    expect((await unknown.json()).error.message).toContain("Unknown field: user_agent");
    expect((await POST(post("not json"))).status).toBe(400);
    expect((await POST(post({ kind: "general", message: "x".repeat(17 * 1024) }))).status).toBe(413);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("answers 429 with Retry-After once the hour's cap is taken", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const response = await POST(post({ kind: "question", message: "hi" }));
    const body = await response.json();
    expect(response.status).toBe(429);
    expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(body.error).toMatchObject({ code: "RATE_LIMITED", details: { cap_per_hour: 30 } });
  });

  it("answers 400, not 503, when the store's check refuses a report, since a retry cannot pass", async () => {
    mockQuery.mockRejectedValueOnce(Object.assign(new Error("violates check constraint"), { code: "23514" }));
    const response = await POST(post({ kind: "question", message: "hi" }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatchObject({ code: "INVALID_INPUT" });
  });

  it("says when the store is not there, and keeps nothing", async () => {
    mockQuery.mockRejectedValueOnce(Object.assign(new Error("relation \"public_feedback\" does not exist"), { code: "42P01" }));
    const response = await POST(post({ kind: "question", message: "hi" }));
    expect(response.status).toBe(503);
    expect((await response.json()).error.details).toEqual({ reason: "not-provisioned" });
  });
});

describe("/api/v1/feedback holder keys", () => {
  it("asks for a key, refuses a malformed one, and says when nothing holds it", async () => {
    expect((await DELETE(new Request(URL_, { method: "DELETE" }))).status).toBe(401);
    expect((await DELETE(withKey("DELETE", "ctcg_agt_0123456789abcdef0123"))).status).toBe(401);
    expect((await GET(withKey("GET", "fbk_too-short"))).status).toBe(401);
    // An agent key a client sends everywhere is not a holder key: the reader gets the door.
    const reader = await GET(withKey("GET", "ctcg_agt_0123456789abcdef0123"));
    expect(reader.status).toBe(200);
    expect((await reader.json()).data["@kind"]).toBe("feedback-door");
    expect(mockQuery).not.toHaveBeenCalled();
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const missing = await GET(withKey("GET", newHolderKey()));
    expect(missing.status).toBe(404);
    expect((await missing.json()).error.message).toContain("180 days");
  });

  it("lets browsers send the key", async () => {
    const response = await OPTIONS();
    expect(response.headers.get("access-control-allow-methods")).toBe("GET, POST, DELETE, OPTIONS");
    expect(response.headers.get("access-control-allow-headers")).toContain("Authorization");
  });
});
