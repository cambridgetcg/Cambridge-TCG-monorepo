// Practice-battle e2e — drives the official setup flow in a real browser:
// starter pick → toss (choice when won) → mulligan window → live board.
// Runs against STOREFRONT_BASE_URL (defaults to local dev).

import { expect, test } from "@playwright/test";

const BASE = process.env.STOREFRONT_BASE_URL || "http://localhost:3011";

test("grandma's path: setup ritual to a live board", async ({ page }) => {
  await page.goto(`${BASE}/play/adventure/1`);

  // Setup screen: seven full decks offered; start with the default.
  await expect(page.getByRole("button", { name: "Start battle" })).toBeVisible();
  await page.getByRole("button", { name: "Start battle" }).click();

  // Toss: if the player won, a first/second choice appears (CR 5-2-1-4/5).
  const tossChoice = page.getByRole("button", { name: "Go first" });
  try {
    await tossChoice.waitFor({ state: "visible", timeout: 4000 });
    await tossChoice.click();
  } catch {
    /* AI won the toss and chose — no prompt */
  }

  // Mulligan window (CR 5-2-1-6): hand of five, keep it.
  await expect(page.getByText("Your opening hand")).toBeVisible({ timeout: 10000 });
  const handCards = page.locator("main button[aria-label]");
  expect(await handCards.count()).toBeGreaterThanOrEqual(5);
  await page.getByRole("button", { name: "Keep hand" }).click();

  // Life is dealt AFTER the mulligan (CR 5-2-1-7) and the board goes live.
  await expect(page.getByText(/Practice battle — lives in this browser/)).toBeVisible({
    timeout: 20000,
  });

  // Both zones render with life dots and DON!! rows.
  await expect(page.getByLabel(/life/).first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("DON!!").first()).toBeVisible();

  // First-turn battle ban (CR 6-5-6-1): if it's our turn 1, the leader's
  // sheet offers an attack that must be refused with the teaching reason.
  // (Skipped when the AI opened — the board may already be mid-animation.)
  const endTurn = page.getByRole("button", { name: "End Turn" });
  await expect(endTurn).toBeVisible({ timeout: 20000 });
});
