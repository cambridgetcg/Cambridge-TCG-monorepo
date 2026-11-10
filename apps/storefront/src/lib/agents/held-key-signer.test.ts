import { execFile, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { currentDisclosure, disclosureSha256 } from "./signed-act-disclosures";
import { checkBindingJwk, parseSignedAct, verifyActSignature } from "./signed-act-verify";

// The reference signer (examples/agents/held-key-signer.mjs), run as a
// builder would run it: a fresh key pair in a temporary directory, no
// --submit, so no network call. Its acts must pass the store's own parse
// and verify, and neither private half may reach its output.

const SIGNER = resolve(process.cwd(), "../../examples/agents/held-key-signer.mjs");
// Loaded before the signer: any fetch would throw, so a command that
// succeeds made no network call.
const NO_NETWORK = "data:text/javascript,globalThis.fetch=()=>{throw new Error('network call without --submit')}";
const AUD = "https://cambridgetcg.com";
const AGENT = "6f1c2a90-3b7e-4d21-9a55-0c8e4b7d2f13";

let dir: string;
let keyFile: string;
let keygen: { stdout: string; stderr: string; out: { public_jwk: Record<string, string>; kid: string } };

function run(args: string[]): { stdout: string; stderr: string } {
  const stdout = execFileSync(process.execPath, ["--import", NO_NETWORK, SIGNER, ...args], { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return { stdout, stderr: "" };
}

function runWithStderr(args: string[]): { stdout: string; stderr: string; status: number } {
  try {
    const stdout = execFileSync(process.execPath, ["--import", NO_NETWORK, SIGNER, ...args], { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { stdout, stderr: "", status: 0 };
  } catch (error) {
    const failed = error as { stdout: string; stderr: string; status: number };
    return { stdout: failed.stdout, stderr: failed.stderr, status: failed.status };
  }
}

/** The PEM body of the private key, to look for in any output. */
function privateKeyBody(): string {
  return readFileSync(keyFile, "utf8").replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "held-key-signer-"));
  keyFile = join(dir, "agent-signing-key.pem");
  const { stdout } = run(["keygen", "--key", keyFile]);
  keygen = { stdout, stderr: "", out: JSON.parse(stdout) };
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

function signedAct(args: string[]) {
  const { stdout } = run(["sign", "--key", keyFile, "--agent", AGENT, ...args]);
  const out = JSON.parse(stdout);
  const parsed = parseSignedAct(out.jws, AUD);
  if (!parsed.ok) throw new Error(`refused: ${parsed.detail}`);
  return { out, stdout, act: parsed.act };
}

describe("held-key-signer", () => {
  it("writes the private key to a new 0600 file and prints only the public JWK and its thumbprint", () => {
    expect(statSync(keyFile).mode & 0o777).toBe(0o600);
    const { public_jwk: jwk, kid } = keygen.out;
    expect(Object.keys(jwk)).toEqual(["kty", "crv", "x"]);
    // The store would bind it, under the same thumbprint.
    const binding = checkBindingJwk(JSON.stringify(jwk));
    expect(binding).toMatchObject({ ok: true, thumbprint: kid });
    expect(keygen.stdout).not.toContain(privateKeyBody());
    expect(keygen.stdout).not.toMatch(/"d"|PRIVATE KEY/);
    // It never overwrites a key file.
    const again = runWithStderr(["keygen", "--key", keyFile]);
    expect(again.status).toBe(1);
    expect(again.stderr).toContain("already exists; not overwritten");
    expect(run(["public", "--key", keyFile]).stdout).toBe(keygen.stdout);
  });

  it("signs a signer.check that the store parses and verifies", () => {
    const { out, act, stdout } = signedAct(["--act", "signer.check"]);
    const { publicKey } = checkBindingJwk(JSON.stringify(keygen.out.public_jwk)) as { publicKey: Uint8Array };

    expect(verifyActSignature(act, publicKey)).toBe(true);
    expect(act.header).toEqual({ alg: "Ed25519", typ: "ctcg-act.v1", kid: keygen.out.kid });
    expect(act.payload).toMatchObject({ aud: AUD, act: "signer.check", sub: AGENT, params: {} });
    expect(act.payload.exp - act.payload.iat).toBe(120);
    expect(out.body).toEqual({ act: out.jws, preview: null });
    expect(out.url).toBe(`${AUD}/api/v1/agents/act`);
    expect(stdout).not.toContain(privateKeyBody());
    // A second act carries a fresh jti.
    expect(signedAct(["--act", "signer.check"]).act.payload.jti).not.toBe(act.payload.jti);
  });

  it("signs a key.mint over a usage key it keeps in a 0600 file, printing only the prefix", () => {
    const preview = disclosureSha256(currentDisclosure("key.mint").text);
    const usageFile = join(dir, "usage-key.txt");
    const { out, act, stdout } = signedAct([
      "--act", "key.mint", "--expires", "90d", "--name", "laptop", "--usage-key-out", usageFile, "--preview-sha256", preview,
    ]);
    const { publicKey } = checkBindingJwk(JSON.stringify(keygen.out.public_jwk)) as { publicKey: Uint8Array };
    const token = readFileSync(usageFile, "utf8").trim();

    expect(verifyActSignature(act, publicKey)).toBe(true);
    expect(statSync(usageFile).mode & 0o777).toBe(0o600);
    expect(token).toMatch(/^ctcg_agt_[A-Za-z0-9]{22}$/);
    expect(act.payload.params).toEqual({
      key_sha256: createHash("sha256").update(token, "utf8").digest("hex"),
      key_prefix: token.slice(0, 12),
      expires: "90d",
      name: "laptop",
      preview_sha256: preview,
    });
    expect(out.usage_key_prefix).toBe(token.slice(0, 12));
    expect(stdout).not.toContain(token);
  });

  it("refuses key.mint without a disclosure digest, offline", () => {
    const result = runWithStderr([
      "sign", "--key", keyFile, "--agent", AGENT, "--act", "key.mint", "--expires", "90d", "--usage-key-out", join(dir, "unused.txt"),
    ]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("--preview-sha256 is required without --submit");
  });

  it("signs key.revoke for a usage key or to retire the signing key itself", () => {
    const { publicKey } = checkBindingJwk(JSON.stringify(keygen.out.public_jwk)) as { publicKey: Uint8Array };
    const usage = signedAct(["--act", "key.revoke", "--key-id", "0b9e7c2a-1d4f-4e8b-9a3c-5f6d7e8f9a0b"]);
    const retire = signedAct(["--act", "key.revoke", "--retire"]);

    expect(verifyActSignature(usage.act, publicKey)).toBe(true);
    expect(usage.act.payload.params).toEqual({ key_id: "0b9e7c2a-1d4f-4e8b-9a3c-5f6d7e8f9a0b" });
    expect(verifyActSignature(retire.act, publicKey)).toBe(true);
    expect(retire.act.payload.params).toEqual({ kid: keygen.out.kid });
  });

  it("signs for the audience it is given, which another deployment refuses", () => {
    const { stdout } = run(["sign", "--key", keyFile, "--agent", AGENT, "--act", "signer.check", "--aud", "https://preview.example.test"]);
    const { jws } = JSON.parse(stdout);
    expect(parseSignedAct(jws, "https://preview.example.test").ok).toBe(true);
    expect(parseSignedAct(jws, AUD)).toMatchObject({ ok: false });
  });

  it("uses Node's built-in modules only, and fetches only in submit", () => {
    const source = readFileSync(SIGNER, "utf8");
    const imports = [...source.matchAll(/^import .* from "([^"]+)";$/gm)].map((match) => match[1]);
    expect(imports.length).toBeGreaterThan(0);
    expect(imports.every((name) => name.startsWith("node:"))).toBe(true);
    expect(source.match(/fetch\(/g)).toHaveLength(1);
    expect(source).toMatch(/async function submit\(aud, body\) \{\n\s+const response = await fetch\(/);
    // And the preview command, offline, prints the body instead of sending it.
    expect(JSON.parse(run(["preview", "--act", "key.mint"]).stdout)).toEqual({
      url: `${AUD}/api/v1/agents/act`,
      body: { act: null, preview: "key.mint" },
    });
  });

  describe("with --submit, against a local stand-in for the act door", () => {
    let server: Server;
    let origin: string;
    let mintAnswer: (params: Record<string, string>) => { status: number; body: unknown };
    const received: { act: string | null; preview: string | null }[] = [];
    const preview = disclosureSha256(currentDisclosure("key.mint").text);

    beforeAll(async () => {
      server = createServer((request, response) => {
        let text = "";
        request.on("data", (chunk) => (text += chunk));
        request.on("end", () => {
          const body = JSON.parse(text) as { act: string | null; preview: string | null };
          received.push(body);
          let answer: { status: number; body: unknown };
          if (request.url !== "/api/v1/agents/act") answer = { status: 404, body: {} };
          else if (body.preview) answer = { status: 200, body: { preview: body.preview, disclosure_version: "key.mint/test", disclosure_text: "test disclosure", disclosure_sha256: preview } };
          else {
            const parsed = parseSignedAct(body.act, origin);
            answer = parsed.ok ? mintAnswer(parsed.act.payload.params) : { status: 400, body: { refusal: { reason_code: "act_malformed" } } };
          }
          response.writeHead(answer.status, { "Content-Type": "application/json" });
          response.end(JSON.stringify(answer.body));
        });
      });
      await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
      origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });

    afterAll(() => new Promise<void>((done) => server.close(() => done())));

    const submitMint = (usageFile: string) =>
      promisify(execFile)(
        process.execPath,
        [SIGNER, "sign", "--key", keyFile, "--agent", AGENT, "--act", "key.mint", "--expires", "30d", "--usage-key-out", usageFile, "--aud", origin, "--submit"],
        { cwd: dir, encoding: "utf8" },
      );

    it("reads the preview, then keeps the usage key only after an applied answer with its prefix", async () => {
      mintAnswer = (params) => ({ status: 200, body: { act: "key.mint", outcome: "applied", key: { key_prefix: params.key_prefix } } });
      const usageFile = join(dir, "kept.txt");
      const { stdout } = await submitMint(usageFile);

      expect(received.at(-2)).toEqual({ act: null, preview: "key.mint" });
      expect(JSON.parse(stdout)).toMatchObject({ act: "key.mint", status: 200, answer: { outcome: "applied" } });
      expect(existsSync(usageFile)).toBe(true);
      expect(stdout).not.toContain(readFileSync(usageFile, "utf8").trim());
    });

    it("deletes the usage key on a refusal, and on an applied answer with another prefix", async () => {
      mintAnswer = () => ({ status: 409, body: { error: "cap", refusal: { reason_code: "key_cap_reached" } } });
      const refusedFile = join(dir, "refused.txt");
      const refused = await submitMint(refusedFile);
      expect(JSON.parse(refused.stdout)).toMatchObject({ status: 409 });
      expect(refused.stderr).toContain(`Not minted: ${refusedFile} was deleted`);
      expect(existsSync(refusedFile)).toBe(false);

      mintAnswer = () => ({ status: 200, body: { act: "key.mint", outcome: "applied", key: { key_prefix: "ctcg_agt_zzz" } } });
      const mismatchFile = join(dir, "mismatch.txt");
      await submitMint(mismatchFile);
      expect(existsSync(mismatchFile)).toBe(false);
    });
  });
});
