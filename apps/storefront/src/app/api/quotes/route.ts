import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin/auth";
import { listAllQuotes } from "@/lib/quote/db";

// GET — admin: list all quotes
export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const quotes = await listAllQuotes();
  return NextResponse.json({ quotes });
}

// POST — closed. The custom-quote desk was a house-buy intake; the
// regulator pivot (kingdom-101) closed it on 2026-06-11. In-flight quotes
// keep their status reads (GET above, /api/quotes/[ref]) and payouts.
export async function POST() {
  return NextResponse.json(
    {
      error:
        "The trade-in and custom-quote desk is closed. Cambridge TCG regulates the market and no longer buys cards — sell on the market instead: /market. Existing quotes will be honored in full.",
    },
    { status: 410 }
  );
}
