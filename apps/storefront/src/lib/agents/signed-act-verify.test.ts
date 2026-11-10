import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { ed25519 } from "@noble/curves/ed25519.js";
import {
  BINDING_JWK_ERRORS,
  checkBindingJwk,
  checkPoint,
  decodeStrictBase64url,
  DUMMY_VERIFICATION_KEY,
  DUMMY_VERIFICATION_SEED_TEXT,
  ed25519Thumbprint,
  parseSignedAct,
  PUBLISHED_TEST_KEYS_HEX,
  rRuleHolds,
  SIGNED_ACT_MAX_LENGTH,
  staleByAppClock,
  verifyActSignature,
} from "./signed-act-verify";

// Held keys' verifier (docs/plans/agent-auth/held-keys.md, build step 2):
// RFC 8032 and RFC 8037 vectors, the eight small-order points, torsion in
// R, R = identity, a mixed-order key, non-canonical encodings, padding,
// trailing bits, duplicate names and the 8 KiB edge. Every vector this
// verifier accepts is also passed through Node's own crypto.verify. Keys
// here are generated in the test or are the RFCs' published test keys.

const AUD = "https://cambridgetcg.com";
const Point = ed25519.Point;
const L = Point.Fn.ORDER;
const hex = (value: string) => new Uint8Array(Buffer.from(value, "hex"));
const b64u = (bytes: Uint8Array | string) => Buffer.from(bytes).toString("base64url");
const le = (bytes: Uint8Array) => bytes.reduceRight((n, x) => (n << BigInt(8)) | BigInt(x), BigInt(0));
const le32 = (n: bigint) => Uint8Array.from({ length: 32 }, (_, i) => Number((n >> BigInt(8 * i)) & BigInt(255)));
const sha512Scalar = (...parts: Uint8Array[]) =>
  le(new Uint8Array(crypto.createHash("sha512").update(Buffer.concat(parts)).digest())) % L;

/** Node's own verify, for the cross-check: OpenSSL underneath. */
function nodeVerify(signature: Uint8Array, message: Uint8Array, publicKey: Uint8Array): boolean {
  const key = crypto.createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: b64u(publicKey) }, format: "jwk" });
  return crypto.verify(null, message, key, signature);
}

/** Accepted here, and by Node too: the page's cross-check. */
function expectAccepted(act: { signingInput: Uint8Array; signature: Uint8Array }, publicKey: Uint8Array) {
  expect(verifyActSignature(act, publicKey)).toBe(true);
  expect(nodeVerify(act.signature, act.signingInput, publicKey)).toBe(true);
}

function keyPair() {
  const secretKey = ed25519.utils.randomSecretKey();
  const publicKey = ed25519.getPublicKey(secretKey);
  const x = b64u(publicKey);
  return { secretKey, publicKey, x, kid: ed25519Thumbprint(x) };
}

const nowSeconds = () => Math.floor(Date.now() / 1000);

function payloadFor(overrides: Record<string, unknown> = {}) {
  const iat = nowSeconds();
  return {
    aud: AUD,
    act: "signer.check",
    sub: "6f1c2a90-3b7e-4d21-9a55-0c8e4b7d2f13",
    iat,
    exp: iat + 120,
    jti: b64u(crypto.randomBytes(16)),
    params: {},
    ...overrides,
  };
}

/** A compact JWS over the given JSON texts (or objects), signed with `secretKey`. */
function sign(header: unknown, payload: unknown, secretKey: Uint8Array): string {
  const h = b64u(typeof header === "string" ? header : JSON.stringify(header));
  const p = b64u(typeof payload === "string" ? payload : JSON.stringify(payload));
  const signature = ed25519.sign(Buffer.from(`${h}.${p}`, "ascii"), secretKey);
  return `${h}.${p}.${b64u(signature)}`;
}

function detail(input: unknown, audience = AUD) {
  const parsed = parseSignedAct(input, audience);
  return parsed.ok ? "ok" : parsed.detail;
}

// RFC 8037 Appendix A.1 to A.4: the published test key and its signature.
const RFC8037_X = "11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo";
const RFC8037_KID = "kPrK_qmxVWaYVA9wwBF6Iuo3vVzz7TxHCTwXBygrS4k";
const RFC8037_A4 =
  "eyJhbGciOiJFZERTQSJ9.RXhhbXBsZSBvZiBFZDI1NTE5IHNpZ25pbmc." +
  "hgyY0il_MGCjP0JzlnLWG1PPOt7-09PGcvMg3AIbQR6dWbhijcNR4ki4iylGjg5BhVsPt9g7sVvpAr_MuM0KAg";

