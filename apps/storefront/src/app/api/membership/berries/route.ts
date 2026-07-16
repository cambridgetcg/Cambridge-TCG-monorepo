import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPointsHistory } from "@/lib/membership/db";

// Canonical route for the Berries ledger.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const history = await getPointsHistory(session.user.id, 50);
  return NextResponse.json({ history });
}
