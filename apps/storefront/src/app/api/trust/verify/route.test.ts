import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  isAdmin: vi.fn(),
  get: vi.fn(),
  submit: vi.fn(),
  listPending: vi.fn(),
  listAll: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/admin/auth", () => ({ isAdmin: mocks.isAdmin }));
vi.mock("@/lib/trust/db", () => ({
  submitVerification: mocks.submit,
  getVerification: mocks.get,
  listPendingVerifications: mocks.listPending,
  listAllVerifications: mocks.listAll,
  approveVerification: vi.fn(),
  rejectVerification: vi.fn(),
}));
vi.mock("@/lib/notifications/db", () => ({ notify: vi.fn() }));

const USER_ID = "123e4567-e89b-42d3-a456-426614174099";

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("IDENTITY_VERIFICATION_MODE", "reviewed-private-storage");
  vi.stubEnv("VERIFICATION_S3_BUCKET", "private-verification-bucket");
  mocks.auth.mockResolvedValue({ user: { id: USER_ID } });
  mocks.get.mockResolvedValue({
    user_id: USER_ID,
    full_legal_name: "Participant Name",
    date_of_birth: "1990-01-01",
    address_line1: "Private address",
    bank_account_number: null,
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("identity-verification response privacy", () => {
  it("makes participant identity data private and non-cacheable", async () => {
    const response = await GET(new Request("https://cambridgetcg.com/api/trust/verify"));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("pragma")).toBe("no-cache");
    expect(response.headers.get("vary")).toBe("Cookie");
    expect((await response.json()).verification.full_legal_name).toBe("Participant Name");
  });

  it("makes authentication failures private and non-cacheable too", async () => {
    mocks.auth.mockResolvedValueOnce(null);
    const response = await GET(new Request("https://cambridgetcg.com/api/trust/verify"));

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("does not accept raw bank coordinates in the optional identity flow", async () => {
    const response = await POST(new Request("https://cambridgetcg.com/api/trust/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fullLegalName: "Participant Name",
        dateOfBirth: "1990-01-01",
        addressLine1: "Private address",
        city: "Cambridge",
        postcode: "CB2 1TN",
        bankAccountNumber: "12345678",
      }),
    }));

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect((await response.json()).fields.bankAccountNumber).toContain("not accepted");
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("fails new identity collection closed when storage review is not enabled", async () => {
    vi.stubEnv("IDENTITY_VERIFICATION_MODE", "disabled");
    const response = await POST(new Request("https://cambridgetcg.com/api/trust/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    }));

    expect(response.status).toBe(503);
    expect((await response.json()).error).toContain("paused");
    expect(mocks.submit).not.toHaveBeenCalled();
  });
});