// The worked example on the design page, signed with the RFC 8037 test key.
const WORKED_EXAMPLE =
  "eyJhbGciOiJFZDI1NTE5IiwidHlwIjoiY3RjZy1hY3QudjEiLCJraWQiOiJrUHJLX3FteFZXYVlWQTl3d0JGNkl1bzN2Vnp6N1R4SENUd1hCeWdyUzRrIn0." +
  "eyJhdWQiOiJodHRwczovL2NhbWJyaWRnZXRjZy5jb20iLCJhY3QiOiJzaWduZXIuY2hlY2siLCJzdWIiOiI2ZjFjMmE5MC0zYjdlLTRkMjEtOWE1NS0wYzhlNGI3ZDJmMTMiLCJpYXQiOjE3OTQzMTIwMDAsImV4cCI6MTc5NDMxMjEyMCwianRpIjoiUW05dmF5MWxlR0Z0Y0d4bExXcDBhUSIsInBhcmFtcyI6e319." +
  "cIi5jB96ttAOLUwroaqU5I-MWTpQ7Uj6dii7UMnfJHIumk1F6f8p7mq4OQGGwRQwJ2jDX1YnlK7FTOdlnudSCw";

// RFC 8032 §7.1: the published 32-byte private seed, public key, message and signature (hex).
const RFC8032 = [
  {
    name: "TEST 1",
    seed: "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60",
    public: "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a",
    message: "",
    signature: "e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b",
  },
  {
    name: "TEST 2",
    seed: "4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb",
    public: "3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c",
    message: "72",
    signature: "92a009a9f0d4cab8720e820b5f642540a2b27b5416503f8fb3762223ebdb69da085ac1e43e15996e458f3613d0f11d8c387b2eaeb4302aeeb00d291612bb0c00",
  },
  {
    name: "TEST 3",
    seed: "c5aa8df43f9f837bedb7442f31dcb7b166d38535076f094b85ce3a2e0b4458f7",
    public: "fc51cd8e6218a1a38da47ed00230f0580816ed13ba3303ac5deb911548908025",
    message: "af82",
    signature: "6291d657deec24024827e69c3abe01a30ce548a284743a445e3680d7db5ac3ac18ff9b538d16f290ae67f760984dc6594a7c15e9716ed28dc027beceea1ec40a",
  },
];
// TEST 1024 and TEST SHA(abc): keys only (their messages are long).
const RFC8032_MORE_SEEDS = [
  "f5e5767cf153319517630f226876b86c8160cc583bc013744c6bf255f5cc0ee5",
  "833fe62409237b9d62ec77587520911e9a759cec1d19755b7da901b96dca3d42",
];

// An order-8 point (the page's T8); its multiples are the eight small-order points.
const T8 = Point.fromBytes(hex("c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac037a"));
const SMALL_ORDER = Array.from({ length: 8 }, (_, i) => (i === 0 ? Point.ZERO : T8.multiplyUnsafe(BigInt(i))));

