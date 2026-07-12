import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { addToShowcase, removeFromShowcase, getShowcase } from "@/lib/social/db";

const OWNER_HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
};
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(body: unknown, status: number = 200) {
  return NextResponse.json(body, { status, headers: OWNER_HEADERS });
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return json({ error: "Sign in required." }, 401);
  const showcase = await getShowcase(session.user.id);
  return json({ showcase });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return json({ error: "Sign in required." }, 401);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const portfolioCardId = body?.portfolioCardId;
  const caption = body?.caption;
  if (typeof portfolioCardId !== "string" || !UUID_RE.test(portfolioCardId)) {
    return json({ error: "Card not found." }, 404);
  }
  if (caption != null && (typeof caption !== "string" || caption.trim().length > 500)) {
    return json({ error: "Private draft caption must be 500 characters or fewer." }, 400);
  }
  const added = await addToShowcase(
    session.user.id,
    portfolioCardId,
    typeof caption === "string" ? caption.trim() : undefined,
  );
  if (!added) return json({ error: "Card not found." }, 404);
  // Return updated showcase so frontend can refresh
  const showcase = await getShowcase(session.user.id);
  const card = showcase.find(c => c.portfolio_card_id === portfolioCardId) || null;
  return json({ added: true, card });
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return json({ error: "Sign in required." }, 401);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const portfolioCardId = body?.portfolioCardId;
  if (typeof portfolioCardId !== "string" || !UUID_RE.test(portfolioCardId)) {
    return json({ error: "Card not found." }, 404);
  }
  const removed = await removeFromShowcase(session.user.id, portfolioCardId);
  if (!removed) return json({ error: "Card not found." }, 404);
  return json({ removed: true });
}
