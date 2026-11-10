/**
 * Signed agent acts: the statement's rules and the Ed25519 checks, as pure
 * code. No database, no network, no environment: the caller passes the
 * configured audience and the clock. The act path (signed-acts.ts) runs
 * these before it touches the database, and the operator's binding
 * (signing-key-actions.ts) runs the JWK checks before it stores a key.
 *
 * The design is docs/plans/agent-auth/held-keys.md ("The statement", "How
 * the store verifies" steps 2, 3 and 6, "At binding"). The owner decided on
 * 2026-11-10 to offer agent-held keys ("Yes offer the keys"); every rule and
 * number here is an agent's proposal in that page, not the owner's choice.
 *
 * What a valid signature proves: control of the key over these exact bytes.
 * Not identity, not consent, and no authority to act for anyone else.
 *
 * Why the R rule. RFC 8032 §5.1.7 lets a verifier check either the
 * cofactored equation ([8][S]B = [8]R + [8][k]A') or the cofactorless one
 * ([S]B = R + [k]A'). noble checks the first; OpenSSL, and so Node's own
 * crypto.verify, the second. A key holder can craft signatures the two
 * disagree on. With A and R torsion-free and R not of small order, both
 * equations accept the same signatures, so a stored act re-verifies with
 * any correct library, and no answer here depends on the Node build. A is
 * checked once, when the key is bound; R on every act.
 */

import { createHash } from "node:crypto";
import { ed25519 } from "@noble/curves/ed25519.js";
import { hasExactMembers, isJsonObject, parseStrictJson } from "./strict-json";

// ── The statement's numbers (held-keys.md D6, an agent's defaults) ───────

/** A whole act, in characters (all ASCII, so also bytes). */
export const SIGNED_ACT_MAX_LENGTH = 8 * 1024;
/** 64 signature bytes in unpadded base64url. */
export const SIGNED_ACT_SIGNATURE_CHARS = 86;
/** exp − iat, at most. */
export const SIGNED_ACT_MAX_LIFETIME_SECONDS = 300;
/** How far ahead of the database's clock an iat may be. */
export const SIGNED_ACT_SKEW_SECONDS = 60;
/** Step 3, by the app's clock before any database work: an act whose exp
 *  is more than this far past is stale... */
export const SIGNED_ACT_APP_EXP_GRACE_SECONDS = 60;
/** ...and so is one whose iat is more than this far ahead. */
export const SIGNED_ACT_APP_IAT_AHEAD_SECONDS = 300;
export const SIGNED_ACT_JTI_MIN_BYTES = 16;
export const SIGNED_ACT_JTI_MAX_BYTES = 32;

/** RFC 7515 §4.1.9: compared case-insensitively, "application/" optional. */
export const SIGNED_ACT_TYP = "ctcg-act.v1";
const ACCEPTED_TYP = new Set([SIGNED_ACT_TYP, `application/${SIGNED_ACT_TYP}`]);

/** `Ed25519` (RFC 9864, fully specified) or `EdDSA` (RFC 8037, deprecated
 *  by RFC 9864, accepted for older tooling). The key row's alg column picks
 *  the algorithm; the header only has to name one of these. */
export const SIGNED_ACT_ALGS = ["Ed25519", "EdDSA"] as const;

export const SIGNED_ACT_NAMES = ["signer.check", "key.mint", "key.revoke"] as const;
export type SignedActName = (typeof SIGNED_ACT_NAMES)[number];

/** Each act's exact params member sets; key.revoke takes one of two. */
export const SIGNED_ACT_PARAMS: Readonly<Record<SignedActName, readonly (readonly string[])[]>> = {
  "signer.check": [[]],
  "key.mint": [["key_sha256", "key_prefix", "expires", "name", "preview_sha256"]],
  "key.revoke": [["key_id"], ["kid"]],
};

/** Acts that only end authority. Before verification an act's name is only
 *  a claim, so these get their own limit ceiling rather than none. */
export const EXIT_LABELLED_ACTS: ReadonlySet<string> = new Set<SignedActName>(["key.revoke"]);

