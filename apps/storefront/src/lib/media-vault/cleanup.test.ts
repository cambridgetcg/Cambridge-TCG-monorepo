import { beforeEach, describe, expect, it, vi } from "vitest";

const { resolveMock, claimMock, deleteRowMock, resetClaimMock, storageDeleteMock } = vi.hoisted(() => ({
  resolveMock: vi.fn(),
  claimMock: vi.fn(),
  deleteRowMock: vi.fn(),
  resetClaimMock: vi.fn(),
  storageDeleteMock: vi.fn(),
}));

vi.mock("./config", () => ({
  resolveCollectorMediaVaultConfig: resolveMock,
  collectorMediaVaultOperationAllowed: (result: { ok: boolean }) => result.ok,
}));
vi.mock("./db", () => ({
  claimExpiredPendingCollectorMedia: claimMock,
  deleteClaimedCollectorMediaRow: deleteRowMock,
  resetCollectorMediaCleanupClaim: resetClaimMock,
}));
vi.mock("./storage", () => ({
  createCollectorMediaVaultStorage: () => ({ delete: storageDeleteMock }),
}));

import { runCollectorMediaVaultCleanup } from "./cleanup";

describe("collector media pending cleanup", () => {
  beforeEach(() => {
    resolveMock.mockReset();
    claimMock.mockReset();
    deleteRowMock.mockReset();
    resetClaimMock.mockReset().mockResolvedValue(true);
    storageDeleteMock.mockReset();
  });

  it("skips without querying rows when dedicated delete configuration is absent", async () => {
    resolveMock.mockReturnValue({ ok: false, mode: "off", reason: "missing-config" });
    expect(await runCollectorMediaVaultCleanup()).toEqual({
      skipped: true,
      reason: "storage-not-configured",
      examined: 0,
      deleted: 0,
      failed: 0,
      moreMayRemain: false,
    });
    expect(claimMock).not.toHaveBeenCalled();
  });

  it("deletes S3 before removing an expired pending row", async () => {
    resolveMock.mockReturnValue({ ok: true, config: {} });
    claimMock.mockResolvedValue([{ id: "media-1", ownerUserId: "owner-1", objectKey: "opaque-key" }]);
    storageDeleteMock.mockResolvedValue(undefined);
    deleteRowMock.mockResolvedValue(true);

    const result = await runCollectorMediaVaultCleanup();
    expect(result).toEqual({ skipped: false, examined: 1, deleted: 1, failed: 0, moreMayRemain: false });
    expect(storageDeleteMock).toHaveBeenCalledWith("opaque-key");
    expect(deleteRowMock).toHaveBeenCalledWith("media-1", "owner-1");
    expect(storageDeleteMock.mock.invocationCallOrder[0]).toBeLessThan(deleteRowMock.mock.invocationCallOrder[0]);
  });

  it("keeps the row when S3 deletion is not confirmed", async () => {
    resolveMock.mockReturnValue({ ok: true, config: {} });
    claimMock.mockResolvedValue([{ id: "media-1", ownerUserId: "owner-1", objectKey: "opaque-key" }]);
    storageDeleteMock.mockRejectedValue(new Error("S3 unavailable"));

    const result = await runCollectorMediaVaultCleanup();
    expect(result.failed).toBe(1);
    expect(result.deleted).toBe(0);
    expect(deleteRowMock).not.toHaveBeenCalled();
    expect(resetClaimMock).toHaveBeenCalledWith("media-1", "owner-1");
  });

  it("releases the claim when the database row cannot be removed", async () => {
    resolveMock.mockReturnValue({ ok: true, config: {} });
    claimMock.mockResolvedValue([{ id: "media-1", ownerUserId: "owner-1", objectKey: "opaque-key" }]);
    storageDeleteMock.mockResolvedValue(undefined);
    deleteRowMock.mockResolvedValue(false);

    const result = await runCollectorMediaVaultCleanup();
    expect(result).toMatchObject({ deleted: 0, failed: 1 });
    expect(resetClaimMock).toHaveBeenCalledWith("media-1", "owner-1");
  });
});
