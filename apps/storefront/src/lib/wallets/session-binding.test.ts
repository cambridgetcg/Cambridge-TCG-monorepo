import { describe, expect, it } from "vitest";
import { WalletLinkError } from "./errors";
import { assertCanonicalOrigin, sessionBindingDigest } from "./session-binding";

const config = {
  enabled: true,
  mode: "testnet" as const,
  origin: "https://cambridgetcg.com",
  domain: "cambridgetcg.com",
  scheme: "https",
  rpc_url: undefined,
  rpc_provider: null,
  origin_configuration_error: null,
  rpc_configuration_error: null,
  configuration_error: null,
};

function request(cookie: string, origin = config.origin) {
  return new Request("https://cambridgetcg.com/api/account/wallets/challenge", {
    method: "POST",
    headers: { cookie, origin },
  });
}

describe("wallet challenge session binding", () => {
  it("digests rather than exposes the exact Auth.js session cookie", () => {
    const first = sessionBindingDigest(
      request("__Secure-authjs.session-token=secret-one"),
    );
    const same = sessionBindingDigest(
      request("__Secure-authjs.session-token=secret-one"),
    );
    const other = sessionBindingDigest(
      request("__Secure-authjs.session-token=secret-two"),
    );
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(first).toBe(same);
    expect(first).not.toBe(other);
    expect(first).not.toContain("secret-one");
  });

  it("rejects absent or ambiguous authenticated-session cookies", () => {
    expect(() => sessionBindingDigest(request("theme=gallery"))).toThrowError(
      expect.objectContaining({ code: "SESSION_BINDING_UNAVAILABLE" }),
    );
    expect(() =>
      sessionBindingDigest(
        request("__Secure-authjs.session-token=one; authjs.session-token=two"),
      ),
    ).toThrowError(
      expect.objectContaining({ code: "SESSION_BINDING_UNAVAILABLE" }),
    );
    expect(() =>
      sessionBindingDigest(
        request("authjs.session-token=one; authjs.session-token=two"),
      ),
    ).toThrowError(
      expect.objectContaining({ code: "SESSION_BINDING_UNAVAILABLE" }),
    );
  });

  it("requires the canonical configured origin", () => {
    expect(() =>
      assertCanonicalOrigin(request("authjs.session-token=one"), config),
    ).not.toThrow();
    expect(() =>
      assertCanonicalOrigin(
        request("authjs.session-token=one", "https://attacker.example"),
        config,
      ),
    ).toThrowError(
      expect.objectContaining<Partial<WalletLinkError>>({
        code: "ORIGIN_MISMATCH",
      }),
    );
    expect(() =>
      assertCanonicalOrigin(
        request("authjs.session-token=one", "https://cambridgetcg.com/path"),
        config,
      ),
    ).toThrowError(expect.objectContaining({ code: "ORIGIN_MISMATCH" }));
  });
});
