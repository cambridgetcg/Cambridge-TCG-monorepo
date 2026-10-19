/**
 * Email marketing consent.
 *
 * Customer.acceptsMarketing is true only when Shopify reports the
 * shopper's email marketing consent as SUBSCRIBED (customer sync and the
 * customers/create and customers/update webhooks), and turns false when
 * they unsubscribe here (signed link, List-Unsubscribe one-click) or at
 * SendGrid. Customer.marketingConsentUpdatedAt is the time of the consent
 * now held, so the most recent decision wins: a newer Shopify subscription
 * re-subscribes, an older one never overrides an unsubscribe made here.
 * Hard bounces and spam reports set emailSuppressed, which consent never
 * lifts.
 */

import crypto from "node:crypto";
import type { Prisma } from "@prisma/client";
import prisma from "~/db.server";

export interface ShopifyMarketingConsent {
  subscribed: boolean;
  updatedAt: Date | null;
}

/**
 * Shopify's consent state: email_marketing_consent.state on webhooks
 * ("subscribed"), emailMarketingConsent.marketingState in GraphQL
 * ("SUBSCRIBED"). Anything else, including pending double opt-in, is not
 * consent.
 */
export function consentFromShopify(
  state: string | null | undefined,
  consentUpdatedAt: string | null | undefined,
): ShopifyMarketingConsent {
  const updatedAt = consentUpdatedAt ? new Date(consentUpdatedAt) : null;
  return {
    subscribed: state?.toUpperCase() === "SUBSCRIBED",
    updatedAt: updatedAt && !Number.isNaN(updatedAt.getTime()) ? updatedAt : null,
  };
}

type ConsentFields = { acceptsMarketing: boolean; marketingConsentUpdatedAt: Date | null };

/** Fields to write for consent reported by Shopify, given what is stored now. */
export function marketingConsentUpdate(
  incoming: ShopifyMarketingConsent,
  current: ConsentFields | null,
): Partial<ConsentFields> {
  const held = current?.marketingConsentUpdatedAt ?? null;
  if (!incoming.subscribed) {
    // Not consenting always applies; keep the latest decision time
    const latest = [incoming.updatedAt, held].filter((d): d is Date => d !== null).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
    return { acceptsMarketing: false, marketingConsentUpdatedAt: latest };
  }
  // An unsubscribe recorded here stands unless Shopify's subscription is newer
  if (current && !current.acceptsMarketing && held && !(incoming.updatedAt && incoming.updatedAt > held)) {
    return {};
  }
  return { acceptsMarketing: true, marketingConsentUpdatedAt: incoming.updatedAt };
}

/** Customers marketing email may go to. */
export const MARKETING_AUDIENCE = {
  acceptsMarketing: true,
  emailSuppressed: false,
  email: { not: "" },
} satisfies Prisma.CustomerWhereInput;

/** Record an unsubscribe. Returns false when the customer no longer exists. */
export async function recordUnsubscribe(shop: string, customerId: string, at = new Date()): Promise<boolean> {
  const { count } = await prisma.customer.updateMany({
    where: { id: customerId, shop },
    data: { acceptsMarketing: false, marketingConsentUpdatedAt: at },
  });
  return count > 0;
}

// ============================================================================
// Unsubscribe links
// ============================================================================

const TOKEN_VERSION = 1;

/** A key for unsubscribe links only, derived from ENCRYPTION_SECRET. */
function signingKey(): Buffer {
  const secret = process.env.ENCRYPTION_SECRET;
  if (!secret) throw new Error("ENCRYPTION_SECRET is required to sign unsubscribe links");
  return crypto.createHmac("sha256", secret).update("rewardspro:email-unsubscribe:v1").digest();
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", signingKey()).update(payload).digest("base64url");
}

/** An unforgeable token naming one customer of one shop. It does not expire. */
export function unsubscribeToken(shop: string, customerId: string): string {
  const payload = Buffer.from(JSON.stringify({ v: TOKEN_VERSION, s: shop, c: customerId })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyUnsubscribeToken(token: string | null | undefined): { shop: string; customerId: string } | null {
  const [payload, signature, extra] = (token ?? "").split(".");
  if (!payload || !signature || extra !== undefined) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  try {
    const { v, s, c } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return v === TOKEN_VERSION && typeof s === "string" && typeof c === "string" ? { shop: s, customerId: c } : null;
  } catch {
    return null;
  }
}

/** The unsubscribe page on the app host (routes/email.unsubscribe.tsx). */
export function unsubscribeUrl(shop: string, customerId: string): string {
  const appUrl = process.env.SHOPIFY_APP_URL;
  if (!appUrl) throw new Error("SHOPIFY_APP_URL is required to build unsubscribe links");
  const url = new URL("/email/unsubscribe", appUrl);
  url.searchParams.set("token", unsubscribeToken(shop, customerId));
  return url.toString();
}
