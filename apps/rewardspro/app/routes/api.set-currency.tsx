import { json } from "@remix-run/node";
import type { ActionFunction } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

type Currency =
  | "USD" | "EUR" | "GBP" | "CAD" | "AUD" | "JPY" | "CHF" | "CNY"
  | "SEK" | "NZD" | "NOK" | "MXN" | "SGD" | "HKD" | "KRW" | "TRY"
  | "INR" | "RUB" | "BRL" | "ZAR" | "AED" | "PLN" | "DKK" | "THB"
  | "IDR" | "HUF" | "CZK" | "ILS" | "CLP" | "PHP" | "RON" | "MYR";

type CurrencyDisplayType = "SYMBOL" | "CODE";

const CURRENCY_OPTIONS = [
  "USD", "EUR", "GBP", "CAD", "AUD", "JPY", "CHF", "CNY",
  "SEK", "NZD", "NOK", "MXN", "SGD", "HKD", "KRW", "TRY",
  "INR", "RUB", "BRL", "ZAR", "AED", "PLN", "DKK", "THB",
  "IDR", "HUF", "CZK", "ILS", "CLP", "PHP", "RON", "MYR"
];

export const action: ActionFunction = async ({ request }) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const { session } = await authenticate.admin(request);
    const shop = session.shop;

    const body = await request.json();
    const { currency, displayType } = body;

    // Validate currency
    if (!currency || !CURRENCY_OPTIONS.includes(currency)) {
      return json({ error: "Invalid currency selected" }, { status: 400 });
    }

    // Validate display type (optional, defaults to SYMBOL)
    const currencyDisplayType: CurrencyDisplayType = displayType === "CODE" ? "CODE" : "SYMBOL";

    // Update the store settings with selected currency and mark as selected
    await prisma.shopSettings.update({
      where: { shop },
      data: {
        storeCurrency: currency as Currency,
        currencyDisplayType,
        currencySelected: true,
        updatedAt: new Date(),
      },
    });

    return json({ success: true });
  } catch (error) {
    console.error("Error setting currency:", error);
    return json({ error: "Failed to save currency selection" }, { status: 500 });
  }
};
