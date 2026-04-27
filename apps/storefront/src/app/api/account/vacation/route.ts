import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  scheduleVacation,
  listMyVacations,
  getActiveVacation,
} from "@/lib/market/vacation";

// GET — my vacation history + active row.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const [vacations, active] = await Promise.all([
    listMyVacations(session.user.id),
    getActiveVacation(session.user.id),
  ]);
  return NextResponse.json({ vacations, active });
}

// POST — schedule. Body: { startsAt, endsAt, message? }
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    startsAt?: string;
    endsAt?: string;
    message?: string;
  };
  if (!body.startsAt || !body.endsAt) {
    return NextResponse.json({ error: "startsAt and endsAt required." }, { status: 400 });
  }
  const result = await scheduleVacation({
    userId: session.user.id,
    startsAt: body.startsAt,
    endsAt: body.endsAt,
    message: body.message,
  });
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: result.status });
  return NextResponse.json({ vacation: result.value }, { status: 201 });
}
