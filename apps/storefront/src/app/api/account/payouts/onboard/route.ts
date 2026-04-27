import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getOrCreateAccount,
  createOnboardingLink,
  SUPPORTED_COUNTRIES,
  type SupportedCountry,
} from "@/lib/payouts/stripe-connect";

// POST — start (or continue) Stripe Connect onboarding.
// Optional body: { country: "GB" } (defaults to GB). Country is only used
// on first-time account creation; for returning sellers it's ignored since
// Stripe Express accounts have a fixed country.
// Returns a hosted onboarding URL the client should redirect to.
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const rawCountry = typeof body.country === "string" ? body.country.toUpperCase() : "GB";
  if (!(SUPPORTED_COUNTRIES as readonly string[]).includes(rawCountry)) {
    return NextResponse.json(
      { error: `Country '${rawCountry}' is not supported. Supported: ${SUPPORTED_COUNTRIES.join(", ")}` },
      { status: 400 }
    );
  }
  const country = rawCountry as SupportedCountry;

  try {
    const accountId = await getOrCreateAccount(session.user.id, session.user.email, country);
    const url = await createOnboardingLink(accountId);
    return NextResponse.json({ url });
  } catch (err) {
    console.error("[payouts] Onboarding link error:", err);
    const msg = err instanceof Error ? err.message : "Failed to start onboarding";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
