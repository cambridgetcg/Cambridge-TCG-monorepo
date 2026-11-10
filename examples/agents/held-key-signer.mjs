#!/usr/bin/env node
/**
 * held-key-signer — reference signer for Cambridge TCG's agent-held signing
 * keys (docs/plans/agent-auth/held-keys.md). Node 20.19 or later, built-in
 * modules only: read it before you run it.
 *
 * What it does:
 *   keygen   Makes an Ed25519 key pair. Writes the private key, as PKCS#8
 *            PEM, to a new file created with mode 0600 (it never overwrites
 *            one), and prints only the public JWK and its RFC 7638
 *            thumbprint (the kid). The private key is never printed.
 *   public   Prints the public JWK and thumbprint of an existing key file.
 *   sign     Builds and signs one act (signer.check, key.mint or key.revoke)
 *            for an agent and an audience, valid 120 seconds, and prints it
 *            with the request body to send.
 *   preview  Prints the body that asks what an act does (no key needed).
 *
 * No network call is made unless you pass --submit, which POSTs to
 * <aud>/api/v1/agents/act (the REST twin of the MCP tool agent.act) and
 * follows no redirect: one is answered as no answer at all.
 *
 * The usage key a key.mint act adds is made here, from the CSPRNG
 * (ctcg_agt_ plus 22 base62 characters), and written to a second new 0600
 * file; only its SHA-256 and 12-character prefix are signed, and only the
 * prefix is printed. Treat it as usable only after an "applied" answer
 * whose prefix matches. With --submit this script checks that, and deletes
 * the file on any refusal; without --submit, that is yours to do.
 *
 * Usage:
 *   node held-key-signer.mjs keygen --key ./agent-signing-key.pem
 *   node held-key-signer.mjs public --key ./agent-signing-key.pem
 *   node held-key-signer.mjs sign --key K --agent <agent id> --act signer.check [--submit]
 *   node held-key-signer.mjs sign --key K --agent <agent id> --act key.mint --expires 90d \
 *        [--name laptop] --usage-key-out ./usage-key.txt (--preview-sha256 <hex> | --submit)
 *   node held-key-signer.mjs sign --key K --agent <agent id> --act key.revoke (--key-id <id> | --retire) [--submit]
 *   node held-key-signer.mjs preview --act key.mint [--submit]
 *
 *   --aud <origin>   The deployment the act is for. Default https://cambridgetcg.com.
 *                    An act signed for one deployment is refused by every other.
 *
 * What a signature proves: control of this key over these bytes. Not
 * identity, not consent, and no authority to act for anyone else. Whatever
 * steers a model that can read the key file can sign with it, so keep the
 * file where no model's tools can read it, and the key out of transcripts.
 * The path is closed on every deployment until its operator opens it; a
 * closed deployment answers signed_acts_closed.
 */

import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { closeSync, fchmodSync, openSync, readFileSync, statSync, unlinkSync, writeSync } from "node:fs";
import { parseArgs } from "node:util";

const DEFAULT_AUDIENCE = "https://cambridgetcg.com";
const TYP = "ctcg-act.v1";
const LIFETIME_SECONDS = 120;
const ACTS = ["signer.check", "key.mint", "key.revoke"];
const BASE62 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

const b64url = (bytes) => Buffer.from(bytes).toString("base64url");

function fail(message) {
  process.stderr.write(`held-key-signer: ${message}\n`);
  process.exit(1);
}

function note(message) {
  process.stderr.write(`${message}\n`);
}

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

/** Writes `text` to a new file only this user can read; never overwrites. */
function writeSecretFile(path, text) {
  let fd;
  try {
    fd = openSync(path, "wx", 0o600);
  } catch (error) {
    fail(error?.code === "EEXIST" ? `${path} already exists; not overwritten` : `cannot create ${path}`);
  }
  try {
    fchmodSync(fd, 0o600);
    writeSync(fd, text);
  } finally {
    closeSync(fd);
  }
}

