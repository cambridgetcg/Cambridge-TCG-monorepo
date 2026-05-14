"use server";

/**
 * B2B checkout — server action that creates a Stripe Checkout Session.
 *
 * Returns a discriminated union so the client component can show
 * meaningful errors (out-of-stock SKU, missing card, etc.) before
 * the redirect happens. On success, the client navigates to
 * result.url; on failure it shows the message.
 */

import { requireWholesalePage } from "@/lib/auth/realms";
import {
  startCheckout,
  type CheckoutFailure,
  type CheckoutSuccess,
} from "@/lib/b2b/checkout";

export async function startB2BCheckout(): Promise<CheckoutSuccess | CheckoutFailure> {
  const user = await requireWholesalePage();
  return startCheckout(user.id, user.email ?? null);
}
