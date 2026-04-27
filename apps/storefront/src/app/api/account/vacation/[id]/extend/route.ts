import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { extendVacation } from "@/lib/market/vacation";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { newEndsAt?: string };
  if (!body.newEndsAt) {
    return NextResponse.json({ error: "newEndsAt required." }, { status: 400 });
  }
  const result = await extendVacation({
    vacationId: id,
    userId: session.user.id,
    newEndsAt: body.newEndsAt,
  });
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: result.status });
  return NextResponse.json({ vacation: result.value });
}