function readPrivateKey(path) {
  if (!path) fail("--key <file> is required");
  let pem;
  try {
    if (process.platform !== "win32" && (statSync(path).mode & 0o077) !== 0) {
      fail(`${path} can be read by others; run chmod 600 on it first`);
    }
    pem = readFileSync(path, "utf8");
  } catch (error) {
    if (error?.code) fail(`cannot read ${path}`);
    throw error;
  }
  let key;
  try {
    key = createPrivateKey(pem);
  } catch {
    fail(`${path} is not a PEM private key`);
  }
  if (key.asymmetricKeyType !== "ed25519") fail(`${path} is not an Ed25519 private key`);
  return key;
}

/** The public JWK, exactly {kty, crv, x}, and its RFC 7638 thumbprint. */
function publicJwk(privateKey) {
  const { x } = createPublicKey(privateKey).export({ format: "jwk" });
  const jwk = { kty: "OKP", crv: "Ed25519", x };
  const kid = createHash("sha256").update(`{"crv":"Ed25519","kty":"OKP","x":"${x}"}`, "utf8").digest("base64url");
  return { jwk, kid };
}

/** ctcg_agt_ plus 22 base62 characters, without modulo bias. */
function newUsageKey() {
  let out = "";
  while (out.length < 22) {
    for (const byte of randomBytes(32)) {
      if (byte < 248 && out.length < 22) out += BASE62[byte % 62];
    }
  }
  return `ctcg_agt_${out}`;
}

function audience(value) {
  const aud = value ?? DEFAULT_AUDIENCE;
  let origin;
  try {
    origin = new URL(aud).origin;
  } catch {
    fail("--aud must be an origin such as https://cambridgetcg.com");
  }
  if (origin !== aud) fail("--aud must be an origin with nothing after it, such as https://cambridgetcg.com");
  return aud;
}

/** A compact JWS over the act. The signing input is signed as is; nothing
 *  is canonicalized, so the member order below is the order sent. */
function signAct(privateKey, kid, payload) {
  const header = { alg: "Ed25519", typ: TYP, kid };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const signature = sign(null, Buffer.from(signingInput, "ascii"), privateKey);
  return `${signingInput}.${b64url(signature)}`;
}

/** POSTs to the act door. A redirect is never followed: it would carry the
 *  act to, and take the answer from, wherever it points. It is an error, so
 *  the caller gets no answer. */
async function submit(aud, body) {
  const response = await fetch(`${aud}/api/v1/agents/act`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    redirect: "error",
  });
  let answer;
  try {
    answer = await response.json();
  } catch {
    answer = null;
  }
  return { status: response.status, answer };
}

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    key: { type: "string" },
    agent: { type: "string" },
    act: { type: "string" },
    aud: { type: "string" },
    expires: { type: "string" },
    name: { type: "string" },
    "usage-key-out": { type: "string" },
    "preview-sha256": { type: "string" },
    "key-id": { type: "string" },
    retire: { type: "boolean" },
    submit: { type: "boolean" },
  },
});

const command = positionals[0];

