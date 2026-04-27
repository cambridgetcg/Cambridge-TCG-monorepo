import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { resumeRule } from "@/lib/market/pricing-rules";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const { id } = await params;
  const result = await resumeRule(id, session.user.id);
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: result.status });
  return NextResponse.json({ rule: result.value });
}
