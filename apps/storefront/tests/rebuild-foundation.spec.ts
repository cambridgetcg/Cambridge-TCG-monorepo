import { expect, test } from "@playwright/test";
import { INTEGRATION_ROADMAP } from "../src/content/platform";

const target = process.env.STOREFRONT_BASE_URL;
test.skip(!target || !["127.0.0.1", "localhost", "[::1]"].includes(new URL(target).hostname), "Use an explicitly started loopback preview.");

test.beforeEach(async ({ context }) => {
  await context.route("**/*", (route) => new URL(route.request().url()).origin === new URL(target!).origin ? route.continue() : route.abort());
});

for (const width of [320, 1440]) {
  test(`room and contract journey at ${width}px`, async ({ page, request }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("TCG data.Made to connect.");
    await page.getByRole("link", { name: "Where is the card number?", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("The same card. A different copy.");
    await page.getByRole("link", { name: "Read the data contract", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("SKU, image & price contracts");
    await expect(page.getByRole("heading", { name: "English reference images", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const contract = await (await request.get("/api/v1/contracts/card-data")).json();
    expect(contract.data.identity.scope).toBe("syntax_only");
    const schemaUrl = new URL(contract.data.schemas.money.$id).pathname;
    const schema = await request.get(schemaUrl);
    expect(schema.ok()).toBe(true);
    expect((await schema.json()).properties.unit.const).toBe("major");
    const imageSchema = await request.get(new URL(contract.data.schemas.image_reference.$id).pathname);
    expect(imageSchema.ok()).toBe(true);
    expect((await imageSchema.json()).properties.relationship.const).toBe("reference");
    expect(contract.data.images.english_base_reference.example).toMatchObject({
      requested_sku: "OP-OP01-001-JP-V11DZ", depicted_sku: "OP-OP01-001-EN", scope: "syntax_only",
    });
    await page.goto("/map");
    const directory = await (await request.get("/api/v1/rooms")).json();
    for (const room of directory.data.rooms) {
      await expect(page.locator(`main li[id="${room.id}"] h2`)).toHaveText(room.title);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.locator('main a[href^="/admin"]')).toHaveCount(0);
  });
}

test("roadmap HTML and JSON preserve the same status, evidence and release gates", async ({ page, request }) => {
  const response = await request.get("/api/v1/roadmap");
  expect(response.ok()).toBe(true);
  const roadmap = (await response.json()).data;
  expect(roadmap).toEqual(INTEGRATION_ROADMAP);
  expect(roadmap.scope).toBe("planning_snapshot");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const foundations = page.getByRole("region", { name: "Four foundations. One connected view.", exact: true });
  for (const area of INTEGRATION_ROADMAP.foundations) {
    const entry = foundations.locator(`a[href="/roadmap#${area.id}"]`);
    await expect(entry).toContainText(area.title);
    await expect(entry).toContainText(area.status);
  }
  await foundations.getByRole("link", { name: "Integration roadmap →", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Build the connections.");
  await expect(page.locator("main")).toContainText(`Reviewed ${INTEGRATION_ROADMAP.reviewed_at}.`);

  for (const area of INTEGRATION_ROADMAP.foundations) {
    const section = page.getByRole("region", { name: area.title, exact: true });
    await expect(section).toHaveAttribute("id", area.id);
    for (const text of [area.status, area.purpose, area.current, area.next]) {
      await expect(section).toContainText(text);
    }
    await section.getByText("Ready when", { exact: true }).click();
    await expect(section.getByText(area.acceptance, { exact: true })).toBeVisible();
    await expect(section.getByRole("link", { name: `${area.linkLabel} →`, exact: true })).toHaveAttribute("href", area.href);
  }

  const stages = page.getByRole("region", { name: "The delivery order", exact: true }).locator("ol > li");
  await expect(stages).toHaveCount(INTEGRATION_ROADMAP.stages.length);
  for (const [index, stage] of INTEGRATION_ROADMAP.stages.entries()) {
    const item = stages.nth(index);
    await expect(item.getByRole("heading")).toContainText(stage.title);
    await expect(item.getByRole("heading")).toContainText(stage.status);
    await expect(item).toContainText(stage.outcome);
    await item.getByText("Release gate", { exact: true }).click();
    await expect(item.getByText(stage.gate, { exact: true })).toBeVisible();
  }
  const releases = page.getByRole("region", { name: "Open in layers", exact: true });
  await expect(releases).toContainText(INTEGRATION_ROADMAP.release_status);
  await expect(releases).toContainText(INTEGRATION_ROADMAP.rights);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
