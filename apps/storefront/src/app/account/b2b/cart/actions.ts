"use server";

/**
 * B2B cart — server actions.
 *
 * Every mutation gates on requireWholesalePage() — both for auth and
 * for the role check (only role∈{wholesale,admin} may modify a B2B
 * cart). The cart is keyed by user_id; users only mutate their own.
 *
 * revalidatePath() refreshes the cart page after every write so the
 * count badge / item list update without a hard reload.
 */

import { revalidatePath } from "next/cache";
import { requireWholesalePage } from "@/lib/auth/realms";
import * as cart from "@/lib/b2b/cart";
import { B2B_PURCHASE_AVAILABILITY } from "@/lib/b2b/purchase-availability";

export async function addB2BCartItem(sku: string): Promise<void> {
  if (!B2B_PURCHASE_AVAILABILITY.new_cart_items_enabled) return;
  const user = await requireWholesalePage();
  await cart.addItem(user.id, sku, 1);
  revalidatePath("/account/b2b/cart");
  revalidatePath("/account/b2b");
}

export async function setB2BCartQuantity(sku: string, quantity: number): Promise<void> {
  const user = await requireWholesalePage();
  const safeQty = Math.max(0, Math.min(9999, Math.floor(quantity)));
  await cart.setQuantity(user.id, sku, safeQty);
  revalidatePath("/account/b2b/cart");
}

export async function removeB2BCartItem(sku: string): Promise<void> {
  const user = await requireWholesalePage();
  await cart.removeItem(user.id, sku);
  revalidatePath("/account/b2b/cart");
  revalidatePath("/account/b2b");
}

export async function clearB2BCart(): Promise<void> {
  const user = await requireWholesalePage();
  await cart.clearCart(user.id);
  revalidatePath("/account/b2b/cart");
  revalidatePath("/account/b2b");
}
