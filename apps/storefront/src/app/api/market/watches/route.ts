import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  addWatch,
  removeWatch,
  listWatches,
} from "@/lib/market/watches";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const watches = await listWatches(session.user.id);
  return NextResponse.json({ watches });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const { sku } = await request.json().catch(() => ({} as { sku?: string }));
  if (!sku) return NextResponse.json({ error: "sku required" }, { status: 400 });
  await addWatch(session.user.id, sku);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const { sku } = await request.json().catch(() => ({} as { sku?: string }));
  if (!sku) return NextResponse.json({ error: "sku required" }, { status: 400 });
  await removeWatch(session.user.id, sku);
  return NextResponse.json({ ok: true });
}
