import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WalletLinkError } from "@/lib/wallets/errors";
import { WALLET_LINK_MAX_REQUEST_BYTES } from "@/lib/wallets/http";
import { WALLET_PROOF_SCOPE } from "@/lib/wallets/types";
import { GET } from "./route";
import { POST as issueChallenge } from "./challenge/route";
import { POST as verifyChallenge } from "./verify/route";
import { DELETE as revokeWallet } from "./[id]/route";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  list: vi.fn(),
  issue: vi.fn(),
  verify: vi.fn(),
  revoke: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/wallets/db", () => ({
  isWalletStorageUnavailable: (error: unknown) =>
    typeof error === "object" &&
    error !== null &&
    ["42P01", "42703"].includes((error as { code?: string }).code ?? ""),
}));
vi.mock("@/lib/wallets/service", () => ({
  issueParticipantWalletChallenge: mocks.issue,
  listParticipantWalletLinks: mocks.list,
  revokeParticipantWalletLink: mocks.revoke,
  verifyParticipantWalletChallenge: mocks.verify,
}));

const ORIGIN = "https://cambridgetcg.com";
const USER_ID = "123e4567-e89b-42d3-a456-426614174099";
const WALLET_ID = "123e4567-e89b-42d3-a456-426614174002";
const CHALLENGE_ID = "123e4567-e89b-42d3-a456-426614174001";
const ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

const wallet = {
  id: WALLET_ID,
  address: ADDRESS,
  chain: "eip155:84532" as const,
  chain_id: 84_532 as const,
  proof_kind: "eoa" as const,
  verification_method: "viem_eoa_local" as const,
  linked_at: "2026-08-23T12:00:00.000Z",
  last_verified_at: "2026-08-23T12:00:00.000Z",
};

const challenge = {
  id: CHALLENGE_ID,
  message: "exact EIP-4361 message",
  address: ADDRESS,
  chain: "eip155:84532" as const,
  chain_id: 84_532 as const,
  domain: "cambridgetcg.com",
  origin: ORIGIN,
  issued_at: "2026-08-23T12:00:00.000Z",
  expires_at: "2026-08-23T12:05:00.000Z",
  statement: "proof of control, not identity",
  proof_scope: WALLET_PROOF_SCOPE,
};