describe("RFC vectors", () => {
  it("recomputes RFC 8037 A.3's thumbprint", () => {
    expect(ed25519Thumbprint(RFC8037_X)).toBe(RFC8037_KID);
  });

  it("accepts RFC 8037 A.4's signature at the crypto level and refuses its header as an act", () => {
    const [h, p, s] = RFC8037_A4.split(".");
    const act = { signingInput: new Uint8Array(Buffer.from(`${h}.${p}`)), signature: decodeStrictBase64url(s)! };
    expectAccepted(act, decodeStrictBase64url(RFC8037_X)!);
    expect(detail(RFC8037_A4)).toBe("header members must be exactly alg, typ, kid");
  });

  it("parses and verifies the page's worked example, whose act_sha256 the page records", () => {
    const parsed = parseSignedAct(WORKED_EXAMPLE, AUD);
    if (!parsed.ok) throw new Error(parsed.detail);
    expect(WORKED_EXAMPLE).toHaveLength(443);
    expect(parsed.act.sha256).toBe("121480f96d57cfdb5d0c3046fa84642a21cf0292b974700e4f3bcf9aa24629d5");
    expect(parsed.act.header).toEqual({ alg: "Ed25519", typ: "ctcg-act.v1", kid: RFC8037_KID });
    expect(parsed.act.payload).toEqual({
      aud: AUD,
      act: "signer.check",
      sub: "6f1c2a90-3b7e-4d21-9a55-0c8e4b7d2f13",
      iat: 1794312000,
      exp: 1794312120,
      jti: "Qm9vay1leGFtcGxlLWp0aQ",
      params: {},
    });
    expect(rRuleHolds(parsed.act.signature)).toBe(true);
    expectAccepted(parsed.act, decodeStrictBase64url(RFC8037_X)!);
    // Another deployment's audience refuses it.
    expect(detail(WORKED_EXAMPLE, "https://preview.example")).toBe("aud is not this deployment's audience");
  });

  it.each(RFC8032)("accepts RFC 8032 $name and Node agrees", (vector) => {
    expect(b64u(ed25519.getPublicKey(hex(vector.seed)))).toBe(b64u(hex(vector.public)));
    expectAccepted({ signingInput: hex(vector.message), signature: hex(vector.signature) }, hex(vector.public));
    // One bit off anywhere is refused.
    const flipped = hex(vector.signature);
    flipped[40] ^= 1;
    expect(verifyActSignature({ signingInput: hex(vector.message), signature: flipped }, hex(vector.public))).toBe(false);
  });

  it("lists exactly the published test keys, derived from their published seeds", () => {
    const derived = [...RFC8032.map((v) => v.seed), ...RFC8032_MORE_SEEDS].map((seed) =>
      Buffer.from(ed25519.getPublicKey(hex(seed))).toString("hex"),
    );
    expect([...PUBLISHED_TEST_KEYS_HEX].sort()).toEqual(derived.sort());
    expect(Buffer.from(decodeStrictBase64url(RFC8037_X)!).toString("hex")).toBe(PUBLISHED_TEST_KEYS_HEX[0]);
  });
});

describe("honest keys", () => {
  it("accept 50 fresh keys' acts, each also accepted by Node", () => {
    for (let i = 0; i < 50; i += 1) {
      const { secretKey, publicKey, kid } = keyPair();
      const jws = sign({ alg: i % 2 ? "Ed25519" : "EdDSA", typ: "ctcg-act.v1", kid }, payloadFor(), secretKey);
      const parsed = parseSignedAct(jws, AUD);
      if (!parsed.ok) throw new Error(parsed.detail);
      expectAccepted(parsed.act, publicKey);
      // Another key, or another message, is refused.
      expect(verifyActSignature(parsed.act, keyPair().publicKey)).toBe(false);
      expect(verifyActSignature({ ...parsed.act, signingInput: new Uint8Array([...parsed.act.signingInput, 0x20]) }, publicKey)).toBe(false);
    }
  });
});

describe("the eight small-order points", () => {
  it("are eight distinct points, every one refused at binding and as R", () => {
    const encodings = SMALL_ORDER.map((p) => Buffer.from(p.toBytes()).toString("hex"));
    expect(new Set(encodings).size).toBe(8);
    for (const point of SMALL_ORDER) {
      const bytes = point.toBytes();
      expect(checkPoint(bytes)).toBe("small order");
      expect(checkBindingJwk(JSON.stringify({ kty: "OKP", crv: "Ed25519", x: b64u(bytes) }))).toMatchObject({ ok: false, refusal: "x point" });
      const signature = new Uint8Array(64);
      signature.set(bytes, 0);
      expect(rRuleHolds(signature)).toBe(false);
    }
  });

  it("admit no forgery: key and R the identity, S = 0", () => {
    const identity = Point.ZERO.toBytes();
    const forged = new Uint8Array(64);
    forged.set(identity, 0);
    const message = new Uint8Array(Buffer.from("any act's signing input"));
    expect(verifyActSignature({ signingInput: message, signature: forged }, identity)).toBe(false);
    // Node's answer depends on its OpenSSL build (the page records both); not asserted.
  });

  it("admit no forgery for any small-order key with an honest-looking R", () => {
    const message = new Uint8Array(Buffer.from("act"));
    for (const point of SMALL_ORDER) {
      const A = point.toBytes();
      // R = sB, S = s, retried until [k]A = 0: the forgery Node accepted on some builds.
      for (let attempt = 0; attempt < 64; attempt += 1) {
        const s = sha512Scalar(new Uint8Array([attempt]), A);
        const R = Point.BASE.multiply(s).toBytes();
        const k = sha512Scalar(R, A, message);
        if (!point.multiplyUnsafe(k).is0()) continue;
        const signature = new Uint8Array([...R, ...le32(s)]);
        expect(rRuleHolds(signature)).toBe(true);
        expect(verifyActSignature({ signingInput: message, signature }, A)).toBe(false);
        break;
      }
    }
  });
});

