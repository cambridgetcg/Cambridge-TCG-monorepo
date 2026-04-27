import Stripe from "stripe";

// Lazy Stripe client. Top-level `new Stripe(process.env.STRIPE_SECRET_KEY!.trim())`
// crashes at build time (page-data collection) when the env var isn't
// present, breaking `next build` outside of CI/production.
//
// Construct on first use instead so route modules can be loaded safely
// without secrets, and we centralise the API version pin in one place.
let cached: Stripe | null = null;

export function getStripe(): Stripe {
  if (cached) return cached;
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY is not configured. Set it in .env.local (dev) or " +
      "the Vercel project's environment (prod) before invoking Stripe routes.",
    );
  }
  cached = new Stripe(key, { apiVersion: "2026-02-25.clover" });
  return cached;
}