function mutationRequest(path: string, body?: unknown): Request {
  return new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: "__Secure-authjs.session-token=test-session",
      origin: ORIGIN,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("EVM_WALLET_LINKING_MODE", "testnet");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", ORIGIN);
  mocks.auth.mockResolvedValue({
    user: { id: USER_ID, email: "participant@example.test" },
    expires: "2099-01-01T00:00:00.000Z",
  });
  mocks.list.mockResolvedValue([wallet]);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("participant wallet API contract", () => {
  it("requires a participant and makes even errors private and non-cacheable", async () => {
    mocks.auth.mockResolvedValueOnce(null);
    const response = await GET();
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("vary")).toBe("Cookie");
    expect(await response.json()).toEqual({
      error: { code: "SIGN_IN_REQUIRED", message: "Sign in required." },
    });
  });

  it("reports disabled creation while retaining reads and revocation", async () => {
    vi.stubEnv("EVM_WALLET_LINKING_MODE", "disabled");
    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(body.wallets).toEqual([wallet]);
    expect(body.availability).toMatchObject({
      mode: "disabled",
      writes_available: false,
      revocation_available: true,
      reason: "feature_disabled",
      storage_ready: true,
      custody: "none",
      assets_accepted: false,
      network: { caip2: "eip155:84532", chain_id: 84_532, testnet: true },
    });
    expect(body.availability.proof_scope.proves).toEqual([
      expect.stringContaining("Control"),
    ]);
    expect(body.availability.proof_scope.does_not_prove).toEqual(
      expect.arrayContaining([
        expect.stringContaining("identity"),
        expect.stringContaining("KYC"),
        expect.stringContaining("funds"),
      ]),
    );
  });

  it("marks storage unavailable instead of claiming an empty verified wallet set", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    mocks.list.mockRejectedValueOnce(
      Object.assign(new Error("missing"), { code: "42P01" }),
    );
    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      availability: {
        writes_available: false,
        revocation_available: false,
        storage_ready: false,
        reason: "storage_unavailable",
      },
      wallets: [],
    });
    expect(consoleError).toHaveBeenCalledOnce();
  });

  it("publishes RPC identity and privacy terms without exposing the configured endpoint", async () => {
    vi.stubEnv("BASE_SEPOLIA_RPC_URL", "https://rpc.example.test/base-sepolia?key=private");
    vi.stubEnv("BASE_SEPOLIA_RPC_PROVIDER_NAME", "Example RPC");
    vi.stubEnv("BASE_SEPOLIA_RPC_PRIVACY_URL", "https://provider.example/privacy");

    const response = await GET();
    const body = await response.json();
    expect(body.availability.remote_verification).toEqual({
      available: true,
      provider: {
        name: "Example RPC",
        privacy_url: "https://provider.example/privacy",
        external: true,
      },
    });
    expect(JSON.stringify(body)).not.toContain("rpc.example.test");
    expect(JSON.stringify(body)).not.toContain("key=private");
  });

  it("issues the exact signing payload and preserves the 429 cap error", async () => {
    mocks.issue.mockResolvedValueOnce(challenge);
    const request = mutationRequest("/api/account/wallets/challenge", {
      address: ADDRESS.toLowerCase(),
      chain: "eip155:84532",
      chain_id: 84_532,
    });
    const response = await issueChallenge(request);
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ challenge });
    expect(mocks.issue).toHaveBeenCalledWith({
      user_id: USER_ID,
      request,
      address: ADDRESS.toLowerCase(),
      chain: "eip155:84532",
      chain_id: 84_532,
    });

    mocks.issue.mockRejectedValueOnce(
      new WalletLinkError(
        "CHALLENGE_RATE_LIMITED",
        "Too many wallet-link challenges were requested. Try again later.",
        429,
      ),
    );
    const capped = await issueChallenge(
      mutationRequest("/api/account/wallets/challenge", {
        address: ADDRESS,
        chain: "eip155:84532",
      }),
    );
    expect(capped.status).toBe(429);
    expect((await capped.json()).error.code).toBe("CHALLENGE_RATE_LIMITED");
  });

  it("cancels an oversized chunked mutation before challenge issuance", async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode("x".repeat(WALLET_LINK_MAX_REQUEST_BYTES)),
        );
        controller.enqueue(new TextEncoder().encode("y"));
      },
      cancel() {
        cancelled = true;
      },
    });
    const request = new Request(`${ORIGIN}/api/account/wallets/challenge`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: "__Secure-authjs.session-token=test-session",
        origin: ORIGIN,
      },
      body: stream,
      duplex: "half",
    } as RequestInit & { duplex: "half" });

    expect(request.headers.get("content-length")).toBeNull();
    const response = await issueChallenge(request);
    expect(response.status).toBe(413);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect((await response.json()).error.code).toBe("REQUEST_TOO_LARGE");
    expect(cancelled).toBe(true);
    expect(mocks.issue).not.toHaveBeenCalled();
  });

  it("rejects a declared oversized verification body before JSON parsing", async () => {
    const request = new Request(`${ORIGIN}/api/account/wallets/verify`, {
      method: "POST",
      headers: {
        "content-length": String(WALLET_LINK_MAX_REQUEST_BYTES + 1),
        "content-type": "application/json",
        cookie: "__Secure-authjs.session-token=test-session",
        origin: ORIGIN,
      },
      body: "{}",
    });

    const response = await verifyChallenge(request);
    expect(response.status).toBe(413);
    expect((await response.json()).error.code).toBe("REQUEST_TOO_LARGE");
    expect(mocks.verify).not.toHaveBeenCalled();
  });

  it.each([
    { created: true, status: 201 },
    { created: false, status: 200 },
  ])(
    "returns the stable verification shape when created=$created",
    async ({ created, status }) => {
      mocks.verify.mockResolvedValueOnce({ created, wallet });
      const body = {
        challenge_id: CHALLENGE_ID,
        message: challenge.message,
        signature: `0x${"11".repeat(65)}`,
        address: ADDRESS,
        chain: "eip155:84532",
      };
      const response = await verifyChallenge(
        mutationRequest("/api/account/wallets/verify", body),
      );
      expect(response.status).toBe(status);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(await response.json()).toEqual({
        linked: true,
        created,
        wallet,
        proof_scope: WALLET_PROOF_SCOPE,
      });
    },
  );

  it("preserves a typed verification-attempt 429", async () => {
    mocks.verify.mockRejectedValueOnce(
      new WalletLinkError(
        "VERIFICATION_RATE_LIMITED",
        "Too many wallet verification attempts were made. Try again later.",
        429,
      ),
    );
    const response = await verifyChallenge(
      mutationRequest("/api/account/wallets/verify", {
        challenge_id: CHALLENGE_ID,
        message: challenge.message,
        signature: `0x${"11".repeat(65)}`,
        address: ADDRESS,
        chain: "eip155:84532",
      }),
    );
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({
      error: {
        code: "VERIFICATION_RATE_LIMITED",
        message:
          "Too many wallet verification attempts were made. Try again later.",
      },
    });
  });

  it("revokes only the participant-scoped id through a private response", async () => {
    mocks.revoke.mockResolvedValueOnce({
      revoked: true,
      already_revoked: false,
      wallet_id: WALLET_ID,
    });
    const request = mutationRequest(`/api/account/wallets/${WALLET_ID}`);
    const response = await revokeWallet(request, {
      params: Promise.resolve({ id: WALLET_ID }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({
      revoked: true,
      already_revoked: false,
      wallet_id: WALLET_ID,
    });
    expect(mocks.revoke).toHaveBeenCalledWith({
      user_id: USER_ID,
      request,
      wallet_id: WALLET_ID,
    });
  });

  it("does not let disabled issuance trap an existing wallet link", async () => {
    vi.stubEnv("EVM_WALLET_LINKING_MODE", "disabled");
    mocks.revoke.mockResolvedValueOnce({
      revoked: true,
      already_revoked: false,
      wallet_id: WALLET_ID,
    });
    const request = mutationRequest(`/api/account/wallets/${WALLET_ID}`);

    const response = await revokeWallet(request, {
      params: Promise.resolve({ id: WALLET_ID }),
    });

    expect(response.status).toBe(200);
    expect(mocks.revoke).toHaveBeenCalledWith({
      user_id: USER_ID,
      request,
      wallet_id: WALLET_ID,
    });
  });
});
