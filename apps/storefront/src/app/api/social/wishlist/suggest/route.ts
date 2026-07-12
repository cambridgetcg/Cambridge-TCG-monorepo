import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { LEGACY_WHOLESALE_FIELD_BLOCK_REASON } from "@/lib/public-wholesale-fields";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  return NextResponse.json(
    {
      error: "Price suggestions are paused pending source-rights review.",
      reason: LEGACY_WHOLESALE_FIELD_BLOCK_REASON,
      samples: 0,
      suggestion: null,
    },
    { status: 503, headers: { "Cache-Control": "private, no-store" } },
  );
}