describe("torsion and mixed order", () => {
  const A = Point.BASE.toBytes(); // scalar 1: anyone can sign; a public point
  const message = new Uint8Array(Buffer.from("act"));

  it("refuses an R with a torsion component that strict noble alone accepts", () => {
    for (let r = BigInt(1); r <= BigInt(20); r += BigInt(1)) {
      const R = Point.BASE.multiply(BigInt(12345) * r).add(T8).toBytes();
      const k = sha512Scalar(R, A, message);
      const signature = new Uint8Array([...R, ...le32((BigInt(12345) * r + k) % L)]);
      expect(ed25519.verify(signature, message, A, { zip215: false })).toBe(true);
      expect(checkPoint(R)).toBe("not torsion-free");
      expect(verifyActSignature({ signingInput: message, signature }, A)).toBe(false);
    }
  });

  it("refuses R = identity, which strict noble accepts", () => {
    const R = Point.ZERO.toBytes();
    const k = sha512Scalar(R, A, message);
    const signature = new Uint8Array([...R, ...le32(k)]);
    expect(ed25519.verify(signature, message, A, { zip215: false })).toBe(true);
    expect(verifyActSignature({ signingInput: message, signature }, A)).toBe(false);
  });

  it("refuses a mixed-order key at binding, though strict noble verifies its honest signatures", () => {
    const secret = ed25519.utils.randomSecretKey();
    const { scalar } = ed25519.utils.getExtendedPublicKey(secret);
    const honest = Point.BASE.multiply(scalar);
    const mixed = honest.add(T8).toBytes();
    expect(checkPoint(mixed)).toBe("not torsion-free");
    expect(checkBindingJwk(JSON.stringify({ kty: "OKP", crv: "Ed25519", x: b64u(mixed) }))).toMatchObject({ ok: false, refusal: "x point" });
    // An honest signature under the mixed key: R = rB, S = r + k·a.
    const r = sha512Scalar(new Uint8Array([7]), mixed);
    const R = Point.BASE.multiply(r).toBytes();
    const k = sha512Scalar(R, mixed, message);
    const signature = new Uint8Array([...R, ...le32((r + k * scalar) % L)]);
    // [8]: noble's cofactored equation holds whatever k·T8 is.
    expect(ed25519.verify(signature, message, mixed, { zip215: false })).toBe(true);
  });
});

describe("non-canonical encodings", () => {
  const nonCanonical = [
    "edffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f", // y = p
    "eeffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f", // y = p + 1, the identity
    "0100000000000000000000000000000000000000000000000000000000000080", // identity, x = 0 with the sign bit
    "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff", // y >= p
  ];

  it.each(nonCanonical)("refuses %s as a key and as R", (value) => {
    expect(checkPoint(hex(value))).toBe("not canonical");
    expect(checkBindingJwk(JSON.stringify({ kty: "OKP", crv: "Ed25519", x: b64u(hex(value)) }))).toMatchObject({ ok: false, refusal: "x point" });
    const signature = new Uint8Array(64);
    signature.set(hex(value), 0);
    expect(rRuleHolds(signature)).toBe(false);
  });

  it("refuses S >= L, which an honest signature never has", () => {
    const { secretKey, publicKey } = keyPair();
    const message = new Uint8Array(Buffer.from("act"));
    const signature = ed25519.sign(message, secretKey);
    expectAccepted({ signingInput: message, signature }, publicKey);
    const S = le(signature.subarray(32));
    const malleable = new Uint8Array([...signature.subarray(0, 32), ...le32(S + L)]);
    expect(rRuleHolds(malleable)).toBe(false);
    expect(verifyActSignature({ signingInput: message, signature: malleable }, publicKey)).toBe(false);
  });
});

