import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin/auth";
import { getRaffleEntries, updateRaffleStatus } from "@/lib/rewards/db";
import { provablyFairDraw, commitSeed } from "@/lib/rewards/provable-fair";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();

  if (body.action === "draw") {
    // Belt-and-braces pre-commit (idempotent — no-ops if already set).
    // Draws the seed now if the raffle predates the auto-pre-commit hook,
    // so committed_at < drawn_at is preserved even for legacy raffles.
    try { await commitSeed(id); } catch (err) {
      console.warn(`[raffle/draw] pre-commit skipped for ${id}:`, err);
    }
    const result = await provablyFairDraw(id);
    return NextResponse.json(result);
  }

  if (body.action === "cancel") {
    await updateRaffleStatus(id, "cancelled");
    return NextResponse.json({ status: "cancelled" });
  }

  if (body.action === "activate") {
    await updateRaffleStatus(id, "active");
    return NextResponse.json({ status: "active" });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const entries = await getRaffleEntries(id);
  return NextResponse.json({ entries });
}
