// Stripe Connect — seller payouts via Express accounts.
//
// Sellers onboard once via a hosted Stripe link (KYC + bank). The platform
// then sends Transfers from its own Stripe balance to the seller's connected
// account. We don't use destination charges or application fees here —
// commission is already deducted at match time and stored as
// market_trades.seller_payout / auctions.seller_payout. The Transfer just
// moves that net amount.
//
// Required Stripe dashboard setup (one-time, manual):
//   1. Connect → Get started → enable Express accounts
//   2. Connect → Settings → set platform branding + return/refresh URLs
//      (returns are derived from NEXT_PUBLIC_SITE_URL at request time)
//
// Required env:
//   STRIPE_SECRET_KEY  — already used elsewhere
//   NEXT_PUBLIC_SITE_URL — to build account-link return/refresh URLs

import Stripe from "stripe";
import { query } from "@/lib/db";

function getStripe(): Stripe {
  // Lazy init so module load doesn't fail when STRIPE_SECRET_KEY is missing
  // (e.g. local dev without .env.local). Routes that need Stripe will then
  // get a clean runtime error instead of a module-load crash.
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  return new Stripe(key.trim(), { apiVersion: "2026-02-25.clover" });
}

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").trim().replace(/\/+$/, "");

export interface ConnectStatus {
  accountId: string | null;
  status: string | null;          // 'pending' | 'incomplete' | 'verified' | 'restricted' | 'rejected'
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  updatedAt: string | null;
}

export async function getConnectStatus(userId: string): Promise<ConnectStatus> {
  const r = await query(
    `SELECT stripe_connect_account_id, stripe_connect_status,
            stripe_connect_charges_enabled, stripe_connect_payouts_enabled,
            stripe_connect_updated_at
       FROM users WHERE id = $1`,
    [userId]
  );
  const row = r.rows[0];
  return {
    accountId: row?.stripe_connect_account_id ?? null,
    status: row?.stripe_connect_status ?? null,
    chargesEnabled: !!row?.stripe_connect_charges_enabled,
    payoutsEnabled: !!row?.stripe_connect_payouts_enabled,
    updatedAt: row?.stripe_connect_updated_at ?? null,
  };
}

// ISO 3166-1 alpha-2 country codes Stripe Connect supports for Express.
// Full list is long; we expose the common ones to sellers. Country is
// permanent for an Express account once set, so the UI should be clear.
export const SUPPORTED_COUNTRIES = [
  "GB", "IE", "US", "CA", "AU", "NZ",
  "FR", "DE", "ES", "IT", "NL", "BE", "AT", "PT", "FI", "SE", "DK", "NO",
  "CH", "PL", "CZ", "HU", "RO", "GR", "LU", "EE", "LV", "LT", "SK", "SI", "BG", "HR", "CY", "MT",
  "JP", "SG", "HK", "AE",
] as const;
export type SupportedCountry = typeof SUPPORTED_COUNTRIES[number];

// Create a fresh Express account for the user and persist the id. Idempotent:
// if one already exists we return it regardless of the requested country
// (country is fixed once the account is created).
export async function getOrCreateAccount(
  userId: string,
  email: string,
  country: SupportedCountry = "GB"
): Promise<string> {
  const existing = await getConnectStatus(userId);
  if (existing.accountId) return existing.accountId;

  const stripe = getStripe();
  const account = await stripe.accounts.create({
    type: "express",
    country,
    email,
    capabilities: {
      transfers: { requested: true },
    },
    business_type: "individual",
    metadata: { userId },
  });

  await query(
    `UPDATE users SET stripe_connect_account_id = $2,
                      stripe_connect_status = 'pending',
                      stripe_connect_updated_at = NOW()
      WHERE id = $1`,
    [userId, account.id]
  );

  return account.id;
}

// Generates a one-time hosted onboarding URL. Account links expire quickly,
// so we always create a fresh one when the user clicks "Connect".
export async function createOnboardingLink(accountId: string): Promise<string> {
  const stripe = getStripe();
  const link = await stripe.accountLinks.create({
    account: accountId,
    type: "account_onboarding",
    refresh_url: `${SITE}/account/payouts?onboarding=refresh`,
    return_url: `${SITE}/account/payouts?onboarding=return`,
  });
  return link.url;
}

// Pulls the current state from Stripe and writes it onto the user row. Called
// from the webhook (account.updated) and from a "Refresh" button on the UI.
// Fires a one-time welcome email the first time the account transitions to
// 'verified' (detected by comparing the prior status row).
export async function syncAccountFromStripe(accountId: string): Promise<ConnectStatus | null> {
  const stripe = getStripe();
  const account = await stripe.accounts.retrieve(accountId);

  // Map Stripe's flag soup → our compact status enum
  const status =
    account.requirements?.disabled_reason ? "restricted" :
    account.payouts_enabled && account.charges_enabled ? "verified" :
    (account.requirements?.currently_due?.length || account.requirements?.past_due?.length) ? "incomplete" :
    "pending";

  // Read prior status so we can detect the "just became verified" edge
  const prior = await query(
    `SELECT id, email, name, stripe_connect_status
       FROM users WHERE stripe_connect_account_id = $1`,
    [accountId]
  );
  const priorStatus = prior.rows[0]?.stripe_connect_status ?? null;

  await query(
    `UPDATE users
        SET stripe_connect_status = $2,
            stripe_connect_charges_enabled = $3,
            stripe_connect_payouts_enabled = $4,
            stripe_connect_updated_at = NOW()
      WHERE stripe_connect_account_id = $1`,
    [accountId, status, !!account.charges_enabled, !!account.payouts_enabled]
  );

  // First-verified transition: welcome email, fire-and-forget
  if (status === "verified" && priorStatus !== "verified" && prior.rows[0]?.email) {
    const { sendPayoutReadyEmail } = await import("@/lib/market/email");
    sendPayoutReadyEmail({
      email: prior.rows[0].email,
      name: prior.rows[0].name,
    }).catch((err) => console.error("[payouts] Welcome email failed:", err));
  }

  if (prior.rows.length === 0) return null;
  return getConnectStatus(prior.rows[0].id);
}

// Create a Transfer to the seller's connected account. amount is in pounds
// (we convert to pence). Returns the transfer id; callers persist it onto
// the trade/auction row alongside the existing payout fields.
//
// idempotencyKey should be stable per logical payout (e.g. "trade-<id>") so
// that a retry after a transient failure doesn't double-pay. Stripe will
// return the original transfer object on a duplicate key.
export async function createTransferToSeller(opts: {
  sellerUserId: string;
  amountGbp: number;
  description: string;
  idempotencyKey: string;
  metadata?: Record<string, string>;
}): Promise<{ transferId: string }> {
  const status = await getConnectStatus(opts.sellerUserId);
  if (!status.accountId) {
    throw new Error("Seller has not connected a Stripe account.");
  }
  if (!status.payoutsEnabled) {
    throw new Error("Seller's Stripe account is not yet enabled for payouts.");
  }

  const stripe = getStripe();
  const transfer = await stripe.transfers.create(
    {
      amount: Math.round(opts.amountGbp * 100),
      currency: "gbp",
      destination: status.accountId,
      description: opts.description,
      metadata: opts.metadata,
    },
    { idempotencyKey: opts.idempotencyKey }
  );

  return { transferId: transfer.id };
}
