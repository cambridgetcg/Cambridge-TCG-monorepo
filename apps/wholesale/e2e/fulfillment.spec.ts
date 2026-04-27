import { test, expect } from "@playwright/test";
import { adminLogin } from "./helpers";

test.describe("Fulfillment page", () => {
  test("Nav shows Fulfillment link for logged-in client", async ({ page }) => {
    await adminLogin(page);

    // Desktop nav should contain Fulfillment link
    const fulfillmentLink = page.locator('nav a[href="/fulfillment"]');
    await expect(fulfillmentLink).toBeVisible({ timeout: 5_000 });
    expect(await fulfillmentLink.textContent()).toBe("Fulfillment");
  });

  test("Fulfillment page loads with correct sections", async ({ page }) => {
    await adminLogin(page);

    await page.goto("/fulfillment");
    await expect(
      page.locator("h1", { hasText: "Fulfillment" }),
    ).toBeVisible({ timeout: 15_000 });

    // Should show both section headings
    await expect(
      page.locator("h2", { hasText: "Fulfilled" }),
    ).toBeVisible();
    await expect(
      page.locator("h2", { hasText: "Pending" }),
    ).toBeVisible();
  });

  test("Fulfillment page shows pending items or empty state", async ({ page }) => {
    await adminLogin(page);

    await page.goto("/fulfillment");
    await expect(
      page.locator("h1", { hasText: "Fulfillment" }),
    ).toBeVisible({ timeout: 15_000 });

    // Either a table with pending items or an "All items have been fulfilled" message
    const pendingSection = page.locator("section").last();
    const hasTable = await pendingSection.locator("table").count() > 0;
    const hasEmptyMsg = await pendingSection.locator("text=All items have been fulfilled").count() > 0;
    const hasNoOrders = await page.locator("text=No orders with fulfillment tracking yet").count() > 0;

    expect(hasTable || hasEmptyMsg || hasNoOrders).toBe(true);
    console.log(
      `Fulfillment page state: ${hasNoOrders ? "no orders" : hasTable ? "has pending items" : "all fulfilled"}`,
    );
  });

  test("Shows overall progress and per-order progress cards", async ({ page }) => {
    await adminLogin(page);

    await page.goto("/fulfillment");
    await expect(
      page.locator("h1", { hasText: "Fulfillment" }),
    ).toBeVisible({ timeout: 15_000 });

    // Overall progress metric next to heading (e.g., "86 / 248 items overall")
    const overallProgress = page.locator("span", { hasText: /\d+ \/ \d+ items overall/ });
    await expect(overallProgress).toBeVisible();

    // Per-order progress cards — could be buttons (multi-order toggle) or divs (single order)
    const cardsGrid = page.locator("div.grid");
    const buttons = cardsGrid.locator("button");
    const divCards = cardsGrid.locator("> div");
    const buttonCount = await buttons.count();
    const divCount = await divCards.count();
    const cardCount = buttonCount > 0 ? buttonCount : divCount;
    expect(cardCount).toBeGreaterThan(0);
    console.log(`Found ${cardCount} order progress cards (${buttonCount > 0 ? "toggle buttons" : "static cards"})`);

    // First card shows "Order #XX" text and fraction
    const firstCard = buttonCount > 0 ? buttons.first() : divCards.first();
    await expect(firstCard.getByText(/Order #\d+/)).toBeVisible();
    await expect(firstCard.getByText(/\d+ \/ \d+/)).toBeVisible();
  });

  test("Pending items are sorted by card number", async ({ page }) => {
    await adminLogin(page);

    await page.goto("/fulfillment");
    await expect(
      page.locator("h1", { hasText: "Fulfillment" }),
    ).toBeVisible({ timeout: 15_000 });

    // Get all card numbers from the pending section
    const pendingSection = page.locator("section").last();
    const hasTable = await pendingSection.locator("table").count() > 0;
    if (!hasTable) {
      console.log("No pending items to check sort order");
      return;
    }

    const cardNumbers = await pendingSection
      .locator("span.font-mono.text-brand-500")
      .allTextContents();

    // Verify sorted: each card number's numeric prefix <= next
    let sorted = true;
    for (let i = 1; i < cardNumbers.length; i++) {
      const prev = parseInt(cardNumbers[i - 1]) || 0;
      const curr = parseInt(cardNumbers[i]) || 0;
      if (prev > curr) {
        sorted = false;
        break;
      }
    }
    expect(sorted).toBe(true);
    console.log(`Verified ${cardNumbers.length} pending items are sorted by card number`);
  });

  test("Order detail page shows fulfillment column for paid+ orders", async ({ page }) => {
    await adminLogin(page);

    // Get a paid+ order ID from the fulfillment page progress card
    await page.goto("/fulfillment");
    await expect(
      page.locator("h1", { hasText: "Fulfillment" }),
    ).toBeVisible({ timeout: 15_000 });

    // Extract order ID from the "Order #XX" span inside the first progress card
    const cardsGrid = page.locator("div.grid");
    const firstCard = (await cardsGrid.locator("button").count()) > 0
      ? cardsGrid.locator("button").first()
      : cardsGrid.locator("> div").first();
    const orderSpan = firstCard.locator("span.font-medium");
    const orderText = await orderSpan.textContent();
    const orderIdMatch = orderText?.match(/Order #(\d+)/);
    expect(orderIdMatch).toBeTruthy();
    const orderId = orderIdMatch![1];

    // Navigate to the order detail page
    await page.goto(`/orders/${orderId}`);
    await expect(
      page.locator("h1", { hasText: /Order #\d+/ }),
    ).toBeVisible({ timeout: 15_000 });

    // Should have a "Fulfilled" column header
    await expect(
      page.locator("th", { hasText: "Fulfilled" }),
    ).toBeVisible();

    // Should have a fulfillment progress bar with "X / Y items"
    await expect(
      page.getByText("Fulfillment:"),
    ).toBeVisible();
    await expect(
      page.getByText(/\d+ \/ \d+ items/),
    ).toBeVisible();
  });

  test("Mobile nav shows Fulfillment link", async ({ page, browserName }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "Mobile-only test");

    await adminLogin(page);

    // Open hamburger menu
    const hamburger = page.locator('button[aria-label="Toggle menu"]');
    await expect(hamburger).toBeVisible({ timeout: 5_000 });
    await hamburger.click();

    const fulfillmentLink = page.locator('nav a[href="/fulfillment"]');
    await expect(fulfillmentLink).toBeVisible({ timeout: 5_000 });
  });
});