export function isSignedActName(value: unknown): value is SignedActName {
  return typeof value === "string" && (SIGNED_ACT_NAMES as readonly string[]).includes(value);
}

const HEADER_MEMBERS = ["alg", "typ", "kid"] as const;
const PAYLOAD_MEMBERS = ["aud", "act", "sub", "iat", "exp", "jti", "params"] as const;

/** A lower-case UUID, as the store prints agent ids. */
export const AGENT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** An RFC 7638 SHA-256 thumbprint: 32 bytes in unpadded base64url. */
export const THUMBPRINT_RE = /^[A-Za-z0-9_-]{43}$/;

// ── Strict base64url ─────────────────────────────────────────────────────

const B64URL_RE = /^[A-Za-z0-9_-]*$/;

/**
 * Unpadded base64url that re-encodes to exactly the same text, or null.
 * That refuses padding, any other alphabet, a length that cannot be
 * base64, and non-zero trailing bits (two encodings of one byte string).
 */
export function decodeStrictBase64url(segment: string): Uint8Array | null {
  if (typeof segment !== "string" || !B64URL_RE.test(segment) || segment.length % 4 === 1) return null;
  const bytes = Buffer.from(segment, "base64url");
  if (bytes.toString("base64url") !== segment) return null;
  return new Uint8Array(bytes);
}

const utf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

function decodeUtf8(bytes: Uint8Array): string | null {
  try {
    return utf8.decode(bytes);
  } catch {
    return null;
  }
}

// ── The statement ────────────────────────────────────────────────────────

/** Which shape rule an act broke. A fixed phrase, never the act's text. */
export type ActMalformedDetail =
  | "not a string"
  | "longer than 8 KiB"
  | "not a compact JWS with an 86-character signature"
  | "not strict base64url"
  | "header is not a UTF-8 JSON object without duplicate names"
  | "header members must be exactly alg, typ, kid"
  | "alg must be Ed25519 or EdDSA"
  | "typ must be ctcg-act.v1"
  | "kid must be an RFC 7638 thumbprint"
  | "payload is not a UTF-8 JSON object without duplicate names"
  | "payload members must be exactly aud, act, sub, iat, exp, jti, params"
  | "aud is not this deployment's audience"
  | "act is not a known act"
  | "sub must be an agent id"
  | "iat and exp must be integers with 0 < exp - iat <= 300"
  | "jti must be 16 to 32 bytes in base64url"
  | "params members do not match the act";

export interface SignedActHeader {
  alg: (typeof SIGNED_ACT_ALGS)[number];
  typ: string;
  kid: string;
}

export interface SignedActPayload {
  aud: string;
  act: SignedActName;
  sub: string;
  iat: number;
  exp: number;
  jti: string;
  params: Record<string, string>;
}

export interface ParsedSignedAct {
  /** The act exactly as received. */
  jws: string;
  /** Lower-case hex SHA-256 of the act as received (act_sha256). */
  sha256: string;
  /** The JWS signing input as received: no canonicalization. */
  signingInput: Uint8Array;
  signature: Uint8Array;
  header: SignedActHeader;
  payload: SignedActPayload;
}

export type SignedActParse =
  | { ok: true; act: ParsedSignedAct }
  | { ok: false; detail: ActMalformedDetail };

const malformed = (detail: ActMalformedDetail): SignedActParse => ({ ok: false, detail });

function parseSegmentObject(segment: string): Record<string, unknown> | null {
  const bytes = decodeStrictBase64url(segment);
  if (!bytes) return null;
  const text = decodeUtf8(bytes);
  if (text === null) return null;
  const parsed = parseStrictJson(text);
  if (!parsed.ok || !isJsonObject(parsed.value)) return null;
  return parsed.value;
}

function paramsMatch(act: SignedActName, params: unknown): params is Record<string, string> {
  if (!isJsonObject(params)) return false;
  if (!Object.values(params).every((value) => typeof value === "string")) return false;
  return SIGNED_ACT_PARAMS[act].some((names) => hasExactMembers(params, names));
}

