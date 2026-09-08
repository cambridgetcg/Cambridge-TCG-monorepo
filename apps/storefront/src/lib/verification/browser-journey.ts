import {
  AUTH_COMPLETION_HEADER,
  AUTH_COMPLETION_OBSERVED,
  SUPPORT_ID_HEADER,
  isSupportId,
} from "./events";

export type BrowserJourneyScenario = "positive_login" | "expected_denial";
/** Auth.js's bounded public code; it does not identify an internal policy branch. */
export type ExpectedPublicErrorCode = "access_denied";

export interface BrowserJourneyFixture {
  readonly origin: string;
  readonly scenario: BrowserJourneyScenario;
  /** Required for a negative journey; a bounded status signal must agree. */
  readonly expectedPublicErrorCode?: ExpectedPublicErrorCode;
  /** Kept in memory only; never returned in a journey result. */
  readonly expectedCtcgUserId: string;
  /** Optional post-auth destination. Only same-origin /account paths are accepted. */
  readonly protectedSurfacePath?: string;
}

export type BrowserSessionState = "anonymous" | "authenticated" | "unknown" | "not_observed";

export interface BrowserJourneyResult {
  /** The callback response itself was seen, independent of whether it succeeded. */
  readonly callbackObserved: boolean;
  /** A successful callback redirect, completion marker, and fresh landing were all observed. */
  readonly callbackSucceeded: boolean;
  readonly supportId: string | null;
  readonly baselineSessionState: BrowserSessionState;
  readonly resultingSessionState: BrowserSessionState;
  readonly finalSessionState: BrowserSessionState;
  readonly anonymousBaseline: boolean;
  readonly expectedDenialObserved: boolean;
  readonly identityMatchesExpected: boolean;
  readonly sessionEstablished: boolean;
  readonly logoutConfirmed: boolean;
  readonly outcome: "completed" | "cancelled" | "timed_out" | "failed";
}

export interface BrowserResponse {
  url(): string;
  status(): number;
  headers(): Record<string, string | undefined>;
  finished?(): Promise<Error | null>;
}

export interface BrowserPage {
  goto(url: string, options: { waitUntil: "domcontentloaded"; timeout: number }): Promise<unknown>;
  waitForResponse(
    predicate: (response: BrowserResponse) => boolean,
    options: { timeout: number },
  ): Promise<BrowserResponse>;
  waitForURL(url: string, options: { waitUntil: "domcontentloaded"; timeout: number }): Promise<void>;
  waitForLoadState(state: "domcontentloaded", options: { timeout: number }): Promise<void>;
  evaluate<T, A>(pageFunction: (arg: A) => Promise<T>, arg: A): Promise<T>;
}

export interface BrowserContext {
  newPage(): Promise<BrowserPage>;
  close(): Promise<void>;
}

export interface BrowserInstance {
  newContext(options: { acceptDownloads: false }): Promise<BrowserContext>;
  close(): Promise<void>;
}

export interface BrowserLauncher {
  launch(options: { headless: false; env: Record<string, string | undefined> }): Promise<BrowserInstance>;
}

export interface BrowserJourneyDependencies {
  readonly launcher: BrowserLauncher;
  readonly environment?: Readonly<Record<string, string | undefined>>;
  readonly timeoutMs?: number;
  /** Cancellation closes this fresh context; it never preserves OAuth state. */
  readonly signal?: AbortSignal;
}

const JOURNEY_TIMEOUT_MS = 5 * 60_000;
const PAGE_TIMEOUT_MS = 15_000;
const RESPONSE_BODY_LIMIT_BYTES = 16 * 1024;
const CLEANUP_TIMEOUT_MS = 1_000;
const REDIRECT_STATUSES = new Set([302, 303, 307, 308]);

type SessionObservation =
  | { readonly state: "anonymous"; readonly userId: null }
  | { readonly state: "authenticated"; readonly userId: string }
  | { readonly state: "unknown"; readonly userId: null };