if (command === "keygen") {
  if (!values.key) fail("--key <file> is required: where to write the new private key");
  const { privateKey } = generateKeyPairSync("ed25519");
  writeSecretFile(values.key, privateKey.export({ type: "pkcs8", format: "pem" }));
  const { jwk, kid } = publicJwk(privateKey);
  note(`Private key written to ${values.key} (mode 0600). It is not printed; never paste it anywhere.`);
  note("Give the operator the public JWK below to paste at /account/agents, and compare the kid it shows.");
  print({ public_jwk: jwk, kid });
} else if (command === "public") {
  const { jwk, kid } = publicJwk(readPrivateKey(values.key));
  print({ public_jwk: jwk, kid });
} else if (command === "preview") {
  if (!ACTS.includes(values.act)) fail(`--act must be one of ${ACTS.join(", ")}`);
  const aud = audience(values.aud);
  const body = { act: null, preview: values.act };
  if (!values.submit) print({ url: `${aud}/api/v1/agents/act`, body });
  else print(await submit(aud, body));
} else if (command === "sign") {
  const privateKey = readPrivateKey(values.key);
  const { kid } = publicJwk(privateKey);
  const aud = audience(values.aud);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(values.agent ?? "")) {
    fail("--agent must be the agent's id (a lower-case UUID)");
  }
  if (!ACTS.includes(values.act)) fail(`--act must be one of ${ACTS.join(", ")}`);

  let params;
  let usageKey = null;
  if (values.act === "signer.check") {
    params = {};
  } else if (values.act === "key.revoke") {
    if (values.retire === (values["key-id"] !== undefined)) fail("key.revoke takes exactly one of --key-id <usage key id> and --retire");
    params = values.retire ? { kid } : { key_id: values["key-id"] };
  } else {
    if (!values.expires) fail("--expires is required for key.mint: 7d, 30d, 90d, 365d, never, or a date YYYY-MM-DD");
    if (!values["usage-key-out"]) fail("--usage-key-out <file> is required for key.mint: where to keep the new usage key");
    let previewSha256 = values["preview-sha256"];
    if (!previewSha256) {
      if (!values.submit) fail("--preview-sha256 is required without --submit: read the key.mint preview first");
      let preview;
      try {
        preview = await submit(aud, { act: null, preview: "key.mint" });
      } catch {
        fail("the key.mint preview was not available; nothing was signed");
      }
      if (preview.status !== 200 || typeof preview.answer?.disclosure_sha256 !== "string") {
        print(preview);
        fail("the key.mint preview was not available; nothing was signed");
      }
      note(`Disclosure ${preview.answer.disclosure_version}:\n${preview.answer.disclosure_text}\n`);
      previewSha256 = preview.answer.disclosure_sha256;
    }
    const token = newUsageKey();
    writeSecretFile(values["usage-key-out"], `${token}\n`);
    usageKey = { prefix: token.slice(0, 12), file: values["usage-key-out"] };
    params = {
      key_sha256: createHash("sha256").update(token, "utf8").digest("hex"),
      key_prefix: usageKey.prefix,
      expires: values.expires,
      name: values.name ?? "",
      preview_sha256: previewSha256,
    };
  }

  const iat = Math.floor(Date.now() / 1000);
  const payload = { aud, act: values.act, sub: values.agent, iat, exp: iat + LIFETIME_SECONDS, jti: b64url(randomBytes(16)), params };
  const jws = signAct(privateKey, kid, payload);
  const body = { act: jws, preview: null };
  const signed = {
    kid,
    act: values.act,
    expires_at: new Date(payload.exp * 1000).toISOString(),
    jws,
    url: `${aud}/api/v1/agents/act`,
    body,
    ...(usageKey ? { usage_key_prefix: usageKey.prefix, usage_key_file: usageKey.file } : {}),
  };

  if (!values.submit) {
    if (usageKey) {
      note(`Usage key written to ${usageKey.file} (mode 0600); only its prefix ${usageKey.prefix} is shown.`);
      note(`Use it only after an "applied" answer whose key.key_prefix is ${usageKey.prefix}. On any refusal, delete ${usageKey.file}.`);
    }
    print(signed);
  } else {
    let result;
    try {
      result = await submit(aud, body);
    } catch {
      if (usageKey) note(`Outcome unknown (no answer). Run signer.check: if ${usageKey.prefix} is not among usage_keys, delete ${usageKey.file}.`);
      fail("no answer from the deployment");
    }
    if (usageKey) {
      const applied = result.status === 200 && result.answer?.outcome === "applied" && result.answer?.key?.key_prefix === usageKey.prefix;
      if (applied) {
        note(`Minted. The usage key in ${usageKey.file} (prefix ${usageKey.prefix}) now authenticates.`);
      } else {
        unlinkSync(usageKey.file);
        note(`Not minted: ${usageKey.file} was deleted. Do not use that key.`);
      }
    }
    print({ kid, act: values.act, ...result });
  }
} else {
  fail("command must be keygen, public, sign or preview (read the header of this file)");
}