/**
 * The statement's shape rules (held-keys.md "The statement"; "How the store
 * verifies" step 2). Pure: `audience` is the deployment's configured one.
 * Checks in a fixed order, cheapest first, and answers with the first rule
 * broken. Nothing here says whether a key or agent exists.
 */
export function parseSignedAct(input: unknown, audience: string): SignedActParse {
  if (typeof input !== "string") return malformed("not a string");
  if (input.length > SIGNED_ACT_MAX_LENGTH) return malformed("longer than 8 KiB");
  const parts = input.split(".");
  if (
    parts.length !== 3 ||
    parts[0].length === 0 ||
    parts[1].length === 0 ||
    parts[2].length !== SIGNED_ACT_SIGNATURE_CHARS
  ) {
    return malformed("not a compact JWS with an 86-character signature");
  }
  const [headerB64, payloadB64, signatureB64] = parts;
  const signature = decodeStrictBase64url(signatureB64);
  if (!signature || signature.length !== 64) return malformed("not strict base64url");
  if (!decodeStrictBase64url(headerB64) || !decodeStrictBase64url(payloadB64)) {
    return malformed("not strict base64url");
  }

  const header = parseSegmentObject(headerB64);
  if (!header) return malformed("header is not a UTF-8 JSON object without duplicate names");
  if (!hasExactMembers(header, HEADER_MEMBERS)) return malformed("header members must be exactly alg, typ, kid");
  if (!(SIGNED_ACT_ALGS as readonly unknown[]).includes(header.alg)) return malformed("alg must be Ed25519 or EdDSA");
  if (typeof header.typ !== "string" || !ACCEPTED_TYP.has(header.typ.toLowerCase())) {
    return malformed("typ must be ctcg-act.v1");
  }
  const kidBytes = typeof header.kid === "string" ? decodeStrictBase64url(header.kid) : null;
  if (!kidBytes || kidBytes.length !== 32) return malformed("kid must be an RFC 7638 thumbprint");

  const payload = parseSegmentObject(payloadB64);
  if (!payload) return malformed("payload is not a UTF-8 JSON object without duplicate names");
  if (!hasExactMembers(payload, PAYLOAD_MEMBERS)) {
    return malformed("payload members must be exactly aud, act, sub, iat, exp, jti, params");
  }
  if (typeof payload.aud !== "string" || payload.aud !== audience) return malformed("aud is not this deployment's audience");
  if (!isSignedActName(payload.act)) return malformed("act is not a known act");
  if (typeof payload.sub !== "string" || !AGENT_ID_RE.test(payload.sub)) return malformed("sub must be an agent id");
  const { iat, exp } = payload;
  if (
    typeof iat !== "number" ||
    typeof exp !== "number" ||
    !Number.isSafeInteger(iat) ||
    !Number.isSafeInteger(exp) ||
    iat <= 0 ||
    exp - iat <= 0 ||
    exp - iat > SIGNED_ACT_MAX_LIFETIME_SECONDS
  ) {
    return malformed("iat and exp must be integers with 0 < exp - iat <= 300");
  }
  const jtiBytes = typeof payload.jti === "string" ? decodeStrictBase64url(payload.jti) : null;
  if (!jtiBytes || jtiBytes.length < SIGNED_ACT_JTI_MIN_BYTES || jtiBytes.length > SIGNED_ACT_JTI_MAX_BYTES) {
    return malformed("jti must be 16 to 32 bytes in base64url");
  }
  if (!paramsMatch(payload.act, payload.params)) return malformed("params members do not match the act");

  return {
    ok: true,
    act: {
      jws: input,
      sha256: createHash("sha256").update(input, "utf8").digest("hex"),
      signingInput: new Uint8Array(Buffer.from(`${headerB64}.${payloadB64}`, "ascii")),
      signature,
      header: { alg: header.alg as SignedActHeader["alg"], typ: header.typ, kid: header.kid as string },
      payload: {
        aud: payload.aud,
        act: payload.act,
        sub: payload.sub,
        iat,
        exp,
        jti: payload.jti as string,
        params: { ...(payload.params as Record<string, string>) },
      },
    },
  };
}

