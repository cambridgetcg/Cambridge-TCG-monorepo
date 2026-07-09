/**
 * auth-magic-link.spec.ts — end-to-end magic-link sign-in, in four tiers.
 *
 * The real flow this mirrors:
 *   /login (optionally ?return=<path>) → POST /api/auth/signin/email with
 *   callbackUrl=<return> → INLINE sent-state on /login (no navigation; the
 *   /login/check-email page still exists as next-auth's verifyRequest
 *   target but the login form renders its own confirmation) → email links
 *   to the /login/verify interstitial (scanner-proof double-tap; the
 *   callbackUrl rides inside its `u` param) → human tap → GET
 *   /api/auth/callback/email → session minted → redirect to callbackUrl.
 *
 * Each tier needs strictly more env than the one before, so an operator
 * can run as much of the loop as their credentials cover. Tests that
 * can't run self-skip with an explicit message — never silent.
 *
 *   Tier 0 (wiring — no creds, no side effects)
 *     Env: none (needs only a reachable storefront at STOREFRONT_BASE_URL)
 *     Verifies: ?return= rides the signin POST as callbackUrl (and unsafe
 *     values are dropped); the /login/verify interstitial forwards the
 *     callback URL — callbackUrl included — untouched. The csrf/signin/
 *     callback requests are intercepted, so nothing is sent or written.
 *
 *   Tier A (REQUEST half — sends a real SES email)
 *     Env: STOREFRONT_TEST_EMAIL
 *     Verifies: /login → POST → inline "Check your email" sent-state.
 *     Side effect: one magic-link email is sent to STOREFRONT_TEST_EMAIL.
 *
 *   Tier B (DB-row verification — additive on Tier A)
 *     Env: STOREFRONT_TEST_EMAIL + DATABASE_URL
 *     Verifies: a `verification_tokens` row was inserted after submit.
 *     Side effect: one magic-link email PLUS DB INSERT+DELETE on
 *     verification_tokens + sessions cleanup.
 *
 *   Tier C (CALLBACK half through the interstitial — no email sent)
 *     Env: STOREFRONT_TEST_EMAIL + DATABASE_URL + AUTH_SECRET
 *     Verifies: the /login/verify double-tap proceeds to NextAuth's
 *     callback with a manufactured `SHA256(rawToken + AUTH_SECRET)` row,
 *     mints a session, and lands on the deep callbackUrl — proving
 *     "login keeps your place" end-to-end. Side effect: no SES email.
 *     DB INSERT (manufactured row) + DELETE (session + token cleanup).
 *
 *   STOREFRONT_TEST_EMAIL=you+stf-test@example.com \
 *   DATABASE_URL='postgres://…' \
 *   AUTH_SECRET='…' \
 *     pnpm --filter cambridgetcg-storefront test:e2e -- tests/auth-magic-link.spec.ts
 */

import { test, expect, type Page } from "@playwright/test";
import { Client } from "pg";
import { randomBytes, createHash } from "node:crypto";

const TEST_EMAIL = process.env.STOREFRONT_TEST_EMAIL;
const DATABASE_URL = process.env.DATABASE_URL;
const AUTH_SECRET = process.env.AUTH_SECRET;

// Deep path used to prove return-preservation (any gated page works).
const RETURN_PATH = "/account/trades";