class JourneyStop extends Error {
  constructor(readonly outcome: "cancelled" | "timed_out") {
    super(outcome);
    this.name = "JourneyStop";
  }
}

function canonicalOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function protectedSurfacePath(value: string | undefined): string | null {
  if (value === undefined) return "/account";
  if (value.length > 200 || (value !== "/account" && !value.startsWith("/account/"))) return null;
  try {
    const parsed = new URL(value, "https://fixture.invalid");
    if (parsed.origin !== "https://fixture.invalid" || parsed.pathname !== value || parsed.search || parsed.hash) return null;
    return value;
  } catch {
    return null;
  }
}

function redirectTarget(callback: BrowserResponse, origin: string): URL | null {
  if (!REDIRECT_STATUSES.has(callback.status())) return null;
  const location = callback.headers().location;
  if (!location || location.length > 1024) return null;
  try {
    const target = new URL(location, origin);
    if (target.origin !== origin || target.username || target.password || target.hash) return null;
    return target;
  } catch {
    return null;
  }
}

/** Inspect one fixed public Auth.js error value in memory, never record its URL. */
function observedPublicErrorCode(target: URL | null): ExpectedPublicErrorCode | null {
  if (!target || (target.pathname !== "/login" && target.pathname !== "/login/error")) return null;
  return target.searchParams.get("error") === "AccessDenied" ? "access_denied" : null;
}

/** A deliberately small browser-process environment excludes credentials/debug switches. */
export function browserProcessEnvironment(
  source: Readonly<Record<string, string | undefined>> = process.env,
): Record<string, string | undefined> {
  return {
    HOME: source.HOME,
    LANG: source.LANG,
    LC_ALL: source.LC_ALL,
    LC_CTYPE: source.LC_CTYPE,
    PATH: source.PATH,
    TMPDIR: source.TMPDIR,
    USER: source.USER,
    XDG_CONFIG_HOME: source.XDG_CONFIG_HOME,
  };
}

function bounded<T>(promise: Promise<T>, timeoutMs: number, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) return Promise.reject(new JourneyStop("cancelled"));
  if (timeoutMs <= 0) return Promise.reject(new JourneyStop("timed_out"));
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (operation: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      operation();
    };
    const onAbort = () => finish(() => reject(new JourneyStop("cancelled")));
    const timer = setTimeout(() => finish(() => reject(new JourneyStop("timed_out"))), timeoutMs);
    signal?.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => finish(() => resolve(value)),
      (error: unknown) => finish(() => reject(error)),
    );
  });
}

async function sessionInSameContext(
  page: BrowserPage,
  endpoint: string,
  timeoutMs: number,
): Promise<SessionObservation> {
  return page.evaluate(async (input) => {
    const unknown = { state: "unknown" as const, userId: null };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), input.timeoutMs);
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    try {
      const response = await fetch(input.url, {
        credentials: "same-origin",
        cache: "no-store",
        redirect: "error",
        signal: controller.signal,
      });
      if (!response.ok) return unknown;
      const declaredLength = response.headers.get("content-length");
      if (declaredLength !== null) {
        const bytes = Number(declaredLength);
        if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > input.maxBytes) return unknown;
      }
      if (response.body === null) return unknown;
      reader = response.body.getReader();
      const decoder = new TextDecoder();
      let bytesRead = 0;
      let body = "";
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytesRead += chunk.value.byteLength;
        if (bytesRead > input.maxBytes) {
          await reader.cancel().catch(() => undefined);
          return unknown;
        }
        body += decoder.decode(chunk.value, { stream: true });
      }
      body += decoder.decode();
      let parsed: unknown;
      try {
        parsed = JSON.parse(body) as unknown;
      } catch {
        return unknown;
      }
      if (parsed === null) return { state: "anonymous" as const, userId: null };
      if (typeof parsed !== "object" || Array.isArray(parsed)) return unknown;
      const record = parsed as Record<string, unknown>;
      if (Object.keys(record).length === 0) return { state: "anonymous" as const, userId: null };
      const user = record.user;
      if (typeof user !== "object" || user === null || Array.isArray(user)) return unknown;
      const userId = (user as Record<string, unknown>).id;
      const expires = record.expires;
      if (typeof userId !== "string" || userId.length < 1 || userId.length > 256
        || typeof expires !== "string" || !Number.isFinite(Date.parse(expires))
        || Date.parse(expires) <= Date.now()) return unknown;
      return { state: "authenticated" as const, userId };
    } catch {
      return unknown;
    } finally {
      clearTimeout(timer);
      reader?.releaseLock();
    }
  }, { url: endpoint, timeoutMs, maxBytes: RESPONSE_BODY_LIMIT_BYTES });
}