describe("strict base64url", () => {
  it("refuses padding, another alphabet and non-zero trailing bits", () => {
    expect(decodeStrictBase64url("AQ")).toEqual(new Uint8Array([1]));
    expect(decodeStrictBase64url("AQ==")).toBeNull();
    expect(decodeStrictBase64url("AR")).toBeNull(); // trailing bits
    expect(decodeStrictBase64url("A+8")).toBeNull();
    expect(decodeStrictBase64url("A/8")).toBeNull();
    expect(decodeStrictBase64url("A")).toBeNull();
    expect(decodeStrictBase64url("A Q")).toBeNull();
  });

  it("refuses an act with padding or trailing bits in any segment", () => {
    const { secretKey, kid } = keyPair();
    const jws = sign({ alg: "Ed25519", typ: "ctcg-act.v1", kid }, payloadFor(), secretKey);
    expect(detail(jws)).toBe("ok");
    const [h, p, s] = jws.split(".");
    expect(detail(`${h}=.${p}.${s}`)).toBe("not strict base64url");
    expect(detail(`${h}.${p}=.${s}`)).toBe("not strict base64url");
    // 86 characters carry 516 bits for 512: the last character has 4 spare bits.
    const last = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_".indexOf(s.at(-1)!);
    const spare = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"[last ^ 1];
    expect(detail(`${h}.${p}.${s.slice(0, -1)}${spare}`)).toBe("not strict base64url");
    expect(detail(`${h}.${p}.${s.slice(0, -1)}`)).toBe("not a compact JWS with an 86-character signature");
    expect(detail(`${h}.${p}.${s}A`)).toBe("not a compact JWS with an 86-character signature");
    expect(detail(`${h}.${p}`)).toBe("not a compact JWS with an 86-character signature");
    expect(detail(`${h}.${p}.${s}.x`)).toBe("not a compact JWS with an 86-character signature");
    expect(detail(`.${p}.${s}`)).toBe("not a compact JWS with an 86-character signature");
  });

  it("refuses a JWK x with padding or trailing bits", () => {
    const { x } = keyPair();
    expect(checkBindingJwk(JSON.stringify({ kty: "OKP", crv: "Ed25519", x: `${x}=` }))).toMatchObject({ ok: false, refusal: "x encoding" });
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const bumped = alphabet[alphabet.indexOf(x.at(-1)!) ^ 1];
    expect(checkBindingJwk(JSON.stringify({ kty: "OKP", crv: "Ed25519", x: x.slice(0, -1) + bumped }))).toMatchObject({ ok: false, refusal: "x encoding" });
  });
});

