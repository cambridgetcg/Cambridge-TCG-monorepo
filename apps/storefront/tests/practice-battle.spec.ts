// Browser-only practice checks: loopback preview, mocked starter reads and images.
import { expect, test, type Page } from "@playwright/test";
import { STARTER_DECKS } from "../src/lib/play/starter-decks";

const BASE = new URL(process.env.STOREFRONT_BASE_URL || "http://127.0.0.1:3011");
if (!["127.0.0.1", "localhost", "[::1]"].includes(BASE.hostname)) {
  throw new Error("Practice fixtures must run against a loopback preview.");
}
const IMAGE_CREDIT = "© Browser fixture image rights holder";
const TEXT_CREDIT = "© Browser fixture text rights holder";
const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=", "base64");

async function fixtures(page: Page, mode: "official" | "catalog" | "offline") {
  await page.addInitScript(() => { localStorage.clear(); Math.random = () => 0.25; });
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    // Next can emit unoptimized CDN URLs directly. Fulfill only these fixture
    // hosts and paths locally before rejecting all other non-loopback traffic.
    if (url.protocol === "https:" && !url.search
      && ["ctcg-card-images.s3.us-east-1.amazonaws.com", "jp-op-photos.s3.us-east-1.amazonaws.com"].includes(url.host)
      && /^\/(official|cards)\/[A-Z0-9]+-[A-Z0-9]+\.png$/.test(url.pathname)) {
      return route.fulfill({ contentType: "image/png", body: PIXEL });
    }
    if (url.origin !== BASE.origin) return route.abort();
    if (url.pathname === "/_next/image") return route.fulfill({ contentType: "image/png", body: PIXEL });
    if (url.pathname.startsWith("/api/v1/play/starters/")) {
      if (mode === "offline") return route.abort();
      const starter = STARTER_DECKS.find((item) => item.id === url.pathname.split("/").at(-1));
      if (!starter) return route.fulfill({ status: 404, body: "Unknown fixture starter" });
      const card = (number: string) => ({
        card_number: number,
        image_url: mode === "catalog"
          ? `https://jp-op-photos.s3.us-east-1.amazonaws.com/cards/${number}.png`
          : `https://ctcg-card-images.s3.us-east-1.amazonaws.com/official/${number}.png`,
        image_attribution: mode === "official" ? IMAGE_CREDIT : null,
        image_reference: mode === "official" ? {
          requested_game: "op", requested_card_number: number, requested_canonical_card_number: number.toLowerCase(),
          depicted_sku: `OP-${number}-EN-R1`, depicted_canonical_sku: `op-${number.toLowerCase()}-en-r1`,
          relationship: "reference", scope: "syntax_only", reason: "english_card_number_reference",
        } : null,
        effect_text: "Fixture printed card text.", text_attribution: TEXT_CREDIT, artist: "Fixture catalog artist",
      });
      return route.fulfill({ json: { data: { leader: card(starter.leader_card_number), cards: starter.card_list.map((item) => card(item.card_number)) } } });
    }
    // No other API or provider calls are part of these presentation fixtures.
    if (url.pathname.startsWith("/api/")) return route.abort();
    return route.continue();
  });
}

async function openingHand(page: Page) {
  await page.goto(`${BASE.origin}/play/adventure/1`);
  await page.getByRole("button", { name: "Start battle", exact: true }).click();
  await page.getByRole("button", { name: "Go first", exact: true }).click();
  await expect(page.getByText("Your opening hand", { exact: true })).toBeVisible();
  await expect(page.locator("main button[aria-label]")).toHaveCount(5);
}

test("attributed practice art stays legible through setup and a small-screen card inspection", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixtures(page, "official");
  await openingHand(page);
  await expect(page.getByLabel("Card image credits")).toContainText(IMAGE_CREDIT);
  await page.getByRole("button", { name: "Keep hand", exact: true }).click();
  await expect(page.getByText(/Practice battle — saves in this browser only/)).toBeVisible();
  const yourZone = page.getByRole("region", { name: "You — your turn", exact: true });
  const inspect = yourZone.getByRole("button", { name: "Edward.Newgate", exact: true });
  await expect(inspect).toBeEnabled();
  await expect(yourZone.getByLabel("Card image credits")).toContainText(IMAGE_CREDIT);
  const hidden = page.getByRole("button", { name: "Face-down card", exact: true });
  await expect(hidden).toHaveCount(5);
  await expect(hidden.locator("img")).toHaveCount(0);
  await expect(hidden.first()).toBeDisabled();

  await inspect.click();
  const dialog = page.getByRole("dialog", { name: "Edward.Newgate", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(IMAGE_CREDIT, { exact: true })).toBeVisible();
  await expect(dialog).toContainText("English reference image · printing not verified");
  await expect(dialog).toContainText("OP-OP02-001-EN-R1");
  await expect(dialog).toContainText(TEXT_CREDIT);
  await expect(dialog).toContainText("Not verified for this reference image.");
  const box = await dialog.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  expect(box!.y + box!.height).toBeLessThanOrEqual(844);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  // The lower controls stay reachable by scrolling inside the panel.
  await dialog.getByRole("button", { name: "Close", exact: true }).last().scrollIntoViewIfNeeded();
  await expect(dialog.getByRole("button", { name: "Close", exact: true }).last()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(inspect).toBeFocused();
  await inspect.click();
  await page.mouse.click(2, 2);
  await expect(dialog).toHaveCount(0);
});

test("approved catalog fallback is visibly unverified", async ({ page }) => {
  await fixtures(page, "catalog");
  await openingHand(page);
  await expect(page.getByLabel("Card image credits")).toHaveText("Catalog image · source and printing unverified");
  await expect(page.locator("main img")).toHaveCount(5);
  await expect(page.getByText(IMAGE_CREDIT, { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Keep hand", exact: true }).click();
  const yourZone = page.getByRole("region", { name: "You — your turn", exact: true });
  await yourZone.getByRole("button", { name: "Edward.Newgate", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Catalog image · source and printing unverified");
  await expect(page.getByRole("dialog")).not.toContainText("English reference");
});

test("offline starter enrichment still reaches a playable board with text faces", async ({ page }) => {
  await fixtures(page, "offline");
  await openingHand(page);
  await expect(page.locator("main img")).toHaveCount(0);
  await page.getByRole("button", { name: "Keep hand", exact: true }).click();
  await expect(page.getByText(/Practice battle — saves in this browser only/)).toBeVisible();
  await expect(page.getByRole("button", { name: "End Turn", exact: true })).toBeEnabled();
  await expect(page.getByRole("region", { name: "You — your turn", exact: true })).toContainText("Edward.Newgate");
});