async function logoutInSameContext(page: BrowserPage, origin: string, timeoutMs: number): Promise<boolean> {
  return page.evaluate(async (input) => {
    const readBoundedText = async (response: Response): Promise<string | null> => {
      const declaredLength = response.headers.get("content-length");
      if (declaredLength !== null) {
        const bytes = Number(declaredLength);
        if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > input.maxBytes) return null;
      }
      if (response.body === null) return null;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let bytesRead = 0;
      let text = "";
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          bytesRead += chunk.value.byteLength;
          if (bytesRead > input.maxBytes) {
            await reader.cancel().catch(() => undefined);
            return null;
          }
          text += decoder.decode(chunk.value, { stream: true });
        }
        return text + decoder.decode();
      } finally {
        reader.releaseLock();
      }
    };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), input.timeoutMs);
    try {
      const csrf = await fetch(`${input.origin}/api/auth/csrf`, {
        credentials: "same-origin",
        cache: "no-store",
        redirect: "error",
        signal: controller.signal,
      });
      if (!csrf.ok) return false;
      const csrfText = await readBoundedText(csrf);
      if (csrfText === null) return false;
      let token: string | null = null;
      try {
        const parsed: unknown = JSON.parse(csrfText) as unknown;
        token = typeof parsed === "object" && parsed !== null && "csrfToken" in parsed
          && typeof parsed.csrfToken === "string" && parsed.csrfToken.length <= 2048
          ? parsed.csrfToken
          : null;
      } catch {
        return false;
      }
      if (!token) return false;
      const body = new URLSearchParams({ csrfToken: token, json: "true" });
      const response = await fetch(`${input.origin}/api/auth/signout`, {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        redirect: "manual",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body,
        signal: controller.signal,
      });
      return response.ok || response.status === 302 || response.status === 303
        || response.status === 307 || response.status === 308;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }, { origin, timeoutMs, maxBytes: RESPONSE_BODY_LIMIT_BYTES });
}

function emptyResult(outcome: BrowserJourneyResult["outcome"]): BrowserJourneyResult {
  return Object.freeze({
    callbackObserved: false,
    callbackSucceeded: false,
    supportId: null,
    baselineSessionState: "not_observed",
    resultingSessionState: "not_observed",
    finalSessionState: "not_observed",
    anonymousBaseline: false,
    expectedDenialObserved: false,
    identityMatchesExpected: false,
    sessionEstablished: false,
    logoutConfirmed: false,
    outcome,
  });
}

function resultWith(
  current: BrowserJourneyResult,
  changes: Partial<BrowserJourneyResult>,
): BrowserJourneyResult {
  return Object.freeze({ ...current, ...changes });
}

function outcomeFor(error: unknown, signal: AbortSignal | undefined): BrowserJourneyResult["outcome"] {
  if (signal?.aborted || (error instanceof JourneyStop && error.outcome === "cancelled")) return "cancelled";
  return error instanceof JourneyStop && error.outcome === "timed_out" ? "timed_out" : "failed";
}

