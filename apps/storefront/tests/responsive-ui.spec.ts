import { expect, test } from "@playwright/test";

// Exercise an explicitly started local preview, without provider or account data.
const target = process.env.STOREFRONT_BASE_URL;
const localTarget = target && ["127.0.0.1", "localhost", "[::1]"].includes(new URL(target).hostname);
test.skip(!localTarget, "Set STOREFRONT_BASE_URL to an explicitly started loopback storefront.");

test.beforeEach(async ({ context }) => {
  await context.route("**/*", (route) =>
    new URL(route.request().url()).origin === new URL(target!).origin
      ? route.continue()
      : route.abort());
});

for (const width of [320, 390, 1280, 1440]) {
  test(`entry pages and navigation fit ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.name));

    for (const path of ["/", "/agents", "/roadmap"]) {
      await page.goto(path);
      const nav = page.getByRole("navigation", { name: "Primary navigation", exact: true });
      await expect(nav.getByRole("link", { name: "Cambridge TCG home" })).toHaveText("Cambridge TCG");
      if (width < 1280) {
        await expect(nav.getByRole("button", { name: "Open menu", exact: true })).toBeVisible();
      } else {
        for (const label of ["Prices", "Services", "Standards", "Roadmap"]) {
          await expect(nav.getByRole("link", { name: label, exact: true })).toBeVisible();
        }
      }

      const footer = page.getByRole("contentinfo");
      await footer.scrollIntoViewIfNeeded();
      await expect(footer.getByRole("navigation", { name: "Legal", exact: true })).toBeVisible();
      const explore = await footer.getByRole("navigation", { name: "Explore", exact: true }).boundingBox();
      const discover = await footer.getByRole("navigation", { name: "Discover", exact: true }).boundingBox();
      expect(explore).not.toBeNull();
      expect(discover).not.toBeNull();
      // The footer stays in columns on narrow phones instead of one long list.
      expect(discover!.x).toBeGreaterThan(explore!.x);
      expect(discover!.y).toBe(explore!.y);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    expect(pageErrors).toEqual([]);
  });
}

test("menus support keyboard dismissal, outside clicks and responsive focus", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/");
  const mobile = page.locator("#mobile-navigation-trigger");
  const drawer = page.locator("#mobile-navigation");
  await mobile.focus();
  await page.keyboard.press("Enter");
  await expect(mobile).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Tab");
  await expect(drawer.getByRole("link", { name: "Search cards", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await expect(mobile).toBeFocused();

  await page.keyboard.press("Space");
  for (const label of ["Culture", "Play", "Community", "Agents & API", "Standards", "Roadmap"]) {
    await expect(drawer.getByRole("link", { name: label, exact: true })).toBeVisible();
  }
  await expect(drawer.getByRole("link", { name: "Collection Sign-in required", exact: true })).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 900 });
  const more = page.locator("#desktop-more-navigation-trigger");
  await expect(more).toBeFocused();
  await expect(drawer).toHaveCount(0);

  await page.keyboard.press("Enter");
  await expect(more).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Tab");
  await expect(page.locator("#more-navigation").getByRole("link", { name: /^Culture/ })).toBeFocused();
  const collection = page.locator('#more-navigation a[href="/account/portfolio"]');
  await expect(collection).toContainText("Sign-in required");
  await expect(page.locator('#more-navigation a[href="/play"]')).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(more).toBeFocused();
  await expect(more).toHaveAttribute("aria-expanded", "false");

  await more.click();
  await page.getByRole("heading", { level: 1 }).click({ position: { x: 1, y: 1 } });
  await expect(more).toHaveAttribute("aria-expanded", "false");
  await more.click();
  await page.setViewportSize({ width: 390, height: 900 });
  await expect(mobile).toBeFocused();
  await expect(page.locator("#more-navigation")).toHaveCount(0);
});

test("Japanese mobile navigation keeps tasks, access and language choices legible", async ({ page, context }) => {
  await context.addCookies([{ name: "lang-mode", value: "ja", url: target! }]);
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "ja");
  const nav = page.getByRole("navigation", { name: "メインナビゲーション", exact: true });
  await expect(nav.getByRole("link", { name: "Cambridge TCGのホーム" })).toHaveText("Cambridge TCG");
  await nav.getByRole("button", { name: "メニューを開く", exact: true }).click();
  const drawer = page.locator("#mobile-navigation");
  await expect(drawer.getByRole("link", { name: "価格", exact: true })).toBeVisible();
  await expect(drawer.getByRole("link", { name: "ツール", exact: true })).toBeVisible();
  await expect(drawer.getByRole("link", { name: "標準仕様", exact: true })).toBeVisible();
  await expect(drawer.getByRole("link", { name: "ロードマップ", exact: true })).toBeVisible();
  await expect(drawer.getByRole("link", { name: "コレクション ログインが必要です", exact: true })).toBeVisible();
  await nav.getByRole("button", { name: "メニューを閉じる", exact: true }).click();
  await expect(drawer).toHaveCount(0);
  const footer = page.getByRole("contentinfo");
  await footer.scrollIntoViewIfNeeded();
  await expect(footer.getByRole("link", { name: "English", exact: true })).toBeVisible();
  await expect(footer.getByText("一部のページは、まだ英語のみです。", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("opening or hovering collection links does not prefetch account pages", async ({ page }) => {
  const accountRequests: string[] = [];
  await page.route("**/account/portfolio**", (route) => {
    accountRequests.push(route.request().url());
    return route.fulfill({ status: 200, contentType: "text/html", body: "<main>Account navigation was not requested</main>" });
  });

  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const trigger = width < 1280 ? "#mobile-navigation-trigger" : "#desktop-more-navigation-trigger";
    const menu = width < 1280 ? "#mobile-navigation" : "#more-navigation";
    await page.locator(trigger).click();
    const collection = page.locator(`${menu} a[href="/account/portfolio"]`);
    await expect(collection).toBeVisible();
    await expect(collection).toContainText("Sign-in required");
    await collection.hover();
    // Allow both viewport and hover prefetch scheduling to run before checking absence.
    await page.waitForTimeout(500);
    expect(accountRequests).toEqual([]);
  }
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("card search submits an encoded native GET request", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Primary navigation", exact: true });
    await expect(nav.getByRole("link", { name: "Site map", exact: true })).toBeVisible();
    await expect(nav.getByRole("button", { name: "Open menu", exact: true })).toBeHidden();
    // Capture the navigation rather than call the catalogue backend.
    await page.route("**/prices/search?**", (route) => route.fulfill({
      status: 200, contentType: "text/html", body: "<main>Search destination</main>",
    }));
    await page.getByLabel("Game", { exact: true }).selectOption("pkm");
    await page.getByLabel("Card number", { exact: true }).fill("001 & 002");
    await page.getByRole("button", { name: "Find →", exact: true }).click();
    await page.waitForURL("**/prices/search?**");
    const destination = new URL(page.url());
    expect(destination.searchParams.get("game")).toBe("pkm");
    expect(destination.searchParams.get("q")).toBe("001 & 002");
  });
});
