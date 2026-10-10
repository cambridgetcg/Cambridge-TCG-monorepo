import { test, expect, type Page } from "@playwright/test";

// Explicit loopback target required: this spec must never inherit the config's
// production default. All auth calls are intercepted; no OAuth app or DB needed.
const configuredBase = process.env.STOREFRONT_BASE_URL;
const localBase = (() => {
  try {
    const url = new URL(configuredBase ?? "");
    return url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      ? url.origin : null;
  } catch { return null; }
})();

type Provider = "google" | "github";
async function mockAuth(page: Page, providers: Provider[], csrf = "test-csrf") {
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== localBase) return route.abort();
    if (url.pathname === "/api/auth/providers") {
      return route.fulfill({ json: Object.fromEntries(providers.map((id) => [id, { id, type: "oauth" }])) });
    }
    if (url.pathname === "/api/auth/csrf") return route.fulfill({ json: { csrfToken: csrf } });
    if (url.pathname === "/api/auth/session") return route.fulfill({ json: null });
    // Do not let unexpected client API calls reach a database or mail transport.
    if (url.pathname.startsWith("/api/")) return route.fulfill({ json: {} });
    return route.continue();
  });
}

test.describe("local mocked OAuth login UI", () => {
  test.skip(!localBase, "Set STOREFRONT_BASE_URL to an explicit HTTP loopback dev server");

  for (const providers of [[], ["google"], ["github"], ["google", "github"]] as Provider[][]) {
    test(`discovers only configured providers: ${providers.join(",") || "email only"}`, async ({ page }) => {
      await mockAuth(page, providers);
      await page.goto(`${localBase}/login`);
      await expect(page.getByRole("button", { name: "Continue with Email" })).toBeVisible();
      for (const [id, name] of [["google", "Google"], ["github", "GitHub"]] as const) {
        await expect(page.getByRole("button", { name: `Continue with ${name}` }))
          .toHaveCount(providers.includes(id) ? 1 : 0);
      }
      await expect(page.getByText("or", { exact: true })).toHaveCount(providers.length ? 1 : 0);
      await expect(page.getByRole("group", { name: "Connected sign-in providers" }))
        .toHaveCount(providers.length ? 1 : 0);
      await expect(page.getByText(/GitHub sign-in requires a verified email/))
        .toHaveCount(providers.includes("github") ? 1 : 0);
      await expect(page.getByText(/Email sign-in requests always receive the same confirmation/)).toBeVisible();
    });
  }

  test("cannot submit GitHub without a CSRF token", async ({ page }) => {
    await mockAuth(page, ["github"], "");
    await page.goto(`${localBase}/login`);
    await expect(page.getByRole("button", { name: "Continue with GitHub" })).toBeDisabled();
  });

  for (const returnTo of [
    "/account/trades?tab=incoming#offer", "//evil.example", "https://evil.example",
    "/\\evil.example", "/\tevil.example", "/login", "/login/error", "/login#again",
    "/account/../login", "",
  ]) {
    test(`GitHub full-page POST keeps only a safe return: ${JSON.stringify(returnTo)}`, async ({ page }) => {
      await mockAuth(page, ["google", "github"]);
      let submitted: URLSearchParams | undefined;
      let navigation = false;
      await page.route("**/api/auth/signin/github", async (route) => {
        expect(route.request().method()).toBe("POST");
        navigation = route.request().isNavigationRequest();
        submitted = new URLSearchParams(route.request().postData() ?? "");
        await route.fulfill({ contentType: "text/plain", body: "OAuth POST intercepted locally" });
      });
      await page.goto(`${localBase}/login?return=${encodeURIComponent(returnTo)}`);
      await page.getByRole("button", { name: "Continue with GitHub" }).click();
      await expect(page).toHaveURL(`${localBase}/api/auth/signin/github`);
      expect(navigation).toBe(true);
      expect(submitted?.get("csrfToken")).toBe("test-csrf");
      expect(submitted?.get("callbackUrl")).toBe(returnTo.startsWith("/account/trades") ? returnTo : "/account");
    });
  }

  for (const error of ["OAuthCallbackError", "OAuthAccountNotLinked", "Configuration"]) {
    test(`actual Auth.js sign-in redirect shows useful generic guidance: ${error}`, async ({ page }) => {
      await mockAuth(page, ["github"]);
      await page.goto(`${localBase}/login?error=${error}`);
      const alert = page.getByRole("main").getByRole("alert");
      await expect(alert).toContainText("We couldn't complete sign-in");
      await expect(alert).toContainText("email is verified");
      await expect(alert).toContainText("If you meant to use a different account, sign out first.");
      await expect(alert).not.toContainText(/expired|already used|already linked/);
      await expect(alert).not.toContainText(error);
      await expect(page.getByRole("button", { name: "Continue with Email" })).toBeVisible();
    });
  }
});
