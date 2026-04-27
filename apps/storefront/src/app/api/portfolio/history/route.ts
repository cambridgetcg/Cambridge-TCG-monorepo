import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSnapshots } from "@/lib/portfolio/db";

// GET — portfolio value history for chart
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const url = new URL(request.url);
  const days = parseInt(url.searchParams.get("days") || "30", 10);

  const snapshots = await getSnapshots(session.user.id, days);
  return NextResponse.json({ snapshots });
}
