import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin/auth";
import { getGovernanceLog } from "@/lib/admin/governance-log";

// Admin-only governance log feed. Optionally scoped to a specific
// target user via ?user_id=…

export async function GET(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(request.url);
  const targetUserId = url.searchParams.get("user_id") ?? undefined;
  const entries = await getGovernanceLog({ targetUserId, limit: 200 });
  return NextResponse.json({ entries });
}
