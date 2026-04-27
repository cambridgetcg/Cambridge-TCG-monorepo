import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getEligibility, getPullTokens } from "@/lib/bounty/db";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const eligibility = await getEligibility(session.user.id);
  const tokens = await getPullTokens(session.user.id);
  return NextResponse.json({ eligibility, tokens });
}
