import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createPortalSession } from "@/lib/membership/subscription";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000")
  .trim()
  .replace(/\/+$/, "");

// POST — mints a Stripe Customer Portal session. Returns { url }; the
// client redirects. Portal lets the user update payment method, view
// invoices, and self-cancel — anything our DIY UI doesn't cover.
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const result = await createPortalSession(session.user.id, `${SITE_URL}/account/billing`);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: result.status ?? 400 });
  }
  return NextResponse.json({ url: result.url });
}
