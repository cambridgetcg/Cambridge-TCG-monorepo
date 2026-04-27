import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createRule, listRules } from "@/lib/market/pricing-rules";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const rules = await listRules(session.user.id);
  return NextResponse.json({ rules });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    listingFilter?: unknown;
    ruleType?: "auto_decline" | "auto_counter";
    thresholdPct?: number;
    counterPct?: number;
    responseMessage?: string;
  };
  if (!body.name || !body.ruleType || typeof body.thresholdPct !== "number") {
    return NextResponse.json(
      { error: "name, ruleType, and thresholdPct required." },
      { status: 400 },
    );
  }

  const result = await createRule({
    userId: session.user.id,
    name: body.name,
    listingFilter: body.listingFilter,
    ruleType: body.ruleType,
    thresholdPct: body.thresholdPct,
    counterPct: body.counterPct,
    responseMessage: body.responseMessage,
  });
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: result.status });
  return NextResponse.json({ rule: result.value }, { status: 201 });
}
