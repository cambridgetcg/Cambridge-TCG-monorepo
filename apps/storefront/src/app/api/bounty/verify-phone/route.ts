import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { markPhoneVerified } from "@/lib/bounty/db";

// MVP stub: accepts a phone number and marks the user verified without
// actually sending an SMS. Replace with Twilio/Vonage before production —
// search for "TODO: SMS" in this file when you wire it up.
//
// The real flow should be:
//   1) POST { phone } → server generates 6-digit OTP, stores hash, sends SMS
//   2) POST { phone, otp } → server verifies + calls markPhoneVerified

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const { phone } = (await request.json().catch(() => ({}))) as { phone?: string };
  if (!phone || typeof phone !== "string") {
    return NextResponse.json({ error: "Phone number required." }, { status: 400 });
  }
  const cleaned = phone.trim();
  if (cleaned.length < 7 || cleaned.length > 25) {
    return NextResponse.json({ error: "Phone number looks wrong." }, { status: 400 });
  }

  // TODO: SMS — send OTP here and verify it in a second round trip.
  // For MVP we trust the user's submission and mark verified immediately so
  // the gate is wired end-to-end.
  await markPhoneVerified(session.user.id, cleaned);

  return NextResponse.json({ verified: true, phone: cleaned });
}
