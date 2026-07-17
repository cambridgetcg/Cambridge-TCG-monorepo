/**
 * smoke.spec.ts — auth-surface smoke tests (no email triggered).
 *
 * Cheap GET-only checks against the live storefront's NextAuth surface.
 * Safe to run on production: never POSTs, never writes, never emails.
 *
 *   pnpm --filter cambridgetcg-storefront test:e2e -- tests/smoke.spec.ts
 */

import { test, expect } from "@playwright/test";

test.describe("auth surface — read-only smoke", () => {
  test("/login renders the magic-link form", async ({ page }) => {
    const resp = await page.goto("/login");
    expect(resp?.status(), "GET /login HTTP status").toBe(200);

    const emailInput = page.getByRole("textbox", { name: /email/i }).first();
    await expect(emailInput).toBeVisible();

    const submit = page.getByRole("button", { name: /sign in|send/i }).first();
    await expect(submit).toBeVisible();
  });

  test("/login/check-email renders standalone (post-submit destination)", async ({ page }) => {
    const resp = await page.goto("/login/check-email");
    expect(resp?.status(), "GET /login/check-email HTTP status").toBe(200);
    // Scope to the heading — "Check your spam folder…" also matches the
    // generic /check your email/i regex and trips Playwright strict mode.
    await expect(page.getByRole("heading", { name: /check your email/i })).toBeVisible();
  });

  test("/api/auth/csrf returns a token", async ({ request }) => {
    const resp = await request.get("/api/auth/csrf");
    expect(resp.status(), "GET /api/auth/csrf HTTP status").toBe(200);
    const body = (await resp.json()) as { csrfToken?: string };
    expect(body.csrfToken, "csrfToken in response").toBeTruthy();
    expect(body.csrfToken!.length, "csrfToken length").toBeGreaterThan(20);
  });

  test("/api/auth/session returns null when unauthenticated", async ({ request }) => {
    const resp = await request.get("/api/auth/session");
    expect(resp.status(), "GET /api/auth/session HTTP status").toBe(200);
    // NextAuth v5 returns JSON `null` (not `{}` or `{user: undefined}`)
    // when no session cookie is present.
    const body = (await resp.json()) as unknown;
    expect(body, "session body is null when unauthenticated").toBeNull();
  });

  test("/admin/* redirects unauthenticated visitors to /login", async ({ page }) => {
    const resp = await page.goto("/admin/auctions", { waitUntil: "domcontentloaded" });
    // Either a redirect (302→200 chain) lands us at /login, or the
    // middleware serves the login page directly. Both are valid; what
    // matters is the URL after navigation.
    expect(resp?.status(), "final response status").toBeGreaterThanOrEqual(200);
    await expect(page).toHaveURL(/\/login(\?|$)/);
  });
});
