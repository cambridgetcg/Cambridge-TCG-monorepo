#!/usr/bin/env tsx

import { execFile } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import {
  GITHUB_VERIFICATION_DESCRIPTOR,
  createGitHubVerificationDescriptor,
  type GitHubVerificationDescriptor,
} from "../src/lib/verification/github";
import {
  AuthVerifyInputError,
  AUTH_VERIFY_MAX_BODY_BYTES,
  formatStaticFailure,
  staticFailureStatus,
  formatVerificationReceipt,
  parseAuthVerifyArguments,
  runExplain,
  runJourney,
  runPreflight,
  type AuthVerifyDependencies,
  type GitHubVerificationDescriptorForRunner,
  type SafeHttpRequest,
} from "../src/lib/verification/runner";
import { runBrowserJourney } from "../src/lib/verification/browser-journey";
import {
  VERCEL_PROJECT_ID,
  VERCEL_PROJECT_NAME,
  VERCEL_TEAM_ID,
  createVercelAdapter,
  type VercelExecFile,
} from "../src/lib/verification/vercel-adapter";

const execFileAsync = promisify(execFile);
const SAFE_CLI_ENV = (source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv => ({
  HOME: source.HOME,
  LANG: source.LANG,
  NODE_ENV: source.NODE_ENV,
  LC_ALL: source.LC_ALL,
  LC_CTYPE: source.LC_CTYPE,
  PATH: source.PATH,
  TMPDIR: source.TMPDIR,
  USER: source.USER,
  XDG_CONFIG_HOME: source.XDG_CONFIG_HOME,
});
const AUTH_VERIFY_FILE_TIMEOUT_MS = 2_000;

/** Read one private JSON fixture without following links or trusting path metadata alone. */
export async function readBoundedFixtureJson(path: string): Promise<unknown> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const operation = (async () => {
    const before = await lstat(path);
    if (!before.isFile() || before.size > AUTH_VERIFY_MAX_BODY_BYTES) {
      throw new AuthVerifyInputError("config_fixture_not_approved");
    }

    const handle = await open(
      path,
      fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW | fsConstants.O_NONBLOCK,
    );
    try {
      const after = await handle.stat();
      if (!after.isFile()
        || after.dev !== before.dev
        || after.ino !== before.ino
        || after.size > AUTH_VERIFY_MAX_BODY_BYTES) {
        throw new AuthVerifyInputError("config_fixture_not_approved");
      }
      const bytes = Buffer.alloc(AUTH_VERIFY_MAX_BODY_BYTES + 1);
      let total = 0;
      while (total < bytes.length) {
        const result = await handle.read(bytes, total, bytes.length - total, total);
        if (result.bytesRead === 0) break;
        total += result.bytesRead;
      }
      if (total > AUTH_VERIFY_MAX_BODY_BYTES) {
        throw new AuthVerifyInputError("config_fixture_not_approved");
      }
      let text: string;
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, total));
        return JSON.parse(text) as unknown;
      } catch {
        throw new AuthVerifyInputError("config_fixture_not_approved");
      }
    } finally {
      await handle.close();
    }
  })();

  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new AuthVerifyInputError("tool_timeout")),
          AUTH_VERIFY_FILE_TIMEOUT_MS,
        );
      }),
    ]);
  } catch (error) {
    if (error instanceof AuthVerifyInputError) throw error;
    throw new AuthVerifyInputError("config_fixture_not_approved");
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

async function boundedResponseBody(response: Response): Promise<string> {
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null && (!/^\d+$/.test(contentLength) || Number(contentLength) > AUTH_VERIFY_MAX_BODY_BYTES)) {
    throw new AuthVerifyInputError("tool_limit_reached");
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let body = "";
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      body += decoder.decode(next.value, { stream: true });
      if (body.length > AUTH_VERIFY_MAX_BODY_BYTES) {
        await reader.cancel();
        throw new AuthVerifyInputError("tool_limit_reached");
      }
    }
    body += decoder.decode();
    return body;
  } finally {
    reader.releaseLock();
  }
}

async function request(request: SafeHttpRequest) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), request.timeoutMs);
  try {
    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      redirect: request.redirect,
      signal: controller.signal,
      cache: "no-store",
    });
    const headers: Record<string, string | undefined> = {};
    for (const [name, value] of response.headers) headers[name.toLowerCase()] = value;
    const setCookies = typeof (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie === "function"
      ? (response.headers as Headers & { getSetCookie: () => string[] }).getSetCookie()
      : [];
    return Object.freeze({
      status: response.status,
      headers: Object.freeze(headers),
      ...(setCookies.length ? { setCookies: Object.freeze(setCookies) } : {}),
      body: await boundedResponseBody(response),
    });
  } catch (error) {
    if (error instanceof AuthVerifyInputError) throw error;
    throw new AuthVerifyInputError("tool_unavailable");
  } finally {
    clearTimeout(timeout);
  }
}

