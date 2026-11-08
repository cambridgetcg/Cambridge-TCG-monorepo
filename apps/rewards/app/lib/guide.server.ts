/**
 * The first-time setup guide (RP-24): when a store is sent to it, and
 * "Finish later".
 *
 * The guide is due while the store has no tiers and the merchant has not
 * pressed "Finish later"; once either changes it stays away.
 */
import prisma from "~/db.server";
import { UUID } from "./uuid";

/** Whether opening the app should send this store to the guide. */
export async function guideDue(merchantId: string): Promise<boolean> {
  if (!UUID.test(merchantId)) return false;
  const due = await prisma.merchant.count({ where: { id: merchantId, guideDismissedAt: null, tiers: { none: {} } } });
  return due === 1;
}

/** The merchant pressed "Finish later": the first time is kept. */
export async function dismissGuide(merchantId: string, now: Date = new Date()): Promise<void> {
  await prisma.merchant.updateMany({ where: { id: merchantId, guideDismissedAt: null }, data: { guideDismissedAt: now } });
}
