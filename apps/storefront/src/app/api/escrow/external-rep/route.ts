import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/admin/auth";
import { addExternalRep, verifyExternalRep } from "@/lib/escrow/trust-engine";
import { query } from "@/lib/db";

// GET — user's external reputation links
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const url = new URL(request.url);
  const userId = url.searchParams.get("userId") || session.user.id;

  const result = await query(
    `SELECT * FROM external_reputation WHERE user_id=$1 ORDER BY platform`,
    [userId]
  );
  return NextResponse.json({ accounts: result.rows });
}

// POST — add external platform link or verify (admin)
export async function POST(request: Request) {
  const body = await request.json();

  // Admin verification
  if (body.action === "verify") {
    if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await verifyExternalRep(body.userId, body.platform, body.userId, body.notes);
    return NextResponse.json({ verified: true });
  }

  // Customer adds their platform link
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  if (!body.platform || !body.username) {
    return NextResponse.json({ error: "Platform and username required." }, { status: 400 });
  }

  const validPlatforms = ["ebay", "cardmarket", "tcgplayer", "vinted", "facebook", "instagram"];
  if (!validPlatforms.includes(body.platform)) {
    return NextResponse.json({ error: "Invalid platform." }, { status: 400 });
  }

  await addExternalRep(session.user.id, {
    platform: body.platform,
    username: body.username.trim(),
    profileUrl: body.profileUrl?.trim(),
    rating: body.rating,
    totalSales: body.totalSales,
    positivePercent: body.positivePercent,
    memberSince: body.memberSince,
    screenshotUrl: body.screenshotUrl,
  });

  return NextResponse.json({ added: true });
}