describe("the statement's shape", () => {
  const { secretKey, kid } = keyPair();
  const header = { alg: "Ed25519", typ: "ctcg-act.v1", kid };
  const signed = (h: unknown, p: unknown) => sign(h, p, secretKey);

  it("refuses duplicate names in the header and the payload, escaped or not", () => {
    const p = JSON.stringify(payloadFor());
    expect(detail(signed(`{"alg":"Ed25519","typ":"ctcg-act.v1","kid":"${kid}","alg":"EdDSA"}`, p))).toBe(
      "header is not a UTF-8 JSON object without duplicate names",
    );
    expect(detail(signed(`{"alg":"Ed25519","typ":"ctcg-act.v1","kid":"${kid}","\\u0061lg":"none"}`, p))).toBe(
      "header is not a UTF-8 JSON object without duplicate names",
    );
    expect(detail(signed(header, p.replace(/}$/, ',"sub":"00000000-0000-4000-8000-000000000000"}')))).toBe(
      "payload is not a UTF-8 JSON object without duplicate names",
    );
  });

  it("refuses a header that is not exactly alg, typ, kid, and checks each", () => {
    const p = payloadFor();
    for (const extra of ["crit", "jwk", "jku", "x5u", "x5c", "b64", "cty"]) {
      expect(detail(signed({ ...header, [extra]: "x" }, p)), extra).toBe("header members must be exactly alg, typ, kid");
    }
    expect(detail(signed({ alg: "Ed25519", typ: "ctcg-act.v1" }, p))).toBe("header members must be exactly alg, typ, kid");
    for (const alg of ["none", "ES256", "HS256", "ed25519", "EDDSA", 1]) {
      expect(detail(signed({ ...header, alg }, p)), String(alg)).toBe("alg must be Ed25519 or EdDSA");
    }
    for (const typ of ["ctcg-act.v1", "CTCG-ACT.V1", "application/ctcg-act.v1", "Application/Ctcg-Act.V1"]) {
      expect(detail(signed({ ...header, typ }, p)), typ).toBe("ok");
    }
    for (const typ of ["JWT", "ctcg-act.v2", "application/jwt", "ctcg-act.v1 ", "", null]) {
      expect(detail(signed({ ...header, typ }, p)), String(typ)).toBe("typ must be ctcg-act.v1");
    }
    for (const badKid of [kid.slice(1), `${kid}A`, `${kid.slice(0, -1)}=`, 7]) {
      expect(detail(signed({ ...header, kid: badKid }, p)), String(badKid)).toBe("kid must be an RFC 7638 thumbprint");
    }
    expect(detail(signed("[1]", p))).toBe("header is not a UTF-8 JSON object without duplicate names");
    expect(detail(`${b64u(Buffer.from([0xff, 0xfe]))}.${b64u(JSON.stringify(p))}.${"A".repeat(86)}`)).toBe(
      "header is not a UTF-8 JSON object without duplicate names",
    );
  });

  it("refuses a payload that is not exactly the seven members, and checks each", () => {
    const base = payloadFor();
    const { params: _params, ...missing } = base;
    expect(detail(signed(header, missing))).toBe("payload members must be exactly aud, act, sub, iat, exp, jti, params");
    expect(detail(signed(header, { ...base, nbf: base.iat }))).toBe("payload members must be exactly aud, act, sub, iat, exp, jti, params");
    expect(detail(signed(header, { ...base, aud: "https://cambridgetcg.com/" }))).toBe("aud is not this deployment's audience");
    expect(detail(signed(header, { ...base, aud: ["https://cambridgetcg.com"] }))).toBe("aud is not this deployment's audience");
    expect(detail(signed(header, { ...base, act: "agent.archive" }))).toBe("act is not a known act");
    expect(detail(signed(header, { ...base, sub: base.sub.toUpperCase() }))).toBe("sub must be an agent id");
    expect(detail(signed(header, { ...base, sub: "agent-one" }))).toBe("sub must be an agent id");
  });

  it("holds iat and exp to integers, 0 < exp - iat <= 300", () => {
    const iat = nowSeconds();
    expect(detail(signed(header, payloadFor({ iat, exp: iat + 300 })))).toBe("ok");
    expect(detail(signed(header, payloadFor({ iat, exp: iat + 1 })))).toBe("ok");
    for (const [i, e] of [[iat, iat + 301], [iat, iat], [iat, iat - 1], [iat + 0.5, iat + 60], [String(iat), iat + 60], [0, 60], [-60, 60]]) {
      expect(detail(signed(header, payloadFor({ iat: i, exp: e }))), `${i} ${e}`).toBe("iat and exp must be integers with 0 < exp - iat <= 300");
    }
  });

  it("takes iat and exp only as integer literals: no fraction, no exponent, even where the value is whole", () => {
    const iat = nowSeconds();
    // The payload's text, with iat and exp spelled as given.
    const spelled = (iatText: string, expText: string) =>
      JSON.stringify(payloadFor({ iat: 1, exp: 2 })).replace('"iat":1', `"iat":${iatText}`).replace('"exp":2', `"exp":${expText}`);
    expect(detail(signed(header, spelled(String(iat), String(iat + 300))))).toBe("ok");
    for (const [iatText, expText] of [
      // Each of these is an integer once read as a JavaScript number.
      [`${iat}.00000000000000000001`, String(iat + 60)],
      [String(iat), `${iat + 300}.0000000000001`],
      [`${iat}.0`, String(iat + 60)],
      [`${iat}e0`, String(iat + 60)],
      [`${iat}E0`, String(iat + 60)],
      [`${iat}0e-1`, String(iat + 60)],
      [String(iat), `${iat + 60}.000`],
      [String(iat), `${(iat + 60) / 10}e1`],
      [String(iat), `${iat + 60}e+0`],
    ]) {
      expect(detail(signed(header, spelled(iatText, expText))), `${iatText} ${expText}`).toBe(
        "iat and exp must be integers with 0 < exp - iat <= 300",
      );
    }
  });

  it("holds jti to 16 to 32 bytes of strict base64url", () => {
    for (const n of [16, 24, 32]) expect(detail(signed(header, payloadFor({ jti: b64u(crypto.randomBytes(n)) }))), String(n)).toBe("ok");
    for (const jti of [b64u(crypto.randomBytes(15)), b64u(crypto.randomBytes(33)), `${b64u(crypto.randomBytes(16))}==`, 16]) {
      expect(detail(signed(header, payloadFor({ jti }))), String(jti)).toBe("jti must be 16 to 32 bytes in base64url");
    }
  });

  it("holds params to each act's exact member set of strings", () => {
    const mint = { key_sha256: "a".repeat(64), key_prefix: "ctcg_agt_Ab1", expires: "90d", name: "laptop", preview_sha256: "b".repeat(64) };
    const cases: [string, unknown, string][] = [
      ["signer.check", {}, "ok"],
      ["signer.check", { x: "1" }, "params members do not match the act"],
      ["key.mint", mint, "ok"],
      ["key.mint", { ...mint, name: undefined }, "params members do not match the act"],
      ["key.mint", { ...mint, extra: "1" }, "params members do not match the act"],
      ["key.mint", { ...mint, expires: 90 }, "params members do not match the act"],
      ["key.revoke", { key_id: "00000000-0000-4000-8000-000000000000" }, "ok"],
      ["key.revoke", { kid }, "ok"],
      ["key.revoke", { key_id: "x", kid }, "params members do not match the act"],
      ["key.revoke", {}, "params members do not match the act"],
      ["key.revoke", [], "params members do not match the act"],
      ["key.revoke", null, "params members do not match the act"],
    ];
    for (const [act, params, expected] of cases) {
      expect(detail(signed(header, payloadFor({ act, params }))), `${act} ${JSON.stringify(params)}`).toBe(expected);
    }
  });

  it("takes exactly 8 KiB and no more", () => {
    // Insignificant JSON whitespace pads the header and payload to the edge.
    const headerJson = (spaces: number) => JSON.stringify(header).replace("{", "{" + " ".repeat(spaces));
    const payloadJson = (spaces: number) => JSON.stringify(payloadFor()).replace("{", "{" + " ".repeat(spaces));
    const lengthOf = (h: string, p: string) => b64u(h).length + 1 + b64u(p).length + 1 + 86;
    let found: [string, string] | null = null;
    for (let hs = 0; hs < 4 && !found; hs += 1) {
      for (let ps = 5000; ps < 6500 && !found; ps += 1) {
        if (lengthOf(headerJson(hs), payloadJson(ps)) === SIGNED_ACT_MAX_LENGTH) found = [headerJson(hs), payloadJson(ps)];
      }
    }
    if (!found) throw new Error("no padding lands on the edge");
    const jws = signed(found[0], found[1]);
    expect(jws.length).toBe(SIGNED_ACT_MAX_LENGTH);
    const parsed = parseSignedAct(jws, AUD);
    if (!parsed.ok) throw new Error(parsed.detail);
    expectAccepted(parsed.act, ed25519.getPublicKey(secretKey));
    // One more character of whitespace tips it over.
    const over = signed(found[0], found[1].replace("{", "{ "));
    expect(over.length).toBeGreaterThan(SIGNED_ACT_MAX_LENGTH);
    expect(detail(over)).toBe("longer than 8 KiB");
    expect(detail("A".repeat(SIGNED_ACT_MAX_LENGTH + 1))).toBe("longer than 8 KiB");
  });

  it("answers a non-string as such", () => {
    for (const input of [null, undefined, 1, {}, ["a.b.c"]]) expect(detail(input)).toBe("not a string");
  });
});

