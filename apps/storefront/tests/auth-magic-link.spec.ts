/**
 * auth-magic-link.spec.ts — end-to-end magic-link sign-in, in three tiers.
 *
 * Each tier needs strictly more env than the one before, so an operator
 * can run as much of the loop as their credentials cover. Tests that
 * can't run self-skip with an explicit message — never silent.
 *
 *   Tier A (REQUEST half — sends a real SES email)
 *     Env: STOREFRONT_TEST_EMAIL
 *     Verifies: /login → POST → redirect to /login/check-email
 *     Side effect: one magic-link email is sent to STOREFRONT_TEST_EMAIL.
 *
 *   Tier B (DB-row verification — additive on Tier A)
 *     Env: STOREFRONT_TEST_EMAIL + DATABASE_URL
 *     Verifies: a `verification_tokens` row was inserted after submit.
 *     Side effect: one magic-link email PLUS DB INSERT+DELETE on
 *     verification_tokens + sessions cleanup.
 *
 *   Tier C (CALLBACK half — manufactured token, NO email sent)
 *     Env: STOREFRONT_TEST_EMAIL + DATABASE_URL + AUTH_SECRET
 *     Verifies: NextAuth's callback URL with a raw token matching our
 *     manufactured `SHA256(rawToken + AUTH_SECRET)` row mints a session.
 *     Side effect: no SES email. DB INSERT (manufactured row) + DELETE
 *     (session + token cleanup).
 *
 * Why three tiers rather than one:
 *   - Smoke + Tier A together prove the production wire is healthy
 *     without needing prod-DB access from the test runner.
 *   - Tier B catches schema drift (e.g. the `verification_tokens`
 *     migration regressing) without trusting the SES round-trip.
 *   - Tier C is the only one that exercises a real session being
 *     minted, and it does so without sending an email — useful for CI.
 *
 *   STOREFRONT_TEST_EMAIL=you+stf-test@example.com \
 *   DATABASE_URL='postgres://…' \
 *   AUTH_SECRET='…' \
 *     pnpm --filter cambridgetcg-storefront test:e2e -- tests/auth-magic-link.spec.ts
 */

import { test, expect } from "@playwright/test";
import { Client } from "pg";
import { randomBytes, createHash } from "node:crypto";

const TEST_EMAIL = process.env.STOREFRONT_TEST_EMAIL;
const DATABASE_URL = process.env.DATABASE_URL;
const AUTH_SECRET = process.env.AUTH_SECRET;

test.describe("magic-link sign-in", () => {
  // ─── Tier A ────────────────────────────────────────────────────────
  test("A — request half: form submit redirects to /login/check-email (sends SES email)", async ({ page }) => {
    test.skip(!TEST_EMAIL, "Set STOREFRONT_TEST_EMAIL to run Tier A (sends one real email)");
    test.setTimeout(30_000);

    await page.goto("/login");
    await page.getByRole("textbox", { name: /email/i }).first().fill(TEST_EMAIL!);
    await Promise.all([
      page.waitForURL(/\/login\/check-email/, { timeout: 15_000 }),
      page.getByRole("button", { name: /sign in|send/i }).first().click(),
    ]);
    await expect(page.getByRole("heading", { name: /check your email/i })).toBeVisible();
  });

  // ─── Tier B (additive on A) ────────────────────────────────────────
  test("B — DB row check: a verification_tokens row appears after submit", async ({ page }) => {
    test.skip(!TEST_EMAIL || !DATABASE_URL, "Set STOREFRONT_TEST_EMAIL + DATABASE_URL to run Tier B");
    test.setTimeout(30_000);
    const startedAt = new Date();

    await page.goto("/login");
    await page.getByRole("textbox", { name: /email/i }).first().fill(TEST_EMAIL!);
    await Promise.all([
      page.waitForURL(/\/login\/check-email/, { timeout: 15_000 }),
      page.getByRole("button", { name: /sign in|send/i }).first().click(),
    ]);

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
  test("C — callback half: manufactured token mints a session (no email sent)", async ({ page, baseURL }) => {
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

      const cbUrl = new URL("/api/auth/callback/email", baseURL!);
      cbUrl.searchParams.set("token", rawToken);
      cbUrl.searchParams.set("email", TEST_EMAIL!);
      cbUrl.searchParams.set("callbackUrl", "/account");
      const resp = await page.goto(cbUrl.toString());
      expect(resp?.status(), "callback HTTP status").toBeLessThan(400);

      await page.waitForURL(/\/account/, { timeout: 15_000 });

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

async function openDb(): Promise<Client> {
  // Mirror @cambridge-tcg/db's connection-string handling: pg + RDS
  // disagree on `sslmode` so the app strips it. Match that here.
  const url = DATABASE_URL!.replace(/[?&]sslmode=[^&]+/g, "").replace(/\?&/, "?").replace(/\?$/, "");
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  return client;
}
