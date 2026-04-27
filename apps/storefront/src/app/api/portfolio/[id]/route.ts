import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { updateCard, removeCard } from "@/lib/portfolio/db";

// PATCH — update card
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();

  const card = await updateCard(id, session.user.id, {
    quantity: body.quantity,
    acquisitionPrice: body.acquisitionPrice,
    condition: body.condition,
    notes: body.notes,
  });

  if (!card) {
    return NextResponse.json({ error: "Card not found." }, { status: 404 });
  }
  return NextResponse.json({ card });
}

// DELETE — remove card
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const { id } = await params;
  const removed = await removeCard(id, session.user.id);

  if (!removed) {
    return NextResponse.json({ error: "Card not found." }, { status: 404 });
  }
  return NextResponse.json({ removed: true });
}
