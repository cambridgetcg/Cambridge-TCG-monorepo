import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin/auth";
import { getAuction, updateAuction, deleteAuction } from "@/lib/auction/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auction = await getAuction(id);
  if (!auction) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(auction);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  try {
    const body = await req.json();
    const auction = await updateAuction(id, body);
    if (!auction) {
      return NextResponse.json({ error: "Not found or no changes" }, { status: 404 });
    }
    return NextResponse.json(auction);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update auction";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const deleted = await deleteAuction(id);
  if (!deleted) {
    return NextResponse.json(
      { error: "Not found or auction is not in draft status" },
      { status: 404 }
    );
  }
  return NextResponse.json({ success: true });
}
