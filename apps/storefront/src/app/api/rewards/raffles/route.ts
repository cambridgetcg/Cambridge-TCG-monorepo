import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/admin/auth";
import { listRaffles, createRaffle, getRaffle } from "@/lib/rewards/db";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const status = url.searchParams.get("status") || undefined;
  const admin = url.searchParams.get("admin") === "true";

  if (admin && !(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const raffles = await listRaffles(admin ? status : "active");

  // Add user entries if authenticated
  const session = await auth();
  if (session?.user?.id) {
    for (const raffle of raffles) {
      const full = await getRaffle(raffle.id, session.user.id);
      if (full) raffle.user_entries = full.user_entries;
    }
  }

  return NextResponse.json({ raffles });
}

export async function POST(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();
  if (!body.title?.trim()) return NextResponse.json({ error: "Title required." }, { status: 400 });
  if (!body.prize_description?.trim()) return NextResponse.json({ error: "Prize description required." }, { status: 400 });

  const raffle = await createRaffle(body);
  return NextResponse.json({ raffle });
}
