import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteCollectorObservation,
  getCollectorObservation,
  updateCollectorObservation,
} from "@/lib/collector-observations/db";
import { DELETE, GET, PATCH } from "./route";

const authMocks = vi.hoisted(() => ({
  auth: vi.fn<
    () => Promise<
      | null
      | { user: { id: string; email: string }; expires: string }
    >
  >(),
}));

vi.mock("@/lib/auth", () => ({ auth: authMocks.auth }));
vi.mock("@/lib/collector-observations/db", () => ({
  deleteCollectorObservation: vi.fn(),
  getCollectorObservation: vi.fn(),
  isCollectorObservationsTableMissing: vi.fn(),
  updateCollectorObservation: vi.fn(),
}));

const mockAuth = authMocks.auth;
const mockDelete = vi.mocked(deleteCollectorObservation);
const mockGet = vi.mocked(getCollectorObservation);
const mockUpdate = vi.mocked(updateCollectorObservation);

const USER_ID = "123e4567-e89b-42d3-a456-426614174099";
const ID = "123e4567-e89b-42d3-a456-426614174001";
const PARAMS = { params: Promise.resolve({ id: ID }) };

const OBSERVATION = {
  id: ID,
  submission_key: "123e4567-e89b-42d3-a456-426614174000",
  sku: "op-op01-001-ja",
  observation_kind: "purchase" as const,
  condition: "NM" as const,
  price_amount: "13.00",
  price_currency: "GBP" as const,
  observed_on: "2026-07-11",
  first_party_attested: true as const,
  first_party_attested_at: "2026-07-12T10:00:00.000Z",
  sharing_mode: "private" as const,
  sharing_terms_version: "collector-witness-v1",
  sharing_changed_at: "2026-07-12T10:00:00.000Z",
  cc0_acknowledged_at: null,
  evidence_sha256: null,
  revision: 2,
  created_at: "2026-07-12T10:00:00.000Z",
  updated_at: "2026-07-12T11:00:00.000Z",
};

beforeEach(() => {
  vi.resetAllMocks();
  mockAuth.mockResolvedValue({
    user: { id: USER_ID, email: "owner@example.test" },
    expires: "2099-01-01T00:00:00.000Z",
  });
});

describe("/api/account/observations/[id]", () => {
  it("uses the same 404 for absent and non-owned observations", async () => {
    mockGet.mockResolvedValueOnce(null);
    const response = await GET(new Request("https://example.test"), PARAMS);
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({
      error: { code: "OBSERVATION_NOT_FOUND", message: "Collector observation not found." },
    });
    expect(mockGet).toHaveBeenCalledWith(USER_ID, ID);
  });

  it("returns 409 on an optimistic-revision conflict", async () => {
    mockUpdate.mockResolvedValueOnce({ status: "conflict", current_revision: 3 });
    const response = await PATCH(
      new Request("https://example.test", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          revision: 2,
          price_amount: "13.00",
          first_party_attested: true,
        }),
      }),
      PARAMS,
    );
    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatchObject({
      code: "REVISION_CONFLICT",
      current_revision: 3,
    });
  });

  it("hard-deletes and returns an empty private 204", async () => {
    mockDelete.mockResolvedValueOnce(true);
    const response = await DELETE(new Request("https://example.test"), PARAMS);
    expect(response.status).toBe(204);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.text()).toBe("");
    expect(mockDelete).toHaveBeenCalledWith(USER_ID, ID);
  });

  it("returns the simple PATCH shape", async () => {
    mockUpdate.mockResolvedValueOnce({ status: "updated", observation: OBSERVATION });
    const response = await PATCH(
      new Request("https://example.test", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ revision: 1, price_amount: "13.00" }),
      }),
      PARAMS,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ observation: OBSERVATION });
  });
});
