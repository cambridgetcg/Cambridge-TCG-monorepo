import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { BOUNTY_PHONE_VERIFICATION_MESSAGE } from "@/lib/bounty/db";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  return NextResponse.json(
    {
      error: BOUNTY_PHONE_VERIFICATION_MESSAGE,
      code: "phone_verification_unavailable",
    },
    { status: 503, headers: { "Cache-Control": "private, no-store" } },
  );
}
