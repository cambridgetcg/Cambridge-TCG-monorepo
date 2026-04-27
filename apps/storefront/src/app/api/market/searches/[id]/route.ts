import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSearch, archiveSearch, listMatchesForSearch } from "@/lib/market/saved-searches";

// GET — single search detail + recent matches.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const { id } = await params;
  const search = await getSearch(id, session.user.id);
  if (!search) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const matches = await listMatchesForSearch(id, session.user.id, 30);
  return NextResponse.json({ search, matches });
}

// DELETE — alias for archive. Keeps the row (matches table FK) but
// stops scanning. True deletion would orphan the match audit log.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const { id } = await params;
  const result = await archiveSearch(id, session.user.id);
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: result.status });
  return NextResponse.json({ search: result.value });
}
