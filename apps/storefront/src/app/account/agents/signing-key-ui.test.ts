import { generateKeyPairSync } from "node:crypto";
import { inspect } from "node:util";
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
// PEM armour built at run time, so the tracked-secret audit's pattern for a
// private key block never matches this file; there is no key inside.
const armour = (kind: string) => ["-----BEGIN", `${kind}-----`].join(" ");

describe("pasteHoldsPrivateKey", () => {
  it.each([
    [`{"kty":"OKP","crv":"Ed25519","x":"${X}","d":"${X}"}`],
    [`{ "d" : "${X}", "kty": "OKP" }`],
    // Not JSON, but spells out a d member.
    [`kty: OKP, 'd': ${X}`],
    [`{"kty":"OKP","crv":"Ed25519","x":"${X}","d":"${X}",}`],
    [`${armour("PRIVATE KEY")}\n(no key here)`],
    [armour("OPENSSH PRIVATE KEY")],
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

  it("agrees with the server on every paste: the browser refuses exactly what the server refuses as a private key", () => {
    const corpus = [
      `{"kty":"OKP","crv":"Ed25519","x":"${X}"}`,
      `{"kty":"OKP","crv":"Ed25519","x":"${X}","d":"${X}"}`,
      `{"kty":"OKP","crv":"Ed25519","x":"${X}","d":"${X}",}`,
      `{"kty":"OKP","crv":"Ed25519","x":"${X}","x":"${X}","d":"${X}"}`,
      `{"keys":[{"kty":"OKP","crv":"Ed25519","x":"${X}","d":"${X}"}]}`,
      `{"kty":"OKP","crv":"Ed25519","x":"${X}","\\u0064":"${X}"}`,
      `{'d': '${X}'}`,
      `{d: "${X}"}`,
      `d: ${X}`,
      `{"kty":"OKP","crv":"Ed25519","x":"${X}","d":"${X}","pad":"${"a".repeat(3000)}"}`,
      `${armour("PRIVATE KEY")}\n(no key here)`,
      armour("EC PRIVATE KEY"),
      `{"kty":"OKP","crv":"Ed25519","x":"${X}","kid":"used: laptop"}`,
      "not json at all",
      "",
    ];
    for (const paste of corpus) {
      expect(pasteHoldsPrivateKey(paste), paste.slice(0, 60)).toBe(checkBindingJwk(paste).ok === false && (checkBindingJwk(paste) as { refusal: string }).refusal === "private key");
    }
    expect(corpus.filter(pasteHoldsPrivateKey)).toHaveLength(11);
  });

  it("catches the third review's spellings of a real private key, in the browser and on the server alike", () => {
    // A fresh key pair, made here and dropped: its private half is never
    // printed (failure messages name the case, not the paste).
    const { privateKey } = generateKeyPairSync("ed25519");
    const jwk = privateKey.export({ format: "jwk" }) as { kty: string; crv: string; x: string; d: string };
    const cases: Record<string, string> = {
      "Node's console.log of the JWK": inspect(jwk),
      "an object literal with unquoted names": `{kty:"OKP",crv:"Ed25519",x:"${jwk.x}",d:"${jwk.d}"}`,
      "an unquoted d: alone": `d: ${jwk.d}`,
      YAML: `kty: OKP\ncrv: Ed25519\nx: ${jwk.x}\nd: ${jwk.d}`,
      "PKCS#8 DER in base64, without armour": privateKey.export({ type: "pkcs8", format: "der" }).toString("base64"),
      "PKCS#8 DER in base64, wrapped and indented": `  ${privateKey.export({ type: "pkcs8", format: "der" }).toString("base64")}\n`,
      'an escaped "d" with a trailing comma': `{"kty":"OKP","crv":"Ed25519","x":"${jwk.x}","\\u0064":"${jwk.d}",}`,
      "plain JSON": JSON.stringify(jwk),
      PEM: String(privateKey.export({ type: "pkcs8", format: "pem" })),
    };
    for (const [name, paste] of Object.entries(cases)) {
      expect(pasteHoldsPrivateKey(paste), name).toBe(true);
      const server = checkBindingJwk(paste);
      expect(server.ok === false && server.refusal, name).toBe("private key");
      expect(JSON.stringify(server).includes(jwk.d), name).toBe(false);
    }
    // The public half alone, as the signer prints it, still goes through.
    const { d: _d, ...publicJwk } = jwk;
    expect(pasteHoldsPrivateKey(JSON.stringify(publicJwk))).toBe(false);
    expect(checkBindingJwk(JSON.stringify(publicJwk))).toMatchObject({ ok: true });
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
