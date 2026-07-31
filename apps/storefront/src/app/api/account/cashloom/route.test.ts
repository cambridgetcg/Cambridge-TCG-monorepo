import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteCashloomSettlementProfile,
  getCashloomSettlementProfile,
  isCashloomSettlementMigrationMissing,
  saveCashloomSettlementProfile,
} from "@/lib/cashloom/db";
import { DELETE, GET, PUT } from "./route";

const authMocks = vi.hoisted(() => ({ auth: vi.fn() }));

vi.mock("@/lib/auth", () => ({ auth: authMocks.auth }));
vi.mock("@/lib/cashloom/db", () => ({
  deleteCashloomSettlementProfile: vi.fn(),
  getCashloomSettlementProfile: vi.fn(),
  isCashloomSettlementMigrationMissing: vi.fn(),
  saveCashloomSettlementProfile: vi.fn(),
}));

const SESSION = {
  user: { id: "123e4567-e89b-42d3-a456-426614174000", email: "owner@example.test" },
  expires: "2099-01-01T00:00:00.000Z",
};
const KEY_ID = `sha256:${"a".repeat(64)}`;
const PROFILE = {
  merchant_key_id: KEY_ID,
  enabled: true,
  handoff_mode: "offline_bundle" as const,
  identity_assurance: "user-declared-key-pin" as const,
  disclosure_notice_version: "cashloom-key-linkability-v1" as const,
  disclosure_acknowledged_at: "2026-07-31T12:00:00.000Z",
  created_at: "2026-07-31T12:00:00.000Z",
  updated_at: "2026-07-31T12:00:00.000Z",
};

function putRequest(body: unknown) {
  return new Request("https://example.test/api/account/cashloom", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  authMocks.auth.mockResolvedValue(SESSION);
  vi.mocked(isCashloomSettlementMigrationMissing).mockReturnValue(false);
});

describe("/api/account/cashloom", () => {
  it("requires an owner session and marks every error private no-store", async () => {
    authMocks.auth.mockResolvedValueOnce(null);
    const response = await GET();
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(getCashloomSettlementProfile).not.toHaveBeenCalled();
  });

  it("returns only the stable profile DTO", async () => {
    vi.mocked(getCashloomSettlementProfile).mockResolvedValueOnce(PROFILE);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ profile: PROFILE });
    expect(getCashloomSettlementProfile).toHaveBeenCalledWith(SESSION.user.id);
  });

  it("rejects unknown fields before persistence", async () => {
    const response = await PUT(
      putRequest({
        merchant_key_id: KEY_ID,
        enabled: true,
        handoff_mode: "offline_bundle",
        disclosure_notice_version: "cashloom-key-linkability-v1",
        disclosure_acknowledged: true,
        private_key: "never",
      }),
    );
    expect(response.status).toBe(422);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(saveCashloomSettlementProfile).not.toHaveBeenCalled();
  });

  it("caps account JSON before parsing or persistence", async () => {
    const response = await PUT(
      putRequest({
        merchant_key_id: KEY_ID,
        enabled: true,
        handoff_mode: "offline_bundle",
        disclosure_notice_version: "cashloom-key-linkability-v1",
        disclosure_acknowledged: true,
        padding: "x".repeat(1100),
      }),
    );

    expect(response.status).toBe(413);
    expect(saveCashloomSettlementProfile).not.toHaveBeenCalled();
  });

  it("saves a disabled declaration only with the current disclosure acknowledgement", async () => {
    const disabled = { ...PROFILE, enabled: false };
    vi.mocked(saveCashloomSettlementProfile).mockResolvedValueOnce(disabled);
    const response = await PUT(
      putRequest({
        merchant_key_id: KEY_ID,
        enabled: false,
        handoff_mode: "offline_bundle",
        disclosure_notice_version: "cashloom-key-linkability-v1",
        disclosure_acknowledged: true,
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ profile: disabled });
    expect(saveCashloomSettlementProfile).toHaveBeenCalledWith(
      SESSION.user.id,
      expect.objectContaining({ enabled: false, disclosure_acknowledged: true }),
    );
  });

  it("deletes idempotently without exposing whether a row existed", async () => {
    const response = await DELETE();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ deleted: true });
    expect(deleteCashloomSettlementProfile).toHaveBeenCalledWith(SESSION.user.id);
  });

  it("fails closed with a typed 503 before the migration is ready", async () => {
    const missing = Object.assign(new Error("missing"), { code: "42P01" });
    vi.mocked(getCashloomSettlementProfile).mockRejectedValueOnce(missing);
    vi.mocked(isCashloomSettlementMigrationMissing).mockReturnValueOnce(true);
    const response = await GET();
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect((await response.json()).error.code).toBe("CASHLOOM_SETTLEMENT_UNAVAILABLE");
  });
});
