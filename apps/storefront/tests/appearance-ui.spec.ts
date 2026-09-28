import { expect, test } from "@playwright/test";

const target = process.env.STOREFRONT_BASE_URL;
test.skip(!target || !["127.0.0.1", "localhost", "[::1]"].includes(new URL(target).hostname),
  "Use an explicitly started loopback preview; these checks change only browser preferences.");

test("appearance links work without JavaScript and preserve saved choices", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: target, javaScriptEnabled: false,
    viewport: { width: 320, height: 800 }, colorScheme: "dark" });
  const page = await context.newPage();
  try {
    await page.goto("/appearance");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "system");
    expect(await page.locator("html").evaluate((el) => getComputedStyle(el).colorScheme)).toBe("dark");
    for (const [label, id, scheme] of [
      ["Use light", "gallery", "light"],
      ["Use dark", "midnight", "dark"],
      ["Use terminal", "terminal", "dark"],
      ["Use high contrast", "high-contrast", "light"],
    ]) {
      await page.getByRole("link", { name: label, exact: true }).click();
      await expect(page.locator("html")).toHaveAttribute("data-theme", id);
      expect(await page.locator("html").evaluate((el) => getComputedStyle(el).colorScheme)).toBe(scheme);
      expect((await context.cookies()).find((cookie) => cookie.name === "theme")?.value).toBe(id);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.getByRole("link", { name: "Use follow system", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "system");
    expect((await context.cookies()).some((cookie) => cookie.name === "theme")).toBe(false);
    await page.getByRole("link", { name: "Turn on text-only layout", exact: true }).click();
    await expect(page.locator("body")).toHaveClass(/text-mode/);
    await page.goto("/");
    await expect(page.getByLabel("Card number", { exact: true })).toBeVisible();
    await expect(page.locator('main a[href="/agents"]')).toBeVisible();
  } finally {
    await context.close();
  }
});
