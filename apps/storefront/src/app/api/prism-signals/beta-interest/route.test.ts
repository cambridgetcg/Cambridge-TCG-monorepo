import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, GET, POST } from "./route";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  enabled: vi.fn(),
  get: vi.fn(),
  upsert: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/prism-signals/beta-interest.server", () => ({
  getPrismSignalsBetaInterest: mocks.get,
  upsertPrismSignalsBetaInterest: mocks.upsert,
  deletePrismSignalsBetaInterest: mocks.remove,
}));
vi.mock("@/lib/prism-signals/beta-interest-config.server", () => ({
  prismSignalsBetaIntakeEnabled: mocks.enabled,
}));

const stored = {
  schema: "cambridgetcg.prism-signals-beta-interest/1",
  product_id: "prism-signals",
  channel_preferences: ["web"] as const,
  consent_version: "prism-signals-beta-contact-2026-09-02",
  requested_at: "2026-09-02T10:00:00.000Z",
  updated_at: "2026-09-02T10:00:00.000Z",
  expires_at: "2027-03-01T10:00:00.000Z",
};

function mutation(
  method: "POST" | "DELETE",
  body?: string,
  options: {
    origin?: string | null;
    fetchSite?: string | null;
    contentType?: string | null;
    contentLength?: string;
  } = {},
): Request {
  const headers = new Headers();
  const origin = options.origin === undefined ? "https://cambridgetcg.com" : options.origin;
  const fetchSite = options.fetchSite === undefined ? "same-origin" : options.fetchSite;
  const contentType = options.contentType === undefined ? "application/json" : options.contentType;
  if (origin !== null) headers.set("origin", origin);
  if (fetchSite !== null) headers.set("sec-fetch-site", fetchSite);
  if (contentType !== null) headers.set("content-type", contentType);
  if (options.contentLength !== undefined) {
    headers.set("content-length", options.contentLength);
  }
  return new Request("https://cambridgetcg.com/api/prism-signals/beta-interest", {
    method,
    headers,
    body,
  });
}

function validBody(channels: readonly string[] = ["web"]): string {
  return JSON.stringify({
    channel_preferences: channels,
    contact_consent: true,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.enabled.mockReturnValue(true);
  mocks.auth.mockResolvedValue({ user: { id: "user-a" } });
  mocks.get.mockResolvedValue(stored);
  mocks.upsert.mockResolvedValue(stored);
  mocks.remove.mockResolvedValue(true);
});

describe("PRISM Signals beta-interest API", () => {
  it("blocks only new POST intake before auth or storage when mode is off", async () => {
    mocks.enabled.mockReturnValue(false);
    const response = await POST(mutation("POST", validBody()));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: {
        code: "beta_unavailable",
        message: "New PRISM Signals closed-beta interest intake is paused.",
      },
    });
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(mocks.get).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("keeps owner GET and DELETE available while new intake is off", async () => {
    mocks.enabled.mockReturnValue(false);
    const read = await GET();
    expect(read.status).toBe(200);
    expect(mocks.get).toHaveBeenCalledWith("user-a");

    const removed = await DELETE(mutation("DELETE"));
    expect(removed.status).toBe(200);
    expect(mocks.remove).toHaveBeenCalledWith("user-a");
    expect(mocks.enabled).not.toHaveBeenCalled();
  });

  it("rechecks auth for GET immediately before the owner read", async () => {
    mocks.auth.mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(401);
    expect(mocks.auth).toHaveBeenCalledOnce();
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it.each([
    ["POST", () => POST(mutation("POST", validBody())), mocks.upsert],
    ["DELETE", () => DELETE(mutation("DELETE")), mocks.remove],
  ] as const)("rechecks auth for %s before its owner mutation", async (_method, call, dal) => {
    mocks.auth.mockResolvedValue(null);
    const response = await call();
    expect(response.status).toBe(401);
    expect(mocks.auth).toHaveBeenCalledOnce();
    expect(dal).not.toHaveBeenCalled();
  });

  it.each([
    { origin: null, fetchSite: "same-origin" },
    { origin: "https://evil.example", fetchSite: "cross-site" },
    { origin: "https://cambridgetcg.com", fetchSite: "same-site" },
  ])("rejects a non-same-origin mutation before auth or DAL %#", async (options) => {
    const response = await POST(mutation("POST", validBody(), options));
    expect(response.status).toBe(403);
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("rejects oversized streamed bodies even without Content-Length", async () => {
    const response = await POST(mutation("POST", "x".repeat(1025)));
    expect(response.status).toBe(413);
    expect((await response.json()).error.message).toContain("too large");
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("rejects an oversized declared body before reading or auth", async () => {
    const response = await POST(
      mutation("POST", validBody(), { contentLength: "1025" }),
    );
    expect(response.status).toBe(413);
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it.each([
    ["text/plain", validBody()],
    ["application/json", "{"],
    ["application/json", JSON.stringify({ channel_preferences: ["web"], contact_consent: false })],
    ["application/json", JSON.stringify({ channel_preferences: ["email"], contact_consent: true })],
    ["application/json", JSON.stringify({ channel_preferences: ["web"], contact_consent: true, access: true })],
  ])("rejects non-exact POST content (%s, %j) before auth", async (contentType, body) => {
    const response = await POST(mutation("POST", body, { contentType }));
    expect(response.status).toBe(400);
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("returns only the owner's exact DTO with private no-store headers", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("x-robots-tag")).toContain("noindex");
    expect(await response.json()).toEqual({ interest: stored });
    expect(mocks.get).toHaveBeenCalledWith("user-a");
  });

  it("canonicalizes and upserts explicit interest without access semantics", async () => {
    const response = await POST(
      mutation("POST", validBody(["telegram", "web"])),
    );
    expect(response.status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledWith("user-a", {
      channel_preferences: ["web", "telegram"],
      contact_consent: true,
    });
    expect(JSON.stringify(await response.json())).not.toMatch(
      /queue|entitlement|payment|access_granted/,
    );
  });

  it("requires an empty DELETE and fully removes the owner row", async () => {
    const invalid = await DELETE(mutation("DELETE", "{}"));
    expect(invalid.status).toBe(400);
    expect(mocks.auth).not.toHaveBeenCalled();

    const response = await DELETE(mutation("DELETE"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deleted: true });
    expect(mocks.remove).toHaveBeenCalledWith("user-a");
  });

  it.each([
    ["GET", () => { mocks.get.mockRejectedValueOnce(new Error("db")); return GET(); }],
    ["POST", () => { mocks.upsert.mockRejectedValueOnce(new Error("db")); return POST(mutation("POST", validBody())); }],
    ["DELETE", () => { mocks.remove.mockRejectedValueOnce(new Error("db")); return DELETE(mutation("DELETE")); }],
  ] as const)("returns visible 503 when %s storage is missing", async (_method, call) => {
    const response = await call();
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("beta_unavailable");
  });
});