function normalizedOrigin(value: string): string {
  // Arguments have already passed strict origin validation. Canonicalize once so
  // descriptor target selection and the runner receive identical authority.
  return new URL(value).origin;
}

function runnerDescriptor(
  descriptor: GitHubVerificationDescriptor,
  base: string,
): GitHubVerificationDescriptorForRunner {
  const normalizedBase = normalizedOrigin(base);
  const productionOrigins = descriptor.origins
    .filter((origin) => origin.environment === "production")
    .map((origin) => origin.origin);
  // www is a known same-site production alias even if an older descriptor has
  // not enumerated it. Other public origins remain unapproved by default.
  if (!productionOrigins.includes("https://www.cambridgetcg.com" as never)) {
    productionOrigins.push("https://www.cambridgetcg.com" as never);
  }
  const approvedStagingOrigins = descriptor.origins
    .filter((origin) => origin.environment === "staging")
    .map((origin) => origin.origin);
  return Object.freeze({
    providerId: "github",
    callbackPath: descriptor.callbackPath,
    minimumScopes: descriptor.minimumScopes,
    expectedAuthorizationEndpoint: descriptor.expectedAuthorizationEndpoint,
    productionOrigins: Object.freeze(productionOrigins),
    approvedStagingOrigins: Object.freeze(approvedStagingOrigins),
    // This pilot is bound to fixed Vercel IDs. No CLI flag or linked working
    // directory can redirect operator reads to another project or team.
    vercel: Object.freeze({
      projectId: VERCEL_PROJECT_ID,
      projectName: VERCEL_PROJECT_NAME,
      teamId: VERCEL_TEAM_ID,
      target: productionOrigins.includes(normalizedBase as never) ? "production" : "preview",
    }),
  });
}

const vercelExecFile: VercelExecFile = async (file, args, options) => {
  const result = await execFileAsync(file, [...args], options);
  return { stdout: result.stdout };
};

const vercelAdapter = createVercelAdapter({
  execFile: vercelExecFile,
  env: SAFE_CLI_ENV(),
});

async function writeReceipt(path: string, receipt: unknown): Promise<void> {
  try {
    const handle = await open(path, "wx", 0o600);
    try {
      await handle.writeFile(`${JSON.stringify(receipt)}\n`, "utf8");
    } finally {
      await handle.close();
    }
  } catch {
    throw new AuthVerifyInputError("tool_unavailable");
  }
}

async function loadFixtureForDescriptor(path: string): Promise<Readonly<{
  descriptor: GitHubVerificationDescriptor;
  fixture: unknown;
}>> {
  const raw = await readBoundedFixtureJson(path);
  const fixture = asRecord(raw);
  // The runner repeats full fixture validation. This narrow read just lets the
  // contract bind the explicit approved origin before any browser is launched.
  if (!fixture || typeof fixture.origin !== "string") {
    throw new AuthVerifyInputError("config_fixture_not_approved");
  }
  try {
    if (fixture.dedicatedTestData !== true) throw new AuthVerifyInputError("config_fixture_not_approved");
    return Object.freeze({
      descriptor: createGitHubVerificationDescriptor({
        staging: { origin: fixture.origin, dedicatedTestData: true, previewDeploymentConfirmed: true },
      }),
      fixture: raw,
    });
  } catch {
    throw new AuthVerifyInputError("config_fixture_not_approved");
  }
}

async function defaultDependencies(
  preloadedFixture?: Readonly<{ path: string; fixture: unknown }>,
): Promise<AuthVerifyDependencies> {
  return {
    request,
    readFixture: async (path) => preloadedFixture?.path === path
      ? preloadedFixture.fixture
      : readBoundedFixtureJson(path),
    journeyEvidence: "live_observed",
    runJourney: async (fixture) => {
      const { chromium } = await import("@playwright/test");
      return runBrowserJourney(fixture, { launcher: chromium });
    },
    readVercelMetadata: vercelAdapter.readVercelMetadata,
    readVercelLogs: vercelAdapter.readVercelLogs,
  };
}