/**
 * Step 3, by the app's clock (seconds): obviously stale, so an act lifted
 * from a log cannot take the agent's row lock. The database's clock has the
 * last word inside the transaction.
 */
export function staleByAppClock(payload: Pick<SignedActPayload, "iat" | "exp">, nowSeconds: number): boolean {
  return (
    nowSeconds - payload.exp > SIGNED_ACT_APP_EXP_GRACE_SECONDS ||
    payload.iat - nowSeconds > SIGNED_ACT_APP_IAT_AHEAD_SECONDS
  );
}

// ── Keys and points ──────────────────────────────────────────────────────

const Point = ed25519.Point;
type EdPoint = InstanceType<typeof Point>;
const ORDER = Point.Fn.ORDER;

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** A point whose 32-byte encoding is the canonical one (y < p; no x = 0
 *  with the sign bit set; it re-encodes to the same bytes), or null. */
function canonicalPoint(bytes: Uint8Array): EdPoint | null {
  if (bytes.length !== 32) return null;
  let point: EdPoint;
  try {
    point = Point.fromBytes(bytes, false);
  } catch {
    return null;
  }
  return sameBytes(point.toBytes(), bytes) ? point : null;
}

export type PointCheck = "ok" | "not canonical" | "small order" | "not torsion-free";

/** The rule for both A (at binding) and R (on every act): canonical, not
 *  of small order, torsion-free. The identity is torsion-free but of small
 *  order, hence both checks. */
export function checkPoint(bytes: Uint8Array): PointCheck {
  const point = canonicalPoint(bytes);
  if (!point) return "not canonical";
  if (point.isSmallOrder()) return "small order";
  if (!point.isTorsionFree()) return "not torsion-free";
  return "ok";
}

function littleEndian(bytes: Uint8Array): bigint {
  let n = BigInt(0);
  for (let i = bytes.length - 1; i >= 0; i -= 1) n = (n << BigInt(8)) | BigInt(bytes[i]);
  return n;
}

/** The R rule, plus S < L (noble checks S too; this states it). */
export function rRuleHolds(signature: Uint8Array): boolean {
  if (signature.length !== 64) return false;
  if (littleEndian(signature.subarray(32)) >= ORDER) return false;
  return checkPoint(signature.subarray(0, 32)) === "ok";
}

/**
 * Step 6: the R rule, then noble's strict verify (zip215: false) over the
 * signing input as received. Never throws. `publicKey` is the stored 32
 * bytes, already checked at binding.
 */
export function verifyActSignature(
  act: Pick<ParsedSignedAct, "signingInput" | "signature">,
  publicKey: Uint8Array,
): boolean {
  try {
    if (!rRuleHolds(act.signature)) return false;
    return ed25519.verify(act.signature, act.signingInput, publicKey, { zip215: false });
  } catch {
    return false;
  }
}

/**
 * The fixed key an act is checked against when (sub, kid) names no key, so
 * an unknown key costs the same work as a bad signature and shares its
 * answer. It is the public key of the seed SHA-256("cambridgetcg.com held
 * keys: dummy verification key"); anyone can compute that seed, which is
 * harmless: whatever this verify returns, an unknown key is refused.
 */
export const DUMMY_VERIFICATION_KEY = new Uint8Array(
  Buffer.from("72a3c59085817c7e20171ffd88af925af5a3ab6bedfb9f48b479165e20ee9cc1", "hex"),
);
export const DUMMY_VERIFICATION_SEED_TEXT = "cambridgetcg.com held keys: dummy verification key";

/** RFC 7638 thumbprint of an Ed25519 OKP key given its x (base64url). */
export function ed25519Thumbprint(x: string): string {
  return createHash("sha256")
    .update(`{"crv":"Ed25519","kty":"OKP","x":"${x}"}`, "utf8")
    .digest("base64url");
}

/**
 * Published test keys: RFC 8032 §7.1 (TEST 1, 2, 3, 1024 and SHA(abc)) as
 * hex public keys. RFC 8037 Appendix A's key is TEST 1's. Anyone holds
 * their private halves, so none is bound for real.
 */
