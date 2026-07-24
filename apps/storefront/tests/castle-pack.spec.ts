import { expect, test } from "@playwright/test";

test("Open Door plays, rests, regrows, and clears with the keyboard", async ({
  page,
}) => {
  const response = await page.goto("/play/castle-pack");
  expect(response?.status()).toBe(200);

  await expect(
    page.getByRole("heading", { name: /Castle of Understanding/i }),
  ).toBeVisible();
  await expect(page.getByText(/Round 1 of 6/)).toBeVisible();
  await expect(page.getByText(/0\/72 actions/)).toBeVisible();

  const firstAction = page
    .getByRole("button", { name: /^(Play .+|Seat [AB] passes)$/ })
    .first();
  await firstAction.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText(/1\/72 actions/)).toBeVisible();

  const leaveWhole = page.getByRole("button", {
    name: /Leave whole as Seat A · no winner, no penalty/i,
  });
  await leaveWhole.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText(/generation 1 · rested/i)).toBeVisible();
  await expect(page.getByText(/This generation is resting/i)).toBeVisible();

  const regrow = page.getByRole("button", {
    name: /Regrow one finite generation/i,
  });
  await regrow.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText(/generation 2 · playing/i)).toBeVisible();
  await expect(page.getByText(/Round 1 of 6/)).toBeVisible();

  await page.getByRole("button", { name: /Clear local table/i }).click();
  await expect(page.getByText(/The table is clear/i)).toBeVisible();
  await expect(page.getByText(/Nothing was saved/i)).toBeVisible();
});

test("the named expansion route does not replace six-character room routes", async ({
  page,
}) => {
  const response = await page.goto("/play/ABC234");
  expect(response?.status()).not.toBe(404);
  await expect(page).toHaveURL(/\/play\/ABC234$/);
});
