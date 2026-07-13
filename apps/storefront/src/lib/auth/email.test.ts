import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  reserve: vi.fn(),
  sendMail: vi.fn(),
}));

vi.mock("./adapter", () => ({
  reserveMagicLinkForDelivery: mocks.reserve,
}));
vi.mock("@cambridge-tcg/email", () => ({
  sendMail: mocks.sendMail,
}));

import { sendVerificationRequest } from "./email";

const params = {
  identifier: "collector@example.com",
  token: "raw-token",
  expires: new Date("2026-07-13T12:00:00.000Z"),
  url: "https://cambridgetcg.com/api/auth/callback/email?token=raw-token",
  provider: { secret: "test-auth-secret" },
};

beforeEach(() => {
  mocks.reserve.mockReset();
  mocks.sendMail.mockReset();
});

describe("magic-link delivery reservation", () => {
  it("does not call the email transport until the durable reservation succeeds", async () => {
    let admit!: () => void;
    mocks.reserve.mockImplementationOnce(
      () => new Promise<void>((resolve) => { admit = resolve; }),
    );
    mocks.sendMail.mockResolvedValue({ ok: true, transport: "test" });

    const sending = sendVerificationRequest(params);
    await vi.waitFor(() => expect(mocks.reserve).toHaveBeenCalledTimes(1));
    expect(mocks.sendMail).not.toHaveBeenCalled();

    admit();
    await sending;

    expect(mocks.reserve).toHaveBeenCalledWith({
      identifier: params.identifier,
      rawToken: params.token,
      expires: params.expires,
      secret: "test-auth-secret",
    });
    expect(mocks.sendMail).toHaveBeenCalledTimes(1);
  });

  it("fails closed before email delivery when the durable cap rejects the token", async () => {
    mocks.reserve.mockRejectedValue(new Error("Magic-link issuance safety limit reached"));

    await expect(sendVerificationRequest(params)).rejects.toThrow(
      "Magic-link issuance safety limit reached",
    );
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it("does not expose recipient-bearing provider errors through Auth.js", async () => {
    mocks.reserve.mockResolvedValue(undefined);
    mocks.sendMail.mockResolvedValue({
      ok: false,
      transport: "test",
      error: "recipient collector@example.com rejected",
    });

    await expect(sendVerificationRequest(params)).rejects.toThrow(
      /^Magic-link send failed$/,
    );
  });

  it("fails closed before reservation or delivery when the hashing secret is absent", async () => {
    await expect(sendVerificationRequest({ ...params, provider: {} })).rejects.toThrow(
      "Magic-link token secret is unavailable",
    );
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });
});
