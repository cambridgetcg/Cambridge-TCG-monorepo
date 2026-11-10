import { describe, expect, it } from "vitest";
import { BINDING_JWK_ERRORS, checkBindingJwk } from "@/lib/agents/signed-act-verify";
import {
  isLiveSigningKey,
  pasteHoldsPrivateKey,
  PRIVATE_KEY_PASTE_ERROR,
  signingKeyCountsLabel,
} from "./signing-key-ui";

// A public x of the right shape; no private half exists in this file.
const X = "aB".repeat(21) + "c";

describe("pasteHoldsPrivateKey", () => {
  it.each([
    [`{"kty":"OKP","crv":"Ed25519","x":"${X}","d":"${X}"}`],
    [`{ "d" : "${X}", "kty": "OKP" }`],
    // Not JSON, but spells out a d member.
    [`kty: OKP, 'd': ${X}`],
    [`{"kty":"OKP","crv":"Ed25519","x":"${X}","d":"${X}",}`],
    ["-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VwBCIEI...\n-----END PRIVATE KEY-----"],
    ["-----BEGIN OPENSSH PRIVATE KEY-----"],
  ])("refuses %j before it is sent", (paste) => {
    expect(pasteHoldsPrivateKey(paste)).toBe(true);
  });

  it.each([
    [`{"kty":"OKP","crv":"Ed25519","x":"${X}"}`],
    [`{"kty":"OKP","crv":"Ed25519","x":"${X}","kid":"laptop"}`],
    ["not json at all"],
    [""],
  ])("lets %j through to the server's checks", (paste) => {
    expect(pasteHoldsPrivateKey(paste)).toBe(false);
  });

  it("tells the operator what the server would, word for word", () => {
    expect(PRIVATE_KEY_PASTE_ERROR).toBe(BINDING_JWK_ERRORS["private key"]);
    // And the server refuses the same paste for the same reason.
    const paste = `{"kty":"OKP","crv":"Ed25519","x":"${X}","d":"${X}"}`;
    expect(checkBindingJwk(paste)).toMatchObject({ ok: false, refusal: "private key" });
  });
});

describe("signing key states", () => {
  it("counts confirmed, pending and ended keys, and only the first two are live", () => {
    const keys = [
      { state: "confirmed" as const },
      { state: "pending" as const },
      { state: "removed" as const },
      { state: "retired" as const },
      { state: "expired" as const },
      { state: "lapsed" as const },
    ];
    expect(signingKeyCountsLabel(keys)).toBe("1 confirmed, 1 pending, 4 ended");
    expect(signingKeyCountsLabel([])).toBe("none");
    expect(keys.filter(isLiveSigningKey).map((key) => key.state)).toEqual(["confirmed", "pending"]);
  });
});
