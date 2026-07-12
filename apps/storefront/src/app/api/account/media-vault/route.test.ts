import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  rate: vi.fn(),
  normalize: vi.fn(),
  reserve: vi.fn(),
  markReady: vi.fn(),
  list: vi.fn(),
  deleteRow: vi.fn(),
  identity: vi.fn(),
  storageFactory: vi.fn(),
  put: vi.fn(),
  createAccessUrl: vi.fn(),
  deleteObject: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/privacy/action-rate-limit", () => ({
  consumeActionRateLimit: mocks.rate,
}));
vi.mock("@/lib/media-vault/image", () => ({
  CollectorImageError: class CollectorImageError extends Error {
    constructor(readonly code: string) {
      super(code);
    }
  },
  normalizeCollectorImage: mocks.normalize,
}));
vi.mock("@/lib/media-vault/db", () => ({
  COLLECTOR_MEDIA_MAX_OBJECTS: 20,
  COLLECTOR_MEDIA_MAX_TOTAL_BYTES: 100 * 1024 * 1024,
  reserveCollectorMedia: mocks.reserve,
  markCollectorMediaReady: mocks.markReady,
  listCollectorMedia: mocks.list,
  deleteCollectorMediaRow: mocks.deleteRow,
}));
vi.mock("@/lib/media-vault/keys", () => ({
  createCollectorMediaIdentity: mocks.identity,
}));
vi.mock("@/lib/media-vault/storage", () => ({
  createCollectorMediaVaultStorage: mocks.storageFactory,
}));

import { GET, POST } from "./route";

const USER_ID = "123e4567-e89b-42d3-a456-426614174001";
const MEDIA_ID = "123e4567-e89b-42d3-a456-426614174000";
const OBJECT_KEY = `collector-media/v1/aa/${"a".repeat(64)}.webp`;
const NORMALIZED = Buffer.from("safe-webp");

const readyItem = {
  id: MEDIA_ID,
  purpose: "collection_photo",
  status: "ready",
  sourceMimeType: "image/jpeg",
  sourceBytes: 12,
  sourceWidth: 10,
  sourceHeight: 10,
  storedBytes: NORMALIZED.byteLength,
  width: 10,
  height: 10,
  createdAt: "2026-07-12T00:00:00.000Z",
  readyAt: "2026-07-12T00:00:01.000Z",
};

