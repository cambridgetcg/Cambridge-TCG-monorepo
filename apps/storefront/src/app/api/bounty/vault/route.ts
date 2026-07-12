import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listVault, type VaultItem } from "@/lib/bounty/db";

const PRIVATE_NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Sign in required." },
      { status: 401, headers: PRIVATE_NO_STORE },
    );
  }
  const url = new URL(request.url);
  const statusParam = url.searchParams.get("status");
  const allowed: VaultItem["status"][] = [
    "reserved", "redeemed", "sold_back", "traded", "gifted", "expired",
  ];
  const status = allowed.find((s) => s === statusParam);
  const items = await listVault(session.user.id, status);
  return NextResponse.json(
    {
      items: items.map((item) => ({
        ...item,
        image_url: null,
        spot_price_gbp: null,
      })),
      publication_boundary: {
        spot_price_gbp: "withheld_pending_field_level_source_rights",
        image_url: "withheld_pending_field_level_source_rights",
      },
    },
    { headers: PRIVATE_NO_STORE },
  );
}
