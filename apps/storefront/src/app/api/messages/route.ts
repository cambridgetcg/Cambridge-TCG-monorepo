import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { REFERENCE_TYPES, sendMessage } from "@/lib/messages/db";

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store" };

// POST — send a message. Body: { recipientId, body, referenceType?, referenceId? }
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    recipientId?: string;
    body?: string;
    referenceType?: string;
    referenceId?: string;
  };
  if (!body.recipientId || !body.body) {
    return NextResponse.json({ error: "recipientId and body required." }, { status: 400 });
  }
  // Allowlist check at the edge; the full sender-relationship check
  // runs inside sendMessage (validateReference — anti-phishing).
  if (body.referenceType && !(REFERENCE_TYPES as readonly string[]).includes(body.referenceType)) {
    return NextResponse.json({ error: "Unknown referenceType." }, { status: 400 });
  }
  const result = await sendMessage({
    senderId: session.user.id,
    recipientId: body.recipientId,
    body: body.body,
    referenceType: body.referenceType,
    referenceId: body.referenceId,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: result.status });
  }
  return NextResponse.json(
    { message: result.value },
    { status: 201, headers: PRIVATE_HEADERS },
  );
}
