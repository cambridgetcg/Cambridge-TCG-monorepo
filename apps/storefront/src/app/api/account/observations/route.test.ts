import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createCollectorObservation,
  isCollectorObservationsTableMissing,
  listCollectorObservations,
} from "@/lib/collector-observations/db";
import { GET, POST } from "./route";

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
  createCollectorObservation: vi.fn(),
  isCollectorObservationsTableMissing: vi.fn(),
  listCollectorObservations: vi.fn(),
}));

const mockAuth = authMocks.auth;
const mockCreate = vi.mocked(createCollectorObservation);
const mockIsMissing = vi.mocked(isCollectorObservationsTableMissing);
const mockList = vi.mocked(listCollectorObservations);

const SESSION = {
  user: { id: "123e4567-e89b-42d3-a456-426614174099", email: "owner@example.test" },
  expires: "2099-01-01T00:00:00.000Z",
};

const OBSERVATION = {
  id: "123e4567-e89b-42d3-a456-426614174001",
  submission_key: "123e4567-e89b-42d3-a456-426614174000",
  sku: "op-op01-001-ja",
  observation_kind: "purchase" as const,
  condition: "NM" as const,
  price_amount: "12.30",
  price_currency: "GBP" as const,
  observed_on: "2026-07-11",
  first_party_attested: true as const,
  first_party_attested_at: "2026-07-12T10:00:00.000Z",
  sharing_mode: "private" as const,
  sharing_terms_version: "collector-witness-v1",
  sharing_changed_at: "2026-07-12T10:00:00.000Z",
  cc0_acknowledged_at: null,
  evidence_sha256: null,
  revision: 1,
  created_at: "2026-07-12T10:00:00.000Z",
  updated_at: "2026-07-12T10:00:00.000Z",
};

beforeEach(() => {
  vi.resetAllMocks();
  mockAuth.mockResolvedValue(SESSION);
  mockIsMissing.mockImplementation((error) =>
    typeof error === "object" && error !== null && (error as { code?: string }).code === "42P01"
  );
});

describe("/api/account/observations", () => {
  it("requires a session and applies private no-store to the error", async () => {
    mockAuth.mockResolvedValueOnce(null);
    const response = await GET(new Request("https://example.test/api/account/observations"));
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect((await response.json()).error.code).toBe("SIGN_IN_REQUIRED");
  });

  it("normalizes and passes the exact SKU filter", async () => {
    mockList.mockResolvedValueOnce([OBSERVATION]);
    const response = await GET(
      new Request("https://example.test/api/account/observations?sku=OP-OP01-001-JP&limit=20"),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mockList).toHaveBeenCalledWith(SESSION.user.id, {
      limit: 20,
      sku: "op-op01-001-ja",
    });
    expect(await response.json()).toEqual({ observations: [OBSERVATION] });
  });

  it("returns the simple create shape and records only first-party input", async () => {
    mockCreate.mockResolvedValueOnce({ observation: OBSERVATION, created: true });
    const response = await POST(
      new Request("https://example.test/api/account/observations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          submission_key: OBSERVATION.submission_key,
          sku: OBSERVATION.sku,
          observation_kind: "purchase",
          condition: "NM",
          price_amount: "12.30",
          price_currency: "GBP",
          observed_on: "2026-07-11",
          first_party_attested: true,
        }),
      }),
    );
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ observation: OBSERVATION, created: true });
  });

  it("returns a typed 503 when the migration is not ready", async () => {
    mockList.mockRejectedValueOnce(Object.assign(new Error("missing"), { code: "42P01" }));
    const response = await GET(new Request("https://example.test/api/account/observations"));
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect((await response.json()).error.code).toBe("COLLECTOR_OBSERVATIONS_UNAVAILABLE");
  });
});
