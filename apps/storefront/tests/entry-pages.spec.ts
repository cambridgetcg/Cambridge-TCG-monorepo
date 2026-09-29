import { expect, test } from "@playwright/test";

// Local UI checks only. No account, provider or production data is needed.
const target = process.env.STOREFRONT_BASE_URL;
test.skip(!target || !["127.0.0.1", "localhost", "[::1]"].includes(new URL(target).hostname),
  "Set STOREFRONT_BASE_URL to an explicitly started loopback storefront.");

test.beforeEach(async ({ context }) => {
  await context.route("**/*", (route) => new URL(route.request().url()).origin === new URL(target!).origin ? route.continue() : route.abort());
});

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  test(`visitor entry is usable at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Look closer.Find your price.");
    await expect(page.getByLabel("Game", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Card number", { exact: true })).toBeVisible();
    await expect(page.locator('main a[href="/account/portfolio"]')).toBeVisible();
    const artwork = page.locator('main figure img');
    await expect(artwork).toBeVisible();
    await expect.poll(() => artwork.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    await expect(page.locator('main a[href="/agents"]')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const search = await page.getByLabel("Card number", { exact: true }).boundingBox();
    expect(search!.y + search!.height).toBeLessThan(viewport.height);
    await expect(page.locator('a[href="/market/list"]')).toHaveCount(0);

    // Capture the native form submission without invoking the catalogue backend.
    await page.route("**/prices/search?**", (route) => route.fulfill({
      status: 200, contentType: "text/html", body: "<main>Search destination</main>",
    }));
    await page.getByLabel("Game", { exact: true }).selectOption("pkm");
    await page.getByLabel("Card number", { exact: true }).fill("001 & 002");
    await page.getByRole("button", { name: "Find →", exact: true }).click();
    await page.waitForURL("**/prices/search?**");
    const result = new URL(page.url());
    expect(result.searchParams.get("game")).toBe("pkm");
    expect(result.searchParams.get("q")).toBe("001 & 002");
  });
}

test("services and artwork have useful, labelled destinations", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByText("Artwork details & credit", { exact: true }).click();
  await expect(page.getByText("Henry L. Phillips Collection, Bequest of Henry L. Phillips, 1939", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Explore Artbitrage", exact: true })).toHaveAttribute("href", "/gallery-next-door");
  await page.getByRole("link", { name: "All services →", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tools for your collection");
  for (const href of ["/account/portfolio", "/account/data", "/prices?mode=history#member-prices-heading"]) {
    await expect(page.locator(`main a[href="${href}"]`)).toContainText("Existing account");
  }
  await page.locator('main a[href="/guides/condition/checklist"]').click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("agent entry keeps read-only discovery ahead of optional participation", async ({ page }) => {
  await page.goto("/agents");
  await expect(page.locator("main")).toBeVisible();
  for (const href of ["/api/v1/manifest", "/api/openapi.json"]) {
    await expect(page.locator(`main a[href="${href}"]`).first()).toBeVisible();
  }
  await expect(page.locator('main form[method="post"]')).toHaveCount(0);
  await expect(page.locator('main input[type="password"]')).toHaveCount(0);
});

test("old entry addresses redirect to local destinations", async ({ request, page }) => {
  for (const [route, destination] of [
    ["/start", "/"],
    ["/welcome", "/"],
    ["/welcome?as=agent", "/agents"],
    ["/welcome?as=player", "/play"],
    ["/welcome?as=collector", "/account/portfolio"],
    ["/welcome?as=trader", "/account/trades"],
    ["/welcome?as=https%3A%2F%2Fexample.com", "/"],
  ]) {
    const response = await request.get(route, { maxRedirects: 0 });
    if (response.status() === 200) {
      // App Router can start streaming the shared layout before redirect().
      // It then emits its documented meta redirect instead of a 3xx header.
      const html = await response.text();
      const redirect = html.match(/<meta[^>]*id="__next-page-redirect"[^>]*>/)?.[0] ?? "";
      expect(redirect).toContain('http-equiv="refresh"');
      expect(redirect).toContain(`url=${destination}"`);
    } else {
      expect([307, 308]).toContain(response.status());
      expect(response.headers().location).toBe(destination);
    }
  }
  await page.goto("/start");
  await expect(page).toHaveURL(target + "/");
  await page.goto("/welcome?as=agent");
  await expect(page).toHaveURL(target + "/agents");
});
