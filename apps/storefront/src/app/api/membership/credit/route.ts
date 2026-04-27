import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getCreditHistory } from "@/lib/membership/db";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const history = await getCreditHistory(session.user.id, 50);
  return NextResponse.json({ history });
}
