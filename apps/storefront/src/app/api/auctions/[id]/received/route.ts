import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { buyerConfirmReceived } from "@/lib/auction/fulfilment";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const { id } = await params;

  const result = await buyerConfirmReceived(id, session.user.id);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: result.status ?? 400 });
  }
  return NextResponse.json({ ok: true });
}
