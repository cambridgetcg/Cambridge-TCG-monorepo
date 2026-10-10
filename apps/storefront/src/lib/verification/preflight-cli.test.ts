import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { expect, it } from "vitest";
import { parseVerificationReceipt, summarizeVerificationReceipt } from "./contract";

const execute = promisify(execFile);
const require = createRequire(import.meta.url);
const appDirectory = fileURLToPath(new URL("../../../", import.meta.url));

it.each([false, true])("runs the actual CLI against a strict local CSRF fixture (redirect probe: %s)", async (probeRedirect) => {
  const directory = await mkdtemp(join(tmpdir(), "ctcg-auth-preflight-"));
  const csrfCanary = "CSRF_VALUE_MUST_NOT_APPEAR_IN_RECEIPT";
  let origin = "";
  let posts = 0;
  let discoveries = 0;
  let cookieMatched = false;
  const server = createServer(async (request, response) => {
    if (request.url === "/api/auth/providers" && request.method === "GET") {
      discoveries += 1;
      response.writeHead(200, {
        "Content-Type": "application/json",
        "x-ctcg-verification-version": "github-oauth/1",
        "x-ctcg-deployment-id": "dpl_localfixture",
        "x-ctcg-commit-sha": "0123456789012345678901234567890123456789",
      });
      response.end(JSON.stringify({ github: { id: "github", type: "oauth" } }));
      return;
    }
    if (request.url === "/api/auth/csrf" && request.method === "GET") {
      response.writeHead(200, {
        "Content-Type": "application/json",
        "Set-Cookie": [
          `authjs.csrf-token=${csrfCanary}; Path=/; HttpOnly; SameSite=Lax`,
          "authjs.callback-url=fixture; Path=/; Expires=Wed, 01 Jan 2031 00:00:00 GMT; HttpOnly",
        ],
      });
      response.end(JSON.stringify({ csrfToken: csrfCanary }));
      return;
    }
    if (request.url === "/api/auth/signin/github" && request.method === "POST") {
      posts += 1;
      let body = "";
      for await (const chunk of request) body += chunk;
      const fields = new URLSearchParams(body);
      cookieMatched = fields.get("csrfToken") === csrfCanary
        && (request.headers.cookie ?? "").includes(`authjs.csrf-token=${csrfCanary}`)
        && (request.headers.cookie ?? "").includes("authjs.callback-url=fixture");
      const authorization = new URL("https://github.com/login/oauth/authorize");
      authorization.searchParams.set("scope", "read:user user:email");
      authorization.searchParams.set("redirect_uri", `${origin}/api/auth/callback/github`);
      authorization.searchParams.set("state", "OAUTH_STATE_MUST_NOT_APPEAR_IN_RECEIPT");
      response.writeHead(302, {
        Location: cookieMatched ? authorization.href : `${origin}/login?error=MissingCSRF`,
      });
      response.end();
      return;
    }
    response.writeHead(404).end();
  });

  try {
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Fixture did not bind");
    origin = `http://127.0.0.1:${address.port}`;
    const guard = join(directory, "local-only.mjs");
    await writeFile(guard, `
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
const origin = process.env.CTCG_PREFLIGHT_TEST_ORIGIN;
const realFetch = globalThis.fetch;
globalThis.fetch = (input, options) => {
  const url = new URL(typeof input === "string" ? input : input.url ?? input.href);
  if (url.origin !== origin || !["manual", "error"].includes(options?.redirect)) {
    throw new Error("External or automatically followed fixture request forbidden");
  }
  return realFetch(input, options);
};
childProcess.execFile = () => { throw new Error("External operator tools forbidden in fixture"); };
syncBuiltinESMExports();
`, { mode: 0o600, flag: "wx" });

    const result = await execute(process.execPath, [
      "--import", pathToFileURL(require.resolve("tsx")).href,
      "--import", pathToFileURL(guard).href,
      join(appDirectory, "scripts/verify-auth-provider.ts"),
      "github", "--mode", "preflight", "--base", origin,
      ...(probeRedirect ? ["--probe-redirect"] : []), "--json",
    ], {
      cwd: appDirectory,
      timeout: 30_000,
      maxBuffer: 128 * 1024,
      env: {
        PATH: process.env.PATH, HOME: directory, TMPDIR: directory,
        NODE_ENV: "test", CTCG_PREFLIGHT_TEST_ORIGIN: origin,
      },
    }).then(
      output => ({ code: 0, stdout: output.stdout }),
      (error: { code?: unknown; stdout?: unknown }) => ({
        code: typeof error.code === "number" ? error.code : -1,
        stdout: typeof error.stdout === "string" ? error.stdout : "",
      }),
    );

    // No operator declaration was supplied. The actual local probe succeeds,
    // while the receipt correctly remains incomplete rather than claiming OAuth.
    expect(result.code).toBe(2);
    const receipt = parseVerificationReceipt(JSON.parse(result.stdout));
    expect(receipt).not.toBeNull();
    expect(cookieMatched).toBe(probeRedirect);
    expect(posts).toBe(probeRedirect ? 1 : 0);
    expect(discoveries).toBe(2);
    expect(receipt!.checks.find(check => check.name === "authorization_request")?.status).toBe(probeRedirect ? "passed" : "blocked");
    expect(receipt!.checks.find(check => check.name === "requested_scopes")?.status).toBe(probeRedirect ? "passed" : "blocked");
    expect(summarizeVerificationReceipt(receipt!).positiveJourneyVerified).toBe(false);
    expect(summarizeVerificationReceipt(receipt!).incomplete).toBe(true);
    expect(result.stdout).not.toContain(csrfCanary);
    expect(result.stdout).not.toContain("OAUTH_STATE_MUST_NOT_APPEAR_IN_RECEIPT");
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
}, 40_000);