export function formatAuthVerifyHelp(): string {
  return [
    "Usage: pnpm --silent auth:verify github --mode <preflight|journey|explain> --base <origin> [flags]",
    "",
    "Setup: GitHub OAuth App client ID + client secret, not a GitHub App/RSA private key.",
    `  Runtime variables: ${GITHUB_VERIFICATION_DESCRIPTOR.credentials.map(credential => credential.name).join(" + ")} (server-side only).`,
    `  Register: ${GITHUB_VERIFICATION_DESCRIPTOR.officialSetupUrls[0]}`,
    `  Callback: <approved-origin>${GITHUB_VERIFICATION_DESCRIPTOR.callbackPath}`,
    `  Scopes: ${GITHUB_VERIFICATION_DESCRIPTOR.minimumScopes.join(" ")}`,
    "  Keep secrets out of arguments, fixtures, reports and chat. Environment changes require a new deployment.",
    "",
    "preflight: GET-only by default; --probe-redirect permits same-origin OAuth initiation only and stops before GitHub.",
    "  production additionally requires --allow-production; --vercel-metadata reads bounded metadata only.",
    "  --operator-declared-github-app records the reviewed OAuth App/callback declaration; it is not introspected.",
    "journey: requires --fixture <private JSON> --allow-test-account-effects; production is forbidden.",
    "  fixture fields: origin, environment:\"staging\", scenario, dedicatedTestData:true, expectedCtcgUserId; expectedPublicErrorCode:\"access_denied\" required for expected_denial; protectedSurfacePath optional.",
    "  possible effects: dedicated test-account provider link, session, and logout; no automatic unlink or account deletion.",
    "explain: requires --attempt <UUID>; production additionally requires --allow-production; reads only bounded matching structured Vercel events for the fixed project/target.",
    "common: --json; --receipt <new path> (exclusive create; no overwrite); --help|-h.",
  ].join("\n");
}

function staticCodeForError(error: unknown): AuthVerifyInputError["code"] {
  if (error instanceof AuthVerifyInputError) return error.code;
  const code = typeof error === "object" && error !== null && "code" in error
    && typeof error.code === "string"
    ? error.code
    : null;
  if (code === "ENOENT" || code === "EACCES" || code === "EPERM") return "tool_unavailable";
  if (code === "ETIMEDOUT" || code === "ABORT_ERR") return "tool_timeout";
  return "verification_internal_error";
}

/** The optional dependency seam is test-only; no CLI flag can replace transport. */
export async function main(
  argv: readonly string[] = process.argv.slice(2),
  injectedDependencies?: AuthVerifyDependencies,
): Promise<number> {
  if ((argv.length === 1 && (argv[0] === "--help" || argv[0] === "-h"))
    || (argv.length === 2 && argv[0] === "github" && (argv[1] === "--help" || argv[1] === "-h"))) {
    process.stdout.write(`${formatAuthVerifyHelp()}\n`);
    return 0;
  }
  try {
    const parsedOptions = parseAuthVerifyArguments(argv);
    const options = Object.freeze({ ...parsedOptions, base: normalizedOrigin(parsedOptions.base) });
    const loadedFixture = options.mode === "journey" && options.fixturePath
      ? await loadFixtureForDescriptor(options.fixturePath)
      : null;
    const githubDescriptor = loadedFixture?.descriptor ?? GITHUB_VERIFICATION_DESCRIPTOR;
    const descriptor = runnerDescriptor(githubDescriptor, options.base);
    const dependencies = injectedDependencies ?? await defaultDependencies(
      loadedFixture && options.fixturePath
        ? { path: options.fixturePath, fixture: loadedFixture.fixture }
        : undefined,
    );
    if (options.mode === "preflight") {
      const result = await runPreflight(options, descriptor, dependencies);
      if (options.receiptPath) await writeReceipt(options.receiptPath, result);
      process.stdout.write(options.json ? `${JSON.stringify(result)}\n` : `${formatVerificationReceipt(result)}\n`);
      return result.checks.every((check) => check.status === "passed") ? 0 : 2;
    }
    if (options.mode === "journey") {
      const result = await runJourney(options, descriptor, dependencies);
      if (options.receiptPath) await writeReceipt(options.receiptPath, result);
      process.stdout.write(options.json ? `${JSON.stringify(result)}\n` : `${formatVerificationReceipt(result)}\n`);
      return result.checks.every((check) => check.status === "passed") ? 0 : 2;
    }
    const result = await runExplain(options, descriptor, dependencies);
    if (options.receiptPath) await writeReceipt(options.receiptPath, result.receipt);
    if (options.json) {
      process.stdout.write(`${JSON.stringify({ receipt: result.receipt, remediations: result.remediations })}\n`);
    } else {
      process.stdout.write(`${formatVerificationReceipt(result.receipt)}${result.remediations.length ? `\n${result.remediations.map((item) => `- ${item}`).join("\n")}` : ""}\n`);
    }
    return result.receipt.checks.every((check) => check.status === "passed") ? 0 : 2;
  } catch (error) {
    const code = staticCodeForError(error);
    // Parse failures precede an options object, so detect only the static flag
    // token and never echo any neighbouring untrusted input or raw error.
    if (argv.includes("--json")) {
      process.stdout.write(`${JSON.stringify({ status: staticFailureStatus(code), code })}\n`);
    } else {
      process.stdout.write(`${formatStaticFailure(code)}\n`);
    }
    return 3;
  }
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && import.meta.url === pathToFileURL(invokedPath).href) {
  void main().then((exitCode) => { process.exitCode = exitCode; });
}
