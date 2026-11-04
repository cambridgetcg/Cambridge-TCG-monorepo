import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workflowsSource = readFileSync(
  resolve(process.cwd(), "app/routes/app.marketing.automation.workflows.tsx"),
  "utf8",
);

/** The default body of the "Cashback Balance Reminder" marketing automation email. */
function cashbackEmailBody(): string {
  const match = workflowsSource.match(/cashback_reminder: `([\s\S]*?)`/);
  if (!match) throw new Error("the cashback_reminder template is missing");
  return match[1].replace(/<[^>]*>/g, " ");
}

describe("cashback email tells shoppers how to spend store credit", () => {
  // Shopify accepts store credit only from a shopper signed in to customer
  // accounts (or paying with Shop Pay), and only as the full balance.
  it("tells them to sign in at checkout", () => {
    expect(cashbackEmailBody()).toMatch(/sign in to your account at checkout/i);
  });

  it("names Shop Pay as the other way to spend it, as the widget and the listing do", () => {
    expect(cashbackEmailBody()).toMatch(/or pay with Shop Pay/);
  });

  it("tells them the full balance is applied", () => {
    expect(cashbackEmailBody()).toMatch(/full balance/i);
  });
});
