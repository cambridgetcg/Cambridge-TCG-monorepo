import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { openMysteryBox } from "@/lib/rewards/db";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in to open." }, { status: 401 });

  const { id } = await params;
  const result = await openMysteryBox(id, session.user.id);

  if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}
