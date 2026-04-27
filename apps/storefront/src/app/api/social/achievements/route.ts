import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserAchievements } from "@/lib/social/db";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const achievements = await getUserAchievements(session.user.id);
  return NextResponse.json({ achievements });
}
