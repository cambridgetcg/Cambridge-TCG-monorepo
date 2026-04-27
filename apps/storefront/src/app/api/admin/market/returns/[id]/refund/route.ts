import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin/auth";
import { refundReturn } from "@/lib/market/returns";

// Admin issues the refund. The seller has confirmed receipt of the
// returned card; admin moves the money. Money movement is admin-
// mediated so a seller can't accept a return then keep both card
// and payment. Audit trail goes through @/lib/admin/governance-log.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Admin access required." }, { status: 401 });
  }
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    amount?: number;
    note?: string;
    adminLabel?: string;
  };

  const result = await refundReturn({
    returnId: id,
    adminLabel: body.adminLabel || "admin",
    amount: typeof body.amount === "number" ? body.amount : undefined,
    note: body.note,
  });
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: result.status });
  return NextResponse.json({ return: result.value });
}
