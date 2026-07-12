import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  find: vi.fn(),
  deleteRow: vi.fn(),
  storageFactory: vi.fn(),
  deleteObject: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/media-vault/db", () => ({
  findOwnedCollectorMedia: mocks.find,
  deleteCollectorMediaRow: mocks.deleteRow,
}));
vi.mock("@/lib/media-vault/storage", () => ({
  createCollectorMediaVaultStorage: mocks.storageFactory,
}));

import { DELETE } from "./route";

const USER_ID = "123e4567-e89b-42d3-a456-426614174001";
const MEDIA_ID = "123e4567-e89b-42d3-a456-426614174000";
const OBJECT_KEY = `collector-media/v1/aa/${"a".repeat(64)}.webp`;

function configure(mode = "off") {
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
  return new Request(`https://cambridgetcg.com/api/account/media-vault/${MEDIA_ID}`, {
    method: "DELETE",
    headers: { origin },
  });
}

function context(id = MEDIA_ID) {
  return { params: Promise.resolve({ id }) };
}

describe("collector media deletion", () => {
  beforeEach(() => {
    configure();
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.auth.mockResolvedValue({ user: { id: USER_ID } });
    mocks.find.mockResolvedValue({
      id: MEDIA_ID,
      status: "ready",
      objectKey: OBJECT_KEY,
    });
    mocks.deleteObject.mockResolvedValue(undefined);
    mocks.deleteRow.mockResolvedValue(true);
    mocks.storageFactory.mockReturnValue({ delete: mocks.deleteObject });
  });

  afterEach(() => vi.unstubAllEnvs());

  it("remains available with complete storage config even when mode is off", async () => {
    const response = await DELETE(request(), context());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deleted: true });
    expect(mocks.deleteObject).toHaveBeenCalledWith(OBJECT_KEY);
  });

  it("requires auth and same origin before owner lookup", async () => {
    mocks.auth.mockResolvedValue(null);
    expect((await DELETE(request(), context())).status).toBe(401);
    expect(mocks.find).not.toHaveBeenCalled();

    mocks.auth.mockResolvedValue({ user: { id: USER_ID } });
    expect((await DELETE(request("https://evil.test"), context())).status).toBe(403);
    expect(mocks.find).not.toHaveBeenCalled();
  });

  it("returns an identical 404 for malformed and cross-owner ids", async () => {
    const malformed = await DELETE(request(), context("not-an-id"));
    const malformedBody = await malformed.json();

    mocks.find.mockResolvedValue(null);
    const crossOwner = await DELETE(request(), context());
    const crossOwnerBody = await crossOwner.json();

    expect(malformed.status).toBe(404);
    expect(crossOwner.status).toBe(404);
    expect(malformedBody).toEqual(crossOwnerBody);
    expect(mocks.deleteObject).not.toHaveBeenCalled();
  });

  it("deletes the object before its database pointer", async () => {
    await DELETE(request(), context());

    expect(mocks.find).toHaveBeenCalledWith(MEDIA_ID, USER_ID);
    expect(mocks.deleteObject.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.deleteRow.mock.invocationCallOrder[0],
    );
  });

  it("retains the row when object deletion cannot be confirmed", async () => {
    mocks.deleteObject.mockRejectedValue(new Error("S3 unavailable"));
    const response = await DELETE(request(), context());

    expect(response.status).toBe(503);
    expect(mocks.deleteRow).not.toHaveBeenCalled();
  });

  it("fails closed when dedicated delete configuration is incomplete", async () => {
    vi.stubEnv("COLLECTOR_MEDIA_VAULT_KMS_KEY_ARN", "");
    const response = await DELETE(request(), context());

    expect(response.status).toBe(503);
    expect(mocks.find).not.toHaveBeenCalled();
    expect(mocks.storageFactory).not.toHaveBeenCalled();
  });
});