describe("the app's clock (step 3)", () => {
  it("is stale only past 60 s after exp or more than 300 s before iat", () => {
    const now = 1_800_000_000;
    expect(staleByAppClock({ iat: now - 120, exp: now }, now)).toBe(false);
    expect(staleByAppClock({ iat: now - 180, exp: now - 60 }, now)).toBe(false);
    expect(staleByAppClock({ iat: now - 181, exp: now - 61 }, now)).toBe(true);
    expect(staleByAppClock({ iat: now + 300, exp: now + 400 }, now)).toBe(false);
    expect(staleByAppClock({ iat: now + 301, exp: now + 400 }, now)).toBe(true);
  });
});

describe("binding a pasted JWK", () => {
  it("accepts exactly {kty, crv, x} for a fresh key and returns its thumbprint", () => {
    const { x, publicKey, kid } = keyPair();
    const checked = checkBindingJwk(`  ${JSON.stringify({ x, crv: "Ed25519", kty: "OKP" })}\n`);
    expect(checked).toEqual({ ok: true, x, publicKey: new Uint8Array(publicKey), thumbprint: kid });
  });

  it("refuses a private key before looking at anything else, and never echoes it", () => {
    const { x } = keyPair();
    const d = b64u(crypto.randomBytes(32));
    for (const paste of [
      JSON.stringify({ kty: "OKP", crv: "Ed25519", x, d }),
      JSON.stringify({ d }),
      JSON.stringify({ kty: "EC", crv: "P-256", d, extra: 1 }),
    ]) {
      const checked = checkBindingJwk(paste);
      expect(checked).toEqual({ ok: false, refusal: "private key", error: BINDING_JWK_ERRORS["private key"] });
      expect(JSON.stringify(checked)).not.toContain(d);
    }
  });

  it("refuses other members, other key types, duplicates and non-JSON", () => {
    const { x } = keyPair();
    expect(checkBindingJwk(JSON.stringify({ kty: "OKP", crv: "Ed25519", x, kid: "k" }))).toMatchObject({ refusal: "members" });
    expect(checkBindingJwk(JSON.stringify({ kty: "OKP", crv: "Ed25519", x, alg: "EdDSA" }))).toMatchObject({ refusal: "members" });
    expect(checkBindingJwk(JSON.stringify({ kty: "OKP", crv: "Ed25519" }))).toMatchObject({ refusal: "members" });
    expect(checkBindingJwk(JSON.stringify({ kty: "OKP", crv: "X25519", x }))).toMatchObject({ refusal: "not an Ed25519 key" });
    expect(checkBindingJwk(JSON.stringify({ kty: "EC", crv: "Ed25519", x }))).toMatchObject({ refusal: "not an Ed25519 key" });
    expect(checkBindingJwk(`{"kty":"OKP","crv":"Ed25519","x":"${x}","x":"${x}"}`)).toMatchObject({ refusal: "not a JSON object" });
    expect(checkBindingJwk(x)).toMatchObject({ refusal: "not a JSON object" });
    expect(checkBindingJwk(null)).toMatchObject({ refusal: "not a JSON object" });
    expect(checkBindingJwk(" ".repeat(3000))).toMatchObject({ refusal: "not a JSON object" });
    expect(checkBindingJwk(JSON.stringify({ kty: "OKP", crv: "Ed25519", x: b64u(crypto.randomBytes(31)) }))).toMatchObject({ refusal: "x encoding" });
    expect(checkBindingJwk(JSON.stringify({ kty: "OKP", crv: "Ed25519", x: 1 }))).toMatchObject({ refusal: "x encoding" });
  });

  it("refuses every published test key", () => {
    for (const key of PUBLISHED_TEST_KEYS_HEX) {
      expect(checkBindingJwk(JSON.stringify({ kty: "OKP", crv: "Ed25519", x: b64u(hex(key)) }))).toMatchObject({ ok: false, refusal: "published test key" });
    }
    expect(checkBindingJwk(JSON.stringify({ kty: "OKP", crv: "Ed25519", x: RFC8037_X }))).toMatchObject({ refusal: "published test key" });
  });
});

