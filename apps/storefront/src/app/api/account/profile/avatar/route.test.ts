import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, POST } from "./route";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  updateProfile: vi.fn(),
  query: vi.fn(),
  deleteObject: vi.fn(),
  presignUpload: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/social/db", () => ({ updateProfile: mocks.updateProfile }));
vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("@/lib/auction/s3", () => ({
  deleteS3Object: mocks.deleteObject,
  getPresignedUploadUrl: mocks.presignUpload,
  getStoredObjectUrl: (key: string) => `https://private-bucket.example/${key}`,
  isOwnedUploadKey: (key: string, namespace: string, userId: string) =>
    key.startsWith(`${namespace}/${userId}/`) && !key.includes("..") && !key.includes("\\"),
  getOwnedUploadKeyFromUrl: (url: string, namespace: string, userId: string) => {
    const prefix = "https://private-bucket.example/";
    if (!url.startsWith(prefix)) return null;
    const key = url.slice(prefix.length);
    return key.startsWith(`${namespace}/${userId}/`) ? key : null;
  },
}));

const USER_ID = "123e4567-e89b-42d3-a456-426614174099";
const KEY = `avatars/${USER_ID}/portrait.jpg`;
const STORED_URL = `https://private-bucket.example/${KEY}`;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: USER_ID } });
  mocks.updateProfile.mockResolvedValue(undefined);
  mocks.deleteObject.mockResolvedValue(undefined);
});

describe("participant avatar storage boundary", () => {
  it("rejects a persisted key outside the authenticated participant namespace", async () => {
    const response = await POST(new Request("https://cambridgetcg.com/api/account/profile/avatar", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        s3Key: "avatars/another-user/portrait.jpg",
        url: "https://tracker.example/pixel.gif",
      }),
    }));

    expect(response.status).toBe(400);
    expect(mocks.updateProfile).not.toHaveBeenCalled();
  });

  it("derives the stored URL instead of accepting a participant-supplied URL", async () => {
    const response = await POST(new Request("https://cambridgetcg.com/api/account/profile/avatar", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ s3Key: KEY, url: "https://tracker.example/pixel.gif" }),
    }));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.updateProfile).toHaveBeenCalledWith(USER_ID, { avatarUrl: STORED_URL });
    expect(await response.json()).toEqual({ ok: true, avatarUrl: STORED_URL });
  });

  it("deletes an owned storage object before clearing the database pointer", async () => {
    const order: string[] = [];
    mocks.query
      .mockResolvedValueOnce({ rows: [{ avatar_url: STORED_URL }] })
      .mockImplementationOnce(async () => { order.push("row"); return { rows: [{ id: USER_ID }] }; });
    mocks.deleteObject.mockImplementationOnce(async () => { order.push("object"); });

    const response = await DELETE();

    expect(response.status).toBe(200);
    expect(order).toEqual(["object", "row"]);
    expect(mocks.deleteObject).toHaveBeenCalledWith(KEY);
    expect(mocks.query).toHaveBeenLastCalledWith(
      expect.stringContaining("avatar_url IS NOT DISTINCT FROM"),
      [USER_ID, STORED_URL],
    );
  });

  it("leaves the database pointer intact when object deletion fails", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ avatar_url: STORED_URL }] });
    mocks.deleteObject.mockRejectedValueOnce(new Error("S3 unavailable"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await DELETE();

    expect(response.status).toBe(503);
    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledOnce();
  });
});
