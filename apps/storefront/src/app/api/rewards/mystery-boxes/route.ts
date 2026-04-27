import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/admin/auth";
import { listMysteryBoxes, createMysteryBox, getMysteryBox } from "@/lib/rewards/db";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const admin = url.searchParams.get("admin") === "true";
  const status = url.searchParams.get("status") || undefined;

  if (admin && !(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const boxes = await listMysteryBoxes(admin ? status : "active");

  const session = await auth();
  if (session?.user?.id) {
    for (const box of boxes) {
      const full = await getMysteryBox(box.id, session.user.id);
      if (full) box.user_opens = full.user_opens;
    }
  }

  return NextResponse.json({ boxes });
}

export async function POST(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();
  if (!body.title?.trim()) return NextResponse.json({ error: "Title required." }, { status: 400 });
  const box = await createMysteryBox(body);
  return NextResponse.json({ box });
}