describe("the dummy verification key", () => {
  it("is the key the comment says, an acceptable point, and verifies nothing honest", () => {
    const seed = crypto.createHash("sha256").update(DUMMY_VERIFICATION_SEED_TEXT, "utf8").digest();
    expect(b64u(ed25519.getPublicKey(new Uint8Array(seed)))).toBe(b64u(DUMMY_VERIFICATION_KEY));
    expect(checkPoint(DUMMY_VERIFICATION_KEY)).toBe("ok");
    const parsed = parseSignedAct(WORKED_EXAMPLE, AUD);
    if (!parsed.ok) throw new Error(parsed.detail);
    expect(verifyActSignature(parsed.act, DUMMY_VERIFICATION_KEY)).toBe(false);
  });

  it("is refused at binding, beside the published test keys: its private half is in the source", () => {
    const x = b64u(DUMMY_VERIFICATION_KEY);
    expect(checkBindingJwk(JSON.stringify({ kty: "OKP", crv: "Ed25519", x }))).toEqual({
      ok: false,
      refusal: "published test key",
      error: BINDING_JWK_ERRORS["published test key"],
    });
    // Anyone can sign with it, which is why it must never be bound.
    const seed = new Uint8Array(crypto.createHash("sha256").update(DUMMY_VERIFICATION_SEED_TEXT, "utf8").digest());
    const parsed = parseSignedAct(sign({ alg: "Ed25519", typ: "ctcg-act.v1", kid: ed25519Thumbprint(x) }, payloadFor(), seed), AUD);
    if (!parsed.ok) throw new Error(parsed.detail);
    expect(verifyActSignature(parsed.act, DUMMY_VERIFICATION_KEY)).toBe(true);
  });
});
