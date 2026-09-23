import { NextResponse } from "next/server";
import { NEW_ORDERS_RETIRED_STATUS, newOrdersRetiredResult } from "@/lib/commercial-retirement";

/** Refuse fresh order admission before authentication, parsing, writes or notification. */
export async function POST() {
  return NextResponse.json(newOrdersRetiredResult(), {
    status: NEW_ORDERS_RETIRED_STATUS,
    headers: { "Cache-Control": "no-store" },
  });
}