function configure(mode = "on") {
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

function uploadRequest(
  body: BodyInit = Buffer.from("source-image"),
  headers: Record<string, string> = {},
): Request {
  return new Request("https://cambridgetcg.com/api/account/media-vault", {
    method: "POST",
    headers: {
      origin: "https://cambridgetcg.com",
      "content-type": "image/jpeg",
      ...headers,
    },
    body,
  });
}

function allowedRate() {
  return {
    ok: true,
    allowed: true,
    remaining: 9,
    retryAfterSeconds: 0,
    windows: [
      { name: "hour", limit: 10, used: 1, remaining: 9, resetsInSeconds: 100 },
      { name: "day", limit: 30, used: 1, remaining: 29, resetsInSeconds: 1000 },
    ],
  };
}

describe("collector media owner route", () => {
  beforeEach(() => {
    configure();
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.auth.mockResolvedValue({ user: { id: USER_ID } });
    mocks.rate.mockResolvedValue(allowedRate());
    mocks.normalize.mockResolvedValue({
      body: NORMALIZED,
      sourceMimeType: "image/jpeg",
      sourceBytes: 12,
      sourceWidth: 10,
      sourceHeight: 10,
      storedBytes: NORMALIZED.byteLength,
      width: 10,
      height: 10,
      sha256Hex: "b".repeat(64),
      checksumSha256Base64: "checksum-base64",
    });
    mocks.identity.mockReturnValue({ id: MEDIA_ID, objectKey: OBJECT_KEY });
    mocks.reserve.mockResolvedValue(true);
    mocks.put.mockResolvedValue(undefined);
    mocks.deleteObject.mockResolvedValue(undefined);
    mocks.deleteRow.mockResolvedValue(true);
    mocks.markReady.mockResolvedValue(readyItem);
    mocks.list.mockResolvedValue([readyItem]);
    mocks.storageFactory.mockReturnValue({
      put: mocks.put,
      createAccessUrl: mocks.createAccessUrl,
      delete: mocks.deleteObject,
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("requires an authenticated owner before touching rate, body, DB, or S3", async () => {
    mocks.auth.mockResolvedValue(null);
    const response = await POST(uploadRequest());

    expect(response.status).toBe(401);
    expect(mocks.rate).not.toHaveBeenCalled();
    expect(mocks.normalize).not.toHaveBeenCalled();
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(mocks.storageFactory).not.toHaveBeenCalled();
  });

  it.each(["off", "read-only"])(
    "keeps intake closed in %s mode before rate, body, DB, or S3",
    async (mode) => {
      configure(mode);
      const response = await POST(uploadRequest());

      expect(response.status).toBe(503);
      expect(mocks.rate).not.toHaveBeenCalled();
      expect(mocks.normalize).not.toHaveBeenCalled();
      expect(mocks.reserve).not.toHaveBeenCalled();
      expect(mocks.storageFactory).not.toHaveBeenCalled();
    },
  );

  it("fails closed on incomplete dedicated config without shared AWS fallback", async () => {
    vi.stubEnv("COLLECTOR_MEDIA_VAULT_BUCKET", "");
    vi.stubEnv("AWS_ACCESS_KEY_ID", "shared-key");
    vi.stubEnv("AWS_SECRET_ACCESS_KEY", "shared-secret");
    vi.stubEnv("AUCTION_S3_BUCKET", "old-public-bucket");
    const response = await POST(uploadRequest());

    expect(response.status).toBe(503);
    expect(mocks.rate).not.toHaveBeenCalled();
    expect(mocks.storageFactory).not.toHaveBeenCalled();
  });

  it("requires same origin before consuming the HMAC account budget", async () => {
    const response = await POST(uploadRequest(Buffer.from("x"), { origin: "https://evil.test" }));

    expect(response.status).toBe(403);
    expect(mocks.rate).not.toHaveBeenCalled();
  });

  it("fails closed when the privacy-preserving rate store is unavailable", async () => {
    mocks.rate.mockResolvedValue({ ok: false, reason: "missing-secret" });
    const response = await POST(uploadRequest());

    expect(response.status).toBe(503);
    expect(mocks.normalize).not.toHaveBeenCalled();
    expect(mocks.reserve).not.toHaveBeenCalled();
  });

  it("rate limits before reading or decoding the body", async () => {
    mocks.rate.mockResolvedValue({
      ...allowedRate(),
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 90,
    });
    const response = await POST(uploadRequest());

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("90");
    expect(mocks.rate).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "collector-media-upload",
        subject: `account:${USER_ID}`,
      }),
    );
    expect(mocks.normalize).not.toHaveBeenCalled();
  });

  it("rejects unsupported and declared-oversize input before decode", async () => {
    const wrongType = await POST(
      uploadRequest(Buffer.from("x"), { "content-type": "image/svg+xml" }),
    );
    expect(wrongType.status).toBe(415);

    const tooLarge = await POST(
      uploadRequest(Buffer.from("x"), { "content-length": String(3 * 1024 * 1024 + 1) }),
    );
    expect(tooLarge.status).toBe(413);
    expect(mocks.normalize).not.toHaveBeenCalled();
  });

  it("normalizes before reserving quota and writes only normalized WebP", async () => {
    const response = await POST(uploadRequest(Buffer.from("source-image")));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(body.media).toEqual(readyItem);
    expect(body).not.toHaveProperty("publicUrl");
    expect(body).not.toHaveProperty("objectKey");
    expect(mocks.reserve).toHaveBeenCalledWith(
      expect.objectContaining({
        id: MEDIA_ID,
        ownerUserId: USER_ID,
        objectKey: OBJECT_KEY,
      }),
    );
    expect(mocks.put).toHaveBeenCalledWith({
      objectKey: OBJECT_KEY,
      body: NORMALIZED,
      checksumSha256Base64: "checksum-base64",
    });
    expect(mocks.normalize.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.reserve.mock.invocationCallOrder[0],
    );
    expect(mocks.reserve.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.put.mock.invocationCallOrder[0],
    );
    expect(mocks.put.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.markReady.mock.invocationCallOrder[0],
    );
  });

  it("returns quota conflict without an S3 client or write", async () => {
    mocks.reserve.mockResolvedValue(false);
    const response = await POST(uploadRequest());

    expect(response.status).toBe(409);
    expect(mocks.storageFactory).not.toHaveBeenCalled();
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it("cleans up object before releasing a failed pending reservation", async () => {
    mocks.put.mockRejectedValue(new Error("ambiguous write"));
    const response = await POST(uploadRequest());

    expect(response.status).toBe(503);
    expect(mocks.deleteObject).toHaveBeenCalledWith(OBJECT_KEY);
    expect(mocks.deleteRow).toHaveBeenCalledWith(MEDIA_ID, USER_ID);
    expect(mocks.deleteObject.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.deleteRow.mock.invocationCallOrder[0],
    );
  });

  it("keeps the pending pointer if failed-write object deletion is unconfirmed", async () => {
    mocks.put.mockRejectedValue(new Error("write failed"));
    mocks.deleteObject.mockRejectedValue(new Error("delete failed"));
    const response = await POST(uploadRequest());

    expect(response.status).toBe(503);
    expect(mocks.deleteRow).not.toHaveBeenCalled();
  });

  it("lists metadata only in read-only mode", async () => {
    configure("read-only");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.media).toEqual([readyItem]);
    expect(JSON.stringify(body)).not.toContain(OBJECT_KEY);
    expect(mocks.storageFactory).not.toHaveBeenCalled();
  });
});
