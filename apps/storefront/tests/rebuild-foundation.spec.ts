import { expect, test } from "@playwright/test";

const target = process.env.STOREFRONT_BASE_URL;
test.skip(!target || !["127.0.0.1", "localhost", "[::1]"].includes(new URL(target).hostname), "Use an explicitly started loopback preview.");

test.beforeEach(async ({ context }) => {
  await context.route("**/*", (route) => new URL(route.request().url()).origin === new URL(target!).origin ? route.continue() : route.abort());
});

for (const width of [320, 1440]) {
  test(`room and contract journey at ${width}px`, async ({ page, request }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("There is more to a card.");
    await page.getByRole("link", { name: "Read a card, one detail at a time →", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("The same card. A different copy.");
    await page.getByRole("link", { name: "Read the data contract", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("SKU & price contracts");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const contract = await (await request.get("/api/v1/contracts/card-data")).json();
    expect(contract.data.identity.scope).toBe("syntax_only");
    const schemaUrl = new URL(contract.data.schemas.money.$id).pathname;
    const schema = await request.get(schemaUrl);
    expect(schema.ok()).toBe(true);
    expect((await schema.json()).properties.unit.const).toBe("major");
    await page.goto("/map");
    const directory = await (await request.get("/api/v1/rooms")).json();
    for (const room of directory.data.rooms) {
      await expect(page.locator(`main li[id="${room.id}"] h2`)).toHaveText(room.title);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.locator('main a[href^="/admin"]')).toHaveCount(0);
  });
}
