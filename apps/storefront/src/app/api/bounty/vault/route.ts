import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listVault, type VaultItem } from "@/lib/bounty/db";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const url = new URL(request.url);
  const statusParam = url.searchParams.get("status");
  const allowed: VaultItem["status"][] = [
    "reserved", "redeemed", "sold_back", "traded", "gifted", "expired",
  ];
  const status = allowed.find((s) => s === statusParam);
  const items = await listVault(session.user.id, status);
  return NextResponse.json({ items });
}
