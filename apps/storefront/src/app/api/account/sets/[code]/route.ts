import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSetDetail } from "@/lib/portfolio/sets";

// GET /api/account/sets/[code]?variantsStrict=1
//
// Full checklist for one set — owned + missing — plus per-rarity
// breakdown. Drives /account/sets/[code]'s grid view.
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const { code } = await params;
  // Re-derive variantsStrict from query string (lib reads it on the
  // progress call but getSetDetail doesn't currently accept opts —
  // future change).
  const result = await getSetDetail(session.user.id, code);
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: result.status });
  return NextResponse.json(result.value);
}
