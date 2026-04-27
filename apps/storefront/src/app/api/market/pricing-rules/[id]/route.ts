import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getRule, archiveRule } from "@/lib/market/pricing-rules";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const { id } = await params;
  const rule = await getRule(id, session.user.id);
  if (!rule) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ rule });
}

// DELETE = archive (preserves trigger stats; rules are non-archived
// while still in the user's active workflow).
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const { id } = await params;
  const result = await archiveRule(id, session.user.id);
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: result.status });
  return NextResponse.json({ rule: result.value });
}