async function observeFreshLanding(
  page: BrowserPage,
  target: URL,
  remainingMs: () => number,
  signal: AbortSignal | undefined,
): Promise<boolean> {
  const href = target.href;
  const waitMs = remainingMs();
  const response = await bounded(page.waitForResponse(
    (candidate) => candidate.url() === href,
    { timeout: waitMs },
  ), waitMs, signal);
  if (response.status() < 200 || response.status() > 299) return false;
  if (response.finished) {
    const finished = await bounded(response.finished(), remainingMs(), signal);
    if (finished !== null) return false;
  }
  await bounded(page.waitForURL(href, {
    waitUntil: "domcontentloaded",
    timeout: remainingMs(),
  }), remainingMs(), signal);
  await bounded(page.waitForLoadState("domcontentloaded", {
    timeout: remainingMs(),
  }), remainingMs(), signal);
  return true;
}

async function boundedCleanup(operation: (() => Promise<void>) | undefined, remainingMs: number): Promise<void> {
  if (!operation) return;
  const pending = operation().catch(() => undefined);
  if (remainingMs <= 0) return;
  await Promise.race([
    pending,
    new Promise<void>((resolve) => setTimeout(resolve, Math.min(CLEANUP_TIMEOUT_MS, remainingMs))),
  ]);
}

/**
 * Performs no credential entry, provider-button action, consent action, or OAuth
 * request itself. After loading the local login page it waits for the operator to
 * complete their intentional test-account journey in a headed browser.
 */
