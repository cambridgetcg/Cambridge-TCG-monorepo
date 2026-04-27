import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin/auth";
import { approveAuction, rejectAuction, getPendingApprovalAuctions, calculateSellerPayout } from "@/lib/auction/db";

// GET — admin: list pending approval auctions
export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const auctions = await getPendingApprovalAuctions();
  return NextResponse.json({ auctions });
}

// POST — admin: approve or reject
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();

  if (body.action === "approve") {
    const auction = await approveAuction(id, body.notes);
    if (!auction) {
      return NextResponse.json({ error: "Auction not found or already reviewed." }, { status: 404 });
    }
    return NextResponse.json({ auction });
  }

  if (body.action === "reject") {
    if (!body.notes?.trim()) {
      return NextResponse.json({ error: "Rejection reason required." }, { status: 400 });
    }
    const auction = await rejectAuction(id, body.notes.trim());
    if (!auction) {
      return NextResponse.json({ error: "Auction not found or already reviewed." }, { status: 404 });
    }
    return NextResponse.json({ auction });
  }

  if (body.action === "calculate_payout") {
    const result = await calculateSellerPayout(id);
    if (!result) {
      return NextResponse.json({ error: "Auction not found." }, { status: 404 });
    }
    return NextResponse.json(result);
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
