import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

export const BASE =
  process.env.E2E_BASE_URL ?? "https://wholesaletcgdirect.com";
export const ADMIN_BASE =
  process.env.E2E_ADMIN_BASE_URL ?? "https://admin.wholesaletcgdirect.com";

export async function adminLogin(page: Page) {
  const { E2E_ADMIN_EMAIL: email, E2E_ADMIN_PASSWORD: password } = process.env;
  if (!email || !password) {
    throw new Error("Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD to run the admin specs.");
  }
  const ctx = page.context();

  // 1. GET CSRF token (context.request shares cookies with the browser)
  const csrfRes = await ctx.request.get(`${BASE}/api/auth/csrf`);
  const { csrfToken } = await csrfRes.json();

  // 2. POST credentials to NextAuth callback
  const loginRes = await ctx.request.post(
    `${BASE}/api/auth/callback/credentials`,
    {
      form: { email, password, csrfToken },
      maxRedirects: 0,
    },
  );

  const location = loginRes.headers()["location"] ?? "";
  if (location.includes("error")) {
    throw new Error(`Login failed: ${location}`);
  }

  // 3. Copy session cookie to admin subdomain so admin page navigations work
  const cookies = await ctx.cookies(BASE);
  const sessionCookie = cookies.find((c) => c.name.includes("session-token"));
  if (sessionCookie && ADMIN_BASE !== BASE) {
    const adminUrl = new URL(ADMIN_BASE);
    await ctx.addCookies([{
      ...sessionCookie,
      domain: adminUrl.hostname,
    }]);
  }

  // 4. Session cookie is set — navigate to catalog
  await page.goto("/catalog");
  await expect(
    page.locator("h1", { hasText: "Card Catalog" }),
  ).toBeVisible({ timeout: 15_000 });
}