export async function runBrowserJourney(
  fixture: BrowserJourneyFixture,
  dependencies: BrowserJourneyDependencies,
): Promise<BrowserJourneyResult> {
  const origin = canonicalOrigin(fixture.origin);
  const expectedLandingPath = protectedSurfacePath(fixture.protectedSurfacePath);
  if (!origin || !expectedLandingPath || !fixture.expectedCtcgUserId || fixture.expectedCtcgUserId.length > 256
    || (fixture.scenario === "expected_denial" && fixture.expectedPublicErrorCode !== "access_denied")) {
    return emptyResult("failed");
  }
  if (dependencies.signal?.aborted) return emptyResult("cancelled");

  const deadline = Date.now() + (dependencies.timeoutMs ?? JOURNEY_TIMEOUT_MS);
  const remainingMs = () => Math.max(0, deadline - Date.now());
  let result = emptyResult("failed");
  let browser: BrowserInstance | null = null;
  let context: BrowserContext | null = null;
  try {
    const launching = dependencies.launcher.launch({
      headless: false,
      env: browserProcessEnvironment(dependencies.environment),
    });
    try {
      browser = await bounded(launching, remainingMs(), dependencies.signal);
    } catch (error) {
      void launching.then((lateBrowser) => lateBrowser.close().catch(() => undefined), () => undefined);
      throw error;
    }
    context = await bounded(browser.newContext({ acceptDownloads: false }), remainingMs(), dependencies.signal);
    const page = await bounded(context.newPage(), remainingMs(), dependencies.signal);
    // Establish the approved origin before the same-context fetch; an about:blank
    // page would turn the baseline into an unintended cross-origin request.
    const pageTimeout = Math.min(PAGE_TIMEOUT_MS, remainingMs());
    await bounded(page.goto(`${origin}/api/auth/session`, {
      waitUntil: "domcontentloaded",
      timeout: pageTimeout,
    }), pageTimeout, dependencies.signal);
    const baselineTimeout = Math.min(PAGE_TIMEOUT_MS, remainingMs());
    const baseline = await bounded(
      sessionInSameContext(page, `${origin}/api/auth/session`, baselineTimeout),
      baselineTimeout,
      dependencies.signal,
    );
    result = resultWith(result, { baselineSessionState: baseline.state });
    if (baseline.state !== "anonymous") return result;
    result = resultWith(result, { anonymousBaseline: true });

    const loginUrl = fixture.protectedSurfacePath === undefined
      ? `${origin}/login`
      : `${origin}/login?return=${encodeURIComponent(expectedLandingPath)}`;
    const loginTimeout = Math.min(PAGE_TIMEOUT_MS, remainingMs());
    await bounded(page.goto(loginUrl, {
      waitUntil: "domcontentloaded",
      timeout: loginTimeout,
    }), loginTimeout, dependencies.signal);
    const callbackPath = "/api/auth/callback/github";
    const callback = await bounded(page.waitForResponse(
      (response) => {
        try {
          const url = new URL(response.url());
          return url.origin === origin && url.pathname === callbackPath;
        } catch {
          return false;
        }
      },
      { timeout: remainingMs() },
    ), remainingMs(), dependencies.signal);

    const support = callback.headers()[SUPPORT_ID_HEADER];
    result = resultWith(result, {
      callbackObserved: true,
      supportId: isSupportId(support) ? support : null,
    });
    const target = redirectTarget(callback, origin);
    const publicError = observedPublicErrorCode(target);
    const positiveRedirect = target !== null
      && target.pathname === expectedLandingPath
      && target.search === "";
    const publicDenialRedirect = publicError !== null;
    const expectedDenialRedirect = publicError === fixture.expectedPublicErrorCode;
    if ((!positiveRedirect && !publicDenialRedirect) || target === null) {
      return resultWith(result, { outcome: "completed" });
    }

    const landed = await observeFreshLanding(page, target, remainingMs, dependencies.signal);
    if (!landed) return resultWith(result, { outcome: "completed" });
    const sessionTimeout = Math.min(PAGE_TIMEOUT_MS, remainingMs());
    const session = await bounded(
      sessionInSameContext(page, `${origin}/api/auth/session`, sessionTimeout),
      sessionTimeout,
      dependencies.signal,
    );
    const sessionEstablished = session.state === "authenticated";
    const identityMatchesExpected = session.state === "authenticated"
      && session.userId === fixture.expectedCtcgUserId;
    const callbackSucceeded = fixture.scenario === "positive_login"
      && positiveRedirect
      && callback.headers()[AUTH_COMPLETION_HEADER] === AUTH_COMPLETION_OBSERVED;
    result = resultWith(result, {
      callbackSucceeded,
      resultingSessionState: session.state,
      identityMatchesExpected,
      sessionEstablished,
    });

    if (fixture.scenario === "expected_denial") {
      const expectedDenialObserved = expectedDenialRedirect && session.state === "anonymous";
      if (!expectedDenialObserved) return resultWith(result, { outcome: "completed" });
      const confirmationTimeout = Math.min(PAGE_TIMEOUT_MS, remainingMs());
      const confirmation = await bounded(
        sessionInSameContext(page, `${origin}/api/auth/session`, confirmationTimeout),
        confirmationTimeout,
        dependencies.signal,
      );
      return resultWith(result, {
        expectedDenialObserved: true,
        finalSessionState: confirmation.state,
        logoutConfirmed: confirmation.state === "anonymous",
        outcome: "completed",
      });
    }

    // Never sign out an unexpected account. Closing our fresh context is the only
    // cleanup permitted when the observed identity does not match the fixture.
    if (!identityMatchesExpected) return resultWith(result, { outcome: "completed" });
    const logoutTimeout = Math.min(PAGE_TIMEOUT_MS, remainingMs());
    const logoutStarted = await bounded(
      logoutInSameContext(page, origin, logoutTimeout),
      logoutTimeout,
      dependencies.signal,
    );
    if (!logoutStarted) return resultWith(result, { outcome: "completed" });
    const confirmationTimeout = Math.min(PAGE_TIMEOUT_MS, remainingMs());
    const afterLogout = await bounded(
      sessionInSameContext(page, `${origin}/api/auth/session`, confirmationTimeout),
      confirmationTimeout,
      dependencies.signal,
    );
    return resultWith(result, {
      finalSessionState: afterLogout.state,
      logoutConfirmed: afterLogout.state === "anonymous",
      outcome: "completed",
    });
  } catch (error) {
    return resultWith(result, { outcome: outcomeFor(error, dependencies.signal) });
  } finally {
    const contextToClose = context;
    const browserToClose = browser;
    await boundedCleanup(contextToClose ? () => contextToClose.close() : undefined, remainingMs());
    await boundedCleanup(browserToClose ? () => browserToClose.close() : undefined, remainingMs());
  }
}
