/**
 * End-to-end role path with the real libraries: credentials.ts →
 * @vercel/oidc-aws-credentials-provider → @vercel/oidc (token from the Vercel
 * request-context header) → the AWS SDK's STS AssumeRoleWithWebIdentity call.
 *
 * Nothing is mocked except the far end: STS is a local HTTP server on
 * 127.0.0.1, reached through AWS_ENDPOINT_URL_STS (and AWS_ENDPOINT_URL as a
 * backstop, so no request can reach a real AWS endpoint).
 */

import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const ROLE_ARN = "arn:aws:iam::000000000000:role/fake-role-for-tests";
const REQUEST_CONTEXT = Symbol.for("@vercel/request-context");

interface StsCall {
  path: string;
  params: URLSearchParams;
}

const stsCalls: StsCall[] = [];
let stsEndpoint = "";
let server: http.Server;

/** Unsigned JWT-shaped token; @vercel/oidc only reads `exp`, STS here is fake. */
function fakeOidcToken(): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const payload = {
    iss: "https://oidc.vercel.com/fake-team",
    aud: "https://vercel.com/fake-team",
    sub: "owner:fake-team:project:fake-project:environment:production",
    exp: Math.floor(Date.now() / 1000) + 3600,
  };
  return `${encode({ alg: "none", typ: "JWT" })}.${encode(payload)}.fake-signature`;
}

function stsResponse(): string {
  const expiration = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  return `<AssumeRoleWithWebIdentityResponse xmlns="https://sts.amazonaws.com/doc/2011-06-15/">
  <AssumeRoleWithWebIdentityResult>
    <Credentials>
      <AccessKeyId>ASIAFAKESTSFORTESTS</AccessKeyId>
      <SecretAccessKey>fake-sts-secret</SecretAccessKey>
      <SessionToken>fake-sts-session-token</SessionToken>
      <Expiration>${expiration}</Expiration>
    </Credentials>
    <SubjectFromWebIdentityToken>owner:fake-team:project:fake-project:environment:production</SubjectFromWebIdentityToken>
    <AssumedRoleUser>
      <Arn>arn:aws:sts::000000000000:assumed-role/fake-role-for-tests/cambridgetcg-production</Arn>
      <AssumedRoleId>AROAFAKEFORTESTS:cambridgetcg-production</AssumedRoleId>
    </AssumedRoleUser>
  </AssumeRoleWithWebIdentityResult>
  <ResponseMetadata><RequestId>00000000-0000-0000-0000-000000000000</RequestId></ResponseMetadata>
</AssumeRoleWithWebIdentityResponse>`;
}

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      stsCalls.push({ path: req.url ?? "", params: new URLSearchParams(body) });
      res.writeHead(200, { "content-type": "text/xml" });
      res.end(stsResponse());
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  stsEndpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

let token = "";

beforeEach(() => {
  stsCalls.length = 0;
  token = fakeOidcToken();
  const missing = path.join(os.tmpdir(), "cambridge-tcg-aws-test-no-such-file");
  for (const name of [
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "AWS_SESSION_TOKEN",
    "AWS_PROFILE",
    "AWS_WEB_IDENTITY_TOKEN_FILE",
    "AWS_ROLE_SESSION_NAME",
    "VERCEL_OIDC_TOKEN",
    "VERCEL_REGION",
    "AWS_LAMBDA_FUNCTION_NAME",
    "AWS_OIDC_ALLOW_STATIC_FALLBACK",
  ]) {
    vi.stubEnv(name, "");
  }
  vi.stubEnv("AWS_CONFIG_FILE", missing);
  vi.stubEnv("AWS_SHARED_CREDENTIALS_FILE", missing);
  vi.stubEnv("AWS_ENDPOINT_URL_STS", stsEndpoint);
  vi.stubEnv("AWS_ENDPOINT_URL", stsEndpoint);
  vi.stubEnv("AWS_REGION", "us-east-1");
  vi.stubEnv("VERCEL", "1");
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("AWS_ROLE_ARN", ROLE_ARN);
  // What the Vercel runtime installs: per-request headers, including the token.
  (globalThis as Record<symbol, unknown>)[REQUEST_CONTEXT] = {
    get: () => ({ headers: { "x-vercel-oidc-token": token } }),
  };
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.resetModules();
});

afterEach(() => {
  delete (globalThis as Record<symbol, unknown>)[REQUEST_CONTEXT];
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("role path against a local fake STS (real Vercel + AWS libraries)", () => {
  it("sends the request-header token to AssumeRoleWithWebIdentity and signs with the session", async () => {
    const { ROLE_CREDENTIAL_REFRESH_MARGIN_SECONDS } = await import("./credentials");
    const { createS3Client, getPresignedUploadUrl } = await import("./s3");

    const client = createS3Client();
    expect(client).not.toBeNull();
    const before = Date.now();
    const credentials = await client!.config.credentials();

    expect(stsCalls).toHaveLength(1);
    const { params } = stsCalls[0];
    expect(params.get("Action")).toBe("AssumeRoleWithWebIdentity");
    expect(params.get("RoleArn")).toBe(ROLE_ARN);
    expect(params.get("RoleSessionName")).toBe("cambridgetcg-production");
    expect(params.get("WebIdentityToken")).toBe(token);

    expect(credentials.accessKeyId).toBe("ASIAFAKESTSFORTESTS");
    expect(credentials.sessionToken).toBe("fake-sts-session-token");
    // Reported 15 min early: the one-hour session shows as ~45 min.
    const reportedSeconds = (credentials.expiration!.getTime() - before) / 1000;
    expect(reportedSeconds).toBeLessThanOrEqual(3600 - ROLE_CREDENTIAL_REFRESH_MARGIN_SECONDS + 5);
    expect(reportedSeconds).toBeGreaterThan(3600 - ROLE_CREDENTIAL_REFRESH_MARGIN_SECONDS - 60);

    const upload = await getPresignedUploadUrl({
      bucket: "private-test-bucket",
      key: "verifications/test/probe.jpg",
      contentType: "image/jpeg",
    });
    const url = new URL(upload.uploadUrl);
    expect(url.searchParams.get("X-Amz-Credential")).toMatch(/^ASIAFAKESTSFORTESTS\//);
    expect(url.searchParams.get("X-Amz-Security-Token")).toBe("fake-sts-session-token");
    // Memoized: the presign reused the session, no second STS call.
    expect(stsCalls).toHaveLength(1);
  });

  it("fails on first use, without touching static keys, when the request has no token", async () => {
    (globalThis as Record<symbol, unknown>)[REQUEST_CONTEXT] = { get: () => ({ headers: {} }) };
    vi.stubEnv("AWS_ACCESS_KEY_ID", "static-key-should-not-be-used");
    vi.stubEnv("AWS_SECRET_ACCESS_KEY", "static-secret-should-not-be-used");
    const { createSESClient } = await import("./ses");

    const client = createSESClient();
    expect(client).not.toBeNull();

    // With no header, @vercel/oidc tries a local `vc link` refresh: it walks up
    // from process.cwd() for `.vercel/` and could then call the Vercel API with
    // the developer's CLI login. Make that walk fail so the test stays offline.
    const cwd = vi.spyOn(process, "cwd").mockImplementation(() => {
      throw new Error("process.cwd blocked in this test");
    });
    try {
      await expect(client!.config.credentials()).rejects.toThrow(/x-vercel-oidc-token/);
    } finally {
      cwd.mockRestore();
    }
    expect(stsCalls).toHaveLength(0);
  });
});
