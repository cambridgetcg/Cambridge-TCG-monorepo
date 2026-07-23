import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getMysteryBox } from "@/lib/rewards/db";

// GET — a single mystery box WITH its rewards, so the detail page can show the
// per-reward odds table. listMysteryBoxes deliberately omits rewards (the list
// only needs summaries); getMysteryBox attaches them.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const box = await getMysteryBox(id, session?.user?.id);
  if (!box) return NextResponse.json({ error: "Mystery box not found." }, { status: 404 });
  return NextResponse.json({ box });
}
