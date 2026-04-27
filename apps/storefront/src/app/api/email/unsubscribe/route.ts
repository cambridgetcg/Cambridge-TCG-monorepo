import { NextResponse } from "next/server";
import { applyUnsubscribe, verifyUnsubscribeToken, CATEGORY_LABELS } from "@/lib/email/preferences";

// GET /api/email/unsubscribe?token=... — user clicked the footer link.
// Applies the opt-out and redirects to a confirmation page. No login required;
// the HMAC-signed token is the proof.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (!token) return NextResponse.redirect(new URL("/account/emails?unsubscribe=missing", url.origin));

  const verified = verifyUnsubscribeToken(token);
  if (!verified) {
    return NextResponse.redirect(new URL("/account/emails?unsubscribe=invalid", url.origin));
  }

  await applyUnsubscribe({
    userId: verified.userId,
    category: verified.category,
    source: "email_link",
    ip: request.headers.get("x-forwarded-for") ?? null,
    userAgent: request.headers.get("user-agent") ?? null,
  });

  const label = encodeURIComponent(CATEGORY_LABELS[verified.category]);
  return NextResponse.redirect(
    new URL(`/account/emails?unsubscribed=${verified.category}&label=${label}`, url.origin),
  );
}

// POST /api/email/unsubscribe?token=... — RFC 8058 one-click from Gmail/Apple.
// Must return 2xx on success and never require interaction.
export async function POST(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Missing token." }, { status: 400 });

  const verified = verifyUnsubscribeToken(token);
  if (!verified) return NextResponse.json({ error: "Invalid or expired token." }, { status: 400 });

  await applyUnsubscribe({
    userId: verified.userId,
    category: verified.category,
    source: "list_unsubscribe",
    ip: request.headers.get("x-forwarded-for") ?? null,
    userAgent: request.headers.get("user-agent") ?? null,
  });

  return NextResponse.json({ unsubscribed: verified.category });
}
