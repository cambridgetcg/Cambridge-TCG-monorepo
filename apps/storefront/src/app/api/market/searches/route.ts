import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createSearch, listSearches } from "@/lib/market/saved-searches";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const searches = await listSearches(session.user.id);
  return NextResponse.json({ searches });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    query?: unknown;
  };
  if (!body.name || !body.query) {
    return NextResponse.json({ error: "name and query required." }, { status: 400 });
  }
  const result = await createSearch({
    userId: session.user.id,
    name: body.name,
    query: body.query,
  });
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: result.status });
  return NextResponse.json({ search: result.value }, { status: 201 });
}
