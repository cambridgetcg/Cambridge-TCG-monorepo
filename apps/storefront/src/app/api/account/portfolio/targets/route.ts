import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  createTarget,
  listTargets,
  pauseTarget,
  resumeTarget,
  cancelTarget,
} from "@/lib/portfolio/targets";

// GET — list user's targets. ?activeOnly=1 to drop hit/cancelled rows.
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const url = new URL(request.url);
  const activeOnly = url.searchParams.get("activeOnly") === "1";
  const targets = await listTargets(session.user.id, { activeOnly });
  return NextResponse.json({ targets });
}

// POST — create
//
// Body: { sku, condition?, targetBuyPrice?, targetSellPrice?,
//          targetStopPrice?, thesis? }
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));

  const result = await createTarget({
    userId: session.user.id,
    sku: body.sku,
    condition: body.condition,
    targetBuyPrice: typeof body.targetBuyPrice === "number" ? body.targetBuyPrice : null,
    targetSellPrice: typeof body.targetSellPrice === "number" ? body.targetSellPrice : null,
    targetStopPrice: typeof body.targetStopPrice === "number" ? body.targetStopPrice : null,
    thesis: body.thesis,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: result.status });
  }
  return NextResponse.json({ target: result.value });
}

// PATCH — { id, action: 'pause'|'resume'|'cancel' }
export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const id = (body.id ?? "").toString();
  const action = body.action;
  if (!id || !["pause", "resume", "cancel"].includes(action)) {
    return NextResponse.json(
      { error: "id + action ('pause'|'resume'|'cancel') required." },
      { status: 400 },
    );
  }

  const fn = action === "pause" ? pauseTarget : action === "resume" ? resumeTarget : cancelTarget;
  const result = await fn(id, session.user.id);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: result.status });
  }
  return NextResponse.json({ target: result.value });
}
