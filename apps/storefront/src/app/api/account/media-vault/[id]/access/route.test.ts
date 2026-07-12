import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  find: vi.fn(),
  storageFactory: vi.fn(),
  createAccessUrl: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/media-vault/db", () => ({ findOwnedCollectorMedia: mocks.find }));
vi.mock("@/lib/media-vault/storage", () => ({
  COLLECTOR_MEDIA_ACCESS_SECONDS: 60,
  createCollectorMediaVaultStorage: mocks.storageFactory,
}));

import { POST } from "./route";

const USER_ID = "123e4567-e89b-42d3-a456-426614174001";
const MEDIA_ID = "123e4567-e89b-42d3-a456-426614174000";
const OBJECT_KEY = `collector-media/v1/aa/${"a".repeat(64)}.webp`;

function configure(mode = "read-only") {
  vi.stubEnv("COLLECTOR_MEDIA_VAULT_MODE", mode);
  vi.stubEnv("COLLECTOR_MEDIA_VAULT_BUCKET", "ctcg-private-collector-media");
  vi.stubEnv("COLLECTOR_MEDIA_VAULT_REGION", "eu-west-2");
  vi.stubEnv(
    "COLLECTOR_MEDIA_VAULT_KMS_KEY_ARN",
    "arn:aws:kms:eu-west-2:123456789012:key/11111111-2222-4333-8444-555555555555",
  );
  vi.stubEnv("COLLECTOR_MEDIA_VAULT_ACCESS_KEY_ID", "vault-only-access-key");
  vi.stubEnv("COLLECTOR_MEDIA_VAULT_SECRET_ACCESS_KEY", "vault-only-secret");
  vi.stubEnv("COLLECTOR_MEDIA_VAULT_ERASURE_VERIFIED", "true");
}

function request(origin = "https://cambridgetcg.com"): Request {
  return new Request(
    `https://cambridgetcg.com/api/account/media-vault/${MEDIA_ID}/access`,
    { method: "POST", headers: { origin } },
  );
}

function context(id = MEDIA_ID) {
  return { params: Promise.resolve({ id }) };
}

describe("collector media private access", () => {
  beforeEach(() => {
    configure();
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.auth.mockResolvedValue({ user: { id: USER_ID } });
    mocks.find.mockResolvedValue({
      id: MEDIA_ID,
      ownerUserId: USER_ID,
      status: "ready",
      objectKey: OBJECT_KEY,
    });
    mocks.createAccessUrl.mockResolvedValue("https://signed.example/private-capability");
    mocks.storageFactory.mockReturnValue({ createAccessUrl: mocks.createAccessUrl });
  });

  afterEach(() => vi.unstubAllEnvs());

  it("requires authentication and same origin", async () => {
    mocks.auth.mockResolvedValue(null);
    const unauthenticated = await POST(request(), context());
    expect(unauthenticated.status).toBe(401);
    expect(mocks.find).not.toHaveBeenCalled();

    mocks.auth.mockResolvedValue({ user: { id: USER_ID } });
    const crossOrigin = await POST(request("https://evil.test"), context());
    expect(crossOrigin.status).toBe(403);
    expect(mocks.find).not.toHaveBeenCalled();
  });

  it("keeps reads closed in off mode", async () => {
    configure("off");
    const response = await POST(request(), context());

    expect(response.status).toBe(503);
    expect(mocks.find).not.toHaveBeenCalled();
  });

  it("returns the same 404 for invalid, unknown, and cross-owner ids", async () => {
    const invalid = await POST(request(), context("not-an-id"));
    const invalidBody = await invalid.json();

    mocks.find.mockResolvedValue(null);
    const crossOwner = await POST(request(), context());
    const crossOwnerBody = await crossOwner.json();

    expect(invalid.status).toBe(404);
    expect(crossOwner.status).toBe(404);
    expect(invalidBody).toEqual(crossOwnerBody);
    expect(mocks.storageFactory).not.toHaveBeenCalled();
  });

  it("looks up ready media by both id and owner", async () => {
    await POST(request(), context());
    expect(mocks.find).toHaveBeenCalledWith(MEDIA_ID, USER_ID, true);
  });

  it("returns a no-store attachment capability lasting no more than 60 seconds", async () => {
    const response = await POST(request(), context());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(body).toEqual({
      accessUrl: "https://signed.example/private-capability",
      expiresInSeconds: 60,
      disposition: "attachment",
    });
    expect(body.expiresInSeconds).toBeLessThanOrEqual(60);
    expect(JSON.stringify(body)).not.toContain(OBJECT_KEY);
    expect(mocks.createAccessUrl).toHaveBeenCalledWith(OBJECT_KEY);
  });

  it("fails closed without returning a capability when signing fails", async () => {
    mocks.createAccessUrl.mockRejectedValue(new Error("signing unavailable"));
    const response = await POST(request(), context());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.accessUrl).toBeUndefined();
  });
});
