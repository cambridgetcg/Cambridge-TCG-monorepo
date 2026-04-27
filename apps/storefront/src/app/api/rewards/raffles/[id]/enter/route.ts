import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { enterRaffle } from "@/lib/rewards/db";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in to enter." }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const entries = body.entries || 1;

  const result = await enterRaffle(id, session.user.id, entries);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });

  return NextResponse.json(result);
}
