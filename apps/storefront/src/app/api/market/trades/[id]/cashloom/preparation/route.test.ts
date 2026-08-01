import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  authorizeCashloomPaymentPreparationBuyer,
  getCashloomPaymentPreparationView,
  isCashloomPaymentPreparationMigrationMissing,
  recordCashloomPaymentPreparation,
} from "@/lib/cashloom/preparation-db";
import { resolveCashloomPaymentPreparationMode } from "@/lib/cashloom/preparation-mode";
import { GET, POST } from "./route";

const authMocks = vi.hoisted(() => ({ auth: vi.fn() }));

vi.mock("@/lib/auth", () => ({ auth: authMocks.auth }));
vi.mock("@/lib/cashloom/preparation-db", () => ({
  authorizeCashloomPaymentPreparationBuyer: vi.fn(),
  getCashloomPaymentPreparationView: vi.fn(),
  isCashloomPaymentPreparationMigrationMissing: vi.fn(),
  recordCashloomPaymentPreparation: vi.fn(),
}));
vi.mock("@/lib/cashloom/preparation-mode", () => ({
  resolveCashloomPaymentPreparationMode: vi.fn(),
}));

const TRADE_ID = "123e4567-e89b-42d3-a456-426614174001";
const SESSION = {
  user: { id: "123e4567-e89b-42d3-a456-426614174000", email: "buyer@example.test" },
  expires: "2099-01-01T00:00:00.000Z",
};
const HANDOFF_ID = `sha256:${"a".repeat(64)}`;
const TERMS_HASH = `sha256:${"b".repeat(64)}`;
const BODY = {
  action: "record_preparation",
  handoff_id: HANDOFF_ID,
  terms_hash: TERMS_HASH,
  expected_trade_state: "awaiting_payment",
  expected_preparation_state: "none",
  disclosure_notice_version: "cashloom-preparation-retention-v1",
  idempotency_key: "123e4567-e89b-42d3-a456-426614174000",
};
const RECEIPT = {
  schema: "cambridgetcg.cashloom-payment-preparation/v1" as const,
  preparation_id: `sha256:${"c".repeat(64)}`,
  handoff_id: HANDOFF_ID,
  terms_hash: TERMS_HASH,
  state: "prepared" as const,
  actor_role: "buyer" as const,
  authority: "cambridge_database_session" as const,
  disclosure_notice_version: "cashloom-preparation-retention-v1" as const,
  created_at: "2026-08-01T12:00:00.000Z",
  effects: {
    moves_money: false as const,
    selects_settlement_rail: false as const,
    changes_trade_state: false as const,
    unlocks_shipping: false as const,
    changes_payout: false as const,
  },
  nonclaims: {
    is_cashloom_v2_record: false as const,
    is_payment_or_acceptance: false as const,
    proves_cashloom_key_control: false as const,
    creates_escrow: false as const,
    observes_settlement: false as const,
  },
};

function context(id = TRADE_ID) {
  return { params: Promise.resolve({ id }) };
}

function request(body: unknown = BODY) {
  return new Request(`https://example.test/api/market/trades/${TRADE_ID}/cashloom/preparation`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  authMocks.auth.mockResolvedValue(SESSION);
  vi.mocked(authorizeCashloomPaymentPreparationBuyer).mockResolvedValue({ ok: true });
  vi.mocked(resolveCashloomPaymentPreparationMode).mockReturnValue("record_only");
  vi.mocked(isCashloomPaymentPreparationMigrationMissing).mockReturnValue(false);
});

describe("/api/market/trades/[id]/cashloom/preparation", () => {
  it("requires authentication with a private no-store response", async () => {
    authMocks.auth.mockResolvedValueOnce(null);
    const response = await GET(new Request("https://example.test"), context());
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(getCashloomPaymentPreparationView).not.toHaveBeenCalled();
  });

  it("reads participant-only receipts even when new writes are disabled", async () => {
    vi.mocked(resolveCashloomPaymentPreparationMode).mockReturnValueOnce("disabled");
    vi.mocked(getCashloomPaymentPreparationView).mockResolvedValueOnce({
      ok: true,
      value: {
        preparation: RECEIPT,
        role: "seller",
        can_record_preparation: false,
        unavailable_reason: "preparation_already_recorded",
      },
    });
    const response = await GET(new Request("https://example.test"), context());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ preparation: RECEIPT, mode: "disabled" });
  });

  it("describes outsider reads as participant-only without implying seller exclusion", async () => {
    vi.mocked(getCashloomPaymentPreparationView).mockResolvedValueOnce({
      ok: false,
      reason: "forbidden",
    });
    const response = await GET(new Request("https://example.test"), context());
    expect(response.status).toBe(403);
    expect((await response.json()).error.message).toBe(
      "Only trade participants can read preparation for this trade.",
    );
  });

  it("authorizes the buyer before reading request-body bytes", async () => {
    vi.mocked(authorizeCashloomPaymentPreparationBuyer).mockResolvedValueOnce({
      ok: false,
      reason: "forbidden",
    });
    const unreadRequest = {
      headers: new Headers({ "content-type": "application/json" }),
      get body(): never {
        throw new Error("body must not be read before authorization");
      },
    } as unknown as Request;
    const response = await POST(unreadRequest, context());
    expect(response.status).toBe(403);
    expect(recordCashloomPaymentPreparation).not.toHaveBeenCalled();
  });

  it("fails closed on a disabled writer before reading request-body bytes", async () => {
    vi.mocked(resolveCashloomPaymentPreparationMode).mockReturnValueOnce("disabled");
    const unreadRequest = {
      headers: new Headers({ "content-type": "application/json" }),
      get body(): never {
        throw new Error("disabled writer must not read body");
      },
    } as unknown as Request;
    const response = await POST(unreadRequest, context());
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("CASHLOOM_PREPARATION_DISABLED");
  });

  it("rejects authority injection and unknown body fields", async () => {
    const response = await POST(request({ ...BODY, prepared_by: SESSION.user.id }), context());
    expect(response.status).toBe(422);
    expect(recordCashloomPaymentPreparation).not.toHaveBeenCalled();
  });

  it("returns the immutable stored receipt without outbound calls", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    vi.mocked(recordCashloomPaymentPreparation).mockResolvedValueOnce({
      ok: true,
      value: RECEIPT,
      reused: true,
    });
    const response = await POST(request(), context());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({
      preparation: RECEIPT,
      role: "buyer",
      mode: "record_only",
      reused: true,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("maps changed bytes under one retry key to an explicit conflict", async () => {
    vi.mocked(recordCashloomPaymentPreparation).mockResolvedValueOnce({
      ok: false,
      reason: "idempotency_conflict",
    });
    const response = await POST(request(), context());
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("CASHLOOM_IDEMPOTENCY_CONFLICT");
  });

  it("fails closed when migration 0128 is absent", async () => {
    const missing = Object.assign(new Error("missing"), { code: "42P01" });
    vi.mocked(getCashloomPaymentPreparationView).mockRejectedValueOnce(missing);
    vi.mocked(isCashloomPaymentPreparationMigrationMissing).mockReturnValueOnce(true);
    const response = await GET(new Request("https://example.test"), context());
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("CASHLOOM_PREPARATION_UNAVAILABLE");
  });
});