test.describe("magic-link sign-in", () => {
  // ─── Tier 0 (wiring only — everything auth-touching intercepted) ───
  test("0a — ?return= rides the signin POST as callbackUrl", async ({ page }) => {
    const capturedBody = await submitWithInterception(page, `/login?return=${encodeURIComponent(RETURN_PATH)}`);
    expect(capturedBody.get("callbackUrl"), "callbackUrl carries the return path").toBe(RETURN_PATH);

    // Inline sent-state, no navigation away from /login.
    await expect(page.getByRole("heading", { name: /check your email/i })).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/login");
    // The sent-state names the place the visitor will come back to.
    await expect(page.getByText(RETURN_PATH)).toBeVisible();
  });

  test("0b — unsafe ?return= values fall back to /account", async ({ page }) => {
    const capturedBody = await submitWithInterception(page, `/login?return=${encodeURIComponent("//evil.example")}`);
    expect(capturedBody.get("callbackUrl"), "protocol-relative return is dropped").toBe("/account");
  });

  test("0c — /login/verify interstitial forwards the callback URL, callbackUrl intact", async ({ page, baseURL }) => {
    const cbUrl = new URL("/api/auth/callback/email", baseURL!);
    cbUrl.searchParams.set("callbackUrl", RETURN_PATH);
    cbUrl.searchParams.set("token", "not-a-real-token");
    cbUrl.searchParams.set("email", "someone@example.com");

    let forwardedUrl: string | null = null;
    await page.route("**/api/auth/callback/email*", async (route) => {
      forwardedUrl = route.request().url();
      await route.fulfill({ status: 200, contentType: "text/plain", body: "intercepted" });
    });

    await page.goto(`/login/verify?u=${encodeURIComponent(cbUrl.toString())}`);
    await page.getByRole("button", { name: /complete sign in/i }).click();
    await page.waitForURL("**/api/auth/callback/email*");

    expect(forwardedUrl, "interstitial proceeded to the callback").not.toBeNull();
    const forwarded = new URL(forwardedUrl!);
    expect(forwarded.searchParams.get("callbackUrl"), "callbackUrl survived the hop").toBe(RETURN_PATH);
    expect(forwarded.searchParams.get("token")).toBe("not-a-real-token");
  });

  // ─── Tier A ────────────────────────────────────────────────────────
  test("A — request half: form submit shows the inline sent-state (sends SES email)", async ({ page }) => {
    test.skip(!TEST_EMAIL, "Set STOREFRONT_TEST_EMAIL to run Tier A (sends one real email)");
    test.setTimeout(30_000);

    await page.goto("/login");
    await page.getByRole("textbox", { name: /email/i }).first().fill(TEST_EMAIL!);
    await page.getByRole("button", { name: /sign in|send/i }).first().click();
    await expect(page.getByRole("heading", { name: /check your email/i })).toBeVisible({ timeout: 15_000 });
    // Sent-state is inline — the page never leaves /login.
    expect(new URL(page.url()).pathname).toBe("/login");
  });

  // ─── Tier B (additive on A) ────────────────────────────────────────
  test("B — DB row check: a verification_tokens row appears after submit", async ({ page }) => {
    test.skip(!TEST_EMAIL || !DATABASE_URL, "Set STOREFRONT_TEST_EMAIL + DATABASE_URL to run Tier B");
    test.setTimeout(30_000);
    const startedAt = new Date();

    await page.goto("/login");
    await page.getByRole("textbox", { name: /email/i }).first().fill(TEST_EMAIL!);
    await page.getByRole("button", { name: /sign in|send/i }).first().click();
    await expect(page.getByRole("heading", { name: /check your email/i })).toBeVisible({ timeout: 15_000 });

    const db = await openDb();
    try {
      const { rows } = await db.query<{ expires: Date }>(
        `SELECT expires FROM verification_tokens
         WHERE identifier = $1 AND expires > $2
         ORDER BY expires DESC LIMIT 1`,
        [TEST_EMAIL, startedAt],
      );
      expect(rows.length, "row created for test email").toBeGreaterThan(0);
      expect(rows[0].expires.getTime(), "row expires in the future")
        .toBeGreaterThan(Date.now());
    } finally {
      await db.query(`DELETE FROM verification_tokens WHERE identifier = $1`, [TEST_EMAIL]);
      await db.end();
    }
  });

  // ─── Tier C (no SES) ───────────────────────────────────────────────
  test("C — callback half via the interstitial: manufactured token mints a session and keeps your place", async ({ page, baseURL }) => {
    test.skip(
      !TEST_EMAIL || !DATABASE_URL || !AUTH_SECRET,
      "Set STOREFRONT_TEST_EMAIL + DATABASE_URL + AUTH_SECRET to run Tier C",
    );
    test.setTimeout(30_000);
    const startedAt = new Date();

    // NextAuth's @auth/core stores SHA-256 hex of `${rawToken}${AUTH_SECRET}`
    // (see node_modules/.pnpm/@auth+core@*/node_modules/@auth/core/lib/utils/web.js,
    //  createHash). Reproduce that here so the callback URL we visit
    //  hashes to a row WE just inserted.
    const rawToken = randomBytes(32).toString("hex");
    const storedHash = createHash("sha256")
      .update(`${rawToken}${AUTH_SECRET!}`)
      .digest("hex");
    const expires = new Date(Date.now() + 60_000);

    const db = await openDb();
    try {
      await db.query(
        `INSERT INTO verification_tokens (identifier, token, expires) VALUES ($1, $2, $3)`,
        [TEST_EMAIL, storedHash, expires],
      );

      // Enter exactly the way the email does: through the /login/verify
      // interstitial with the full callback URL riding `u`.
      const cbUrl = new URL("/api/auth/callback/email", baseURL!);
      cbUrl.searchParams.set("callbackUrl", RETURN_PATH);
      cbUrl.searchParams.set("token", rawToken);
      cbUrl.searchParams.set("email", TEST_EMAIL!);

      await page.goto(`/login/verify?u=${encodeURIComponent(cbUrl.toString())}`);
      await page.getByRole("button", { name: /complete sign in/i }).click();

      // The callback redirects to the callbackUrl — the deep path, not
      // the account hub.
      await page.waitForURL(new RegExp(RETURN_PATH.replace(/\//g, "\\/")), { timeout: 15_000 });

      const sessionResp = await page.request.get("/api/auth/session");
      const session = (await sessionResp.json()) as { user?: { email?: string } };
      expect(session.user?.email, "session.user.email matches test email").toBe(TEST_EMAIL);
    } finally {
      await db.query(
        `DELETE FROM sessions
         WHERE user_id = (SELECT id FROM users WHERE email = $1)
           AND expires > $2`,
        [TEST_EMAIL, startedAt],
      );
      await db.query(`DELETE FROM verification_tokens WHERE identifier = $1`, [TEST_EMAIL]);
      await db.end();
    }
  });
});

/**
 * Load a /login URL, intercept the csrf + signin requests (nothing is
 * sent, nothing written), submit a syntactically valid email, and return
 * the parsed body of the captured signin POST.
 */
async function submitWithInterception(page: Page, loginUrl: string): Promise<URLSearchParams> {
  let capturedBody: URLSearchParams | null = null;

  await page.route("**/api/auth/csrf", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ csrfToken: "tier0-intercepted" }),
    }),
  );
  await page.route("**/api/auth/signin/email", async (route) => {
    capturedBody = new URLSearchParams(route.request().postData() ?? "");
    await route.fulfill({ status: 200, contentType: "text/html", body: "ok" });
  });

  await page.goto(loginUrl);
  await page.getByRole("textbox", { name: /email/i }).first().fill("tier0@example.com");
  await page.getByRole("button", { name: /sign in|send/i }).first().click();
  await expect
    .poll(() => capturedBody !== null, { message: "signin POST captured" })
    .toBe(true);
  return capturedBody!;
}

async function openDb(): Promise<Client> {
  // Mirror @cambridge-tcg/db's connection-string handling: pg + RDS
  // disagree on `sslmode` so the app strips it and self-manages TLS.
  // A localhost dev Postgres has no TLS at all — connect plain there.
  const url = DATABASE_URL!.replace(/[?&]sslmode=[^&]+/g, "").replace(/\?&/, "?").replace(/\?$/, "");
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  const client = new Client({
    connectionString: url,
    ...(local ? {} : { ssl: { rejectUnauthorized: false } }),
  });
  await client.connect();
  return client;
}
