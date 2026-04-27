import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { pauseSearch } from "@/lib/market/saved-searches";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const { id } = await params;
  const result = await pauseSearch(id, session.user.id);
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: result.status });
  return NextResponse.json({ search: result.value });
}
