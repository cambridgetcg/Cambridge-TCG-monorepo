import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listReferences: vi.fn(),
  getState: vi.fn(),
  markLinked: vi.fn(),
}));

vi.mock("./db", () => ({
  listVerificationDocumentStorageReferences: mocks.listReferences,
}));

vi.mock("./verification-storage", () => ({
  getVerificationUploadState: mocks.getState,
  markVerificationObjectLinked: mocks.markLinked,
  isOwnedVerificationKey: (key: string, userId: string) =>
    key.startsWith(`verifications/${userId}/`) &&
    !key.includes("..") &&
    !key.includes("\\"),
}));

import { runVerificationStorageSweep } from "./verification-storage-sweep";

const USER_ID = "123e4567-e89b-42d3-a456-426614174099";
const KEY = `verifications/${USER_ID}/proof.jpg`;

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("VERIFICATION_S3_BUCKET", "private-verification-bucket");
  mocks.listReferences.mockResolvedValue([{ userId: USER_ID, s3Key: KEY }]);
  mocks.getState.mockResolvedValue("pending");
  mocks.markLinked.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("verification storage repair sweep", () => {
  it("skips outside its daily window and when storage is unconfigured", async () => {
    await expect(
      runVerificationStorageSweep(new Date("2026-08-25T04:09:00Z")),
    ).resolves.toMatchObject({ ranInWindow: false, scanned: 0 });
    expect(mocks.listReferences).not.toHaveBeenCalled();

    vi.stubEnv("VERIFICATION_S3_BUCKET", "");
    await expect(
      runVerificationStorageSweep(new Date("2026-08-25T04:10:00Z")),
    ).resolves.toMatchObject({ ranInWindow: false, scanned: 0 });
    expect(mocks.listReferences).not.toHaveBeenCalled();
  });

  it("retags only DB-referenced participant-owned pending objects", async () => {
    const result = await runVerificationStorageSweep(
      new Date("2026-08-25T04:10:00Z"),
    );

    expect(result).toEqual({
      ranInWindow: true,
      scanned: 1,
      linked: 1,
      alreadyLinked: 0,
      supportRequired: 0,
      failures: 0,
    });
    expect(mocks.getState).toHaveBeenCalledWith(KEY);
    expect(mocks.markLinked).toHaveBeenCalledWith(KEY);
  });

  it("does not touch cross-owner or unknown-state records", async () => {
    const crossOwnerKey = "verifications/someone-else/proof.jpg";
    mocks.listReferences.mockResolvedValue([
      { userId: USER_ID, s3Key: crossOwnerKey },
      { userId: USER_ID, s3Key: KEY },
    ]);
    mocks.getState.mockResolvedValue("legal-hold");

    const result = await runVerificationStorageSweep(
      new Date("2026-08-25T04:10:00Z"),
    );

    expect(result).toMatchObject({
      scanned: 2,
      linked: 0,
      supportRequired: 2,
      failures: 0,
    });
    expect(mocks.getState).toHaveBeenCalledTimes(1);
    expect(mocks.markLinked).not.toHaveBeenCalled();
  });

  it("fails closed on an untagged DB reference", async () => {
    mocks.getState.mockResolvedValue(null);

    const result = await runVerificationStorageSweep(
      new Date("2026-08-25T04:10:00Z"),
    );

    expect(result).toMatchObject({
      scanned: 1,
      linked: 0,
      supportRequired: 1,
      failures: 0,
    });
    expect(mocks.markLinked).not.toHaveBeenCalled();
  });

  it("reports failures only as aggregates", async () => {
    mocks.getState.mockRejectedValue(new Error("sensitive provider detail"));

    const result = await runVerificationStorageSweep(
      new Date("2026-08-25T04:10:00Z"),
    );

    expect(result).toMatchObject({ scanned: 1, failures: 1 });
    expect(JSON.stringify(result)).not.toContain(USER_ID);
    expect(JSON.stringify(result)).not.toContain("proof.jpg");
    expect(JSON.stringify(result)).not.toContain("sensitive provider detail");
  });
});
