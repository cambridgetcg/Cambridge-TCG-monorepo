import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin/auth";
import { listOrdersForAdmin } from "@/lib/shop/fulfilment";

// GET — list customer_orders for admin. Filter by status; paginate.
export async function GET(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Admin access required." }, { status: 401 });
  }
  const url = new URL(request.url);
  const status = url.searchParams.get("status") || undefined;
  const limit = parseInt(url.searchParams.get("limit") || "50", 10);
  const offset = parseInt(url.searchParams.get("offset") || "0", 10);

  const result = await listOrdersForAdmin({ status, limit, offset });
  return NextResponse.json(result);
}
