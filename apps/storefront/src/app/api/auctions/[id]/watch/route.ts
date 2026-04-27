import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { toggleWatch, isWatching } from "@/lib/auction/db";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ watching: false });
  }
  const { id } = await params;
  const watching = await isWatching(session.user.id, id);
  return NextResponse.json({ watching });
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in to watch." }, { status: 401 });
  }
  const { id } = await params;
  const watching = await toggleWatch(session.user.id, id);
  return NextResponse.json({ watching });
}
