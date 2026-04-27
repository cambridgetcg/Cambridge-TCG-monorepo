import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { setAlertEnabled, deleteAlert } from "@/lib/portfolio/alerts";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { enabled?: boolean };
  if (typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "enabled (boolean) required." }, { status: 400 });
  }
  const ok = await setAlertEnabled(id, session.user.id, body.enabled);
  if (!ok) return NextResponse.json({ error: "Alert not found." }, { status: 404 });
  return NextResponse.json({ updated: true });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const { id } = await params;
  const ok = await deleteAlert(id, session.user.id);
  if (!ok) return NextResponse.json({ error: "Alert not found." }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