export const PUBLISHED_TEST_KEYS_HEX: readonly string[] = [
  "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a",
  "3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c",
  "fc51cd8e6218a1a38da47ed00230f0580816ed13ba3303ac5deb911548908025",
  "278117fc144c72340f67d0f2316e8386ceffbf2b2428c9c51fef7c597f1d426e",
  "ec172b93ad5e563bf4932c70e1245034c35467ef2efd4d64ebf819683467e2bf",
];

/** The most a paste may hold. A public JWK is about 90 characters. */
export const BINDING_JWK_MAX_LENGTH = 2048;

export type BindingJwkRefusal =
  | "not a JSON object"
  | "private key"
  | "members"
  | "not an Ed25519 key"
  | "x encoding"
  | "x point"
  | "published test key";

export type BindingJwkCheck =
  | { ok: true; x: string; publicKey: Uint8Array; thumbprint: string }
  | { ok: false; refusal: BindingJwkRefusal; error: string };

/** What the operator is told for each refusal. Fixed text: never the paste. */
export const BINDING_JWK_ERRORS: Readonly<Record<BindingJwkRefusal, string>> = {
  "not a JSON object": "Paste the public key as a JSON object (a JWK).",
  "private key":
    "That is a private key (it has a \"d\" member). It was not stored or logged. Treat it as exposed: make a new key pair and paste only its public JWK.",
  members: 'The public JWK must have exactly three members: "kty", "crv" and "x".',
  "not an Ed25519 key": 'Only Ed25519 keys are accepted: "kty" must be "OKP" and "crv" must be "Ed25519".',
  "x encoding": '"x" must be 32 bytes in unpadded base64url (43 characters).',
  "x point": '"x" is not an acceptable Ed25519 public key (non-canonical, of small order, or not torsion-free). Make a new key pair.',
  "published test key": "That is a published test key, whose private half anyone has. Make a new key pair.",
};

const refuse = (refusal: BindingJwkRefusal): BindingJwkCheck => ({ ok: false, refusal, error: BINDING_JWK_ERRORS[refusal] });

/**
 * "At binding": the pasted JWK is exactly {kty: "OKP", crv: "Ed25519", x}.
 * A `d` member is refused before anything else is looked at; the caller
 * must neither store nor log the paste. `x` is 32 bytes, canonical, not of
 * small order and torsion-free, and not a published test key.
 */
export function checkBindingJwk(paste: unknown): BindingJwkCheck {
  if (typeof paste !== "string" || paste.length > BINDING_JWK_MAX_LENGTH) return refuse("not a JSON object");
  const parsed = parseStrictJson(paste.trim());
  if (!parsed.ok || !isJsonObject(parsed.value)) return refuse("not a JSON object");
  const jwk = parsed.value;
  if (Object.prototype.hasOwnProperty.call(jwk, "d")) return refuse("private key");
  if (!hasExactMembers(jwk, ["kty", "crv", "x"])) return refuse("members");
  if (jwk.kty !== "OKP" || jwk.crv !== "Ed25519") return refuse("not an Ed25519 key");
  if (typeof jwk.x !== "string") return refuse("x encoding");
  const publicKey = decodeStrictBase64url(jwk.x);
  if (!publicKey || publicKey.length !== 32) return refuse("x encoding");
  if (checkPoint(publicKey) !== "ok") return refuse("x point");
  const hex = Buffer.from(publicKey).toString("hex");
  if (PUBLISHED_TEST_KEYS_HEX.includes(hex)) return refuse("published test key");
  return { ok: true, x: jwk.x, publicKey, thumbprint: ed25519Thumbprint(jwk.x) };
}

/** The verification record kept with each signed act's event and returned
 *  with its answer. */
export const SIGNED_ACT_VERIFICATION = {
  alg: "Ed25519",
  key_resolution: "registered-thumbprint",
  preimage: "jws-signing-input",
  canonicalization: "none",
  checks: "RFC 8032 with R canonical, not of small order and torsion-free; @noble/curves 2.2.0 ed25519.verify with zip215: false",
  proves: "control of this key over these bytes; not identity, consent, or authority to act for anyone else",
} as const;
