import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin/auth";
import { adminFulfil } from "@/lib/auction/fulfilment";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  if (body.action !== "receive" && body.action !== "dispatch") {
    return NextResponse.json({ error: "Unknown action. Use 'receive' or 'dispatch'." }, { status: 400 });
  }

  const result = await adminFulfil(id, {
    action: body.action,
    tracking: body.tracking,
    carrier: body.carrier,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: result.status ?? 400 });
  }
  return NextResponse.json({ ok: true });
}
