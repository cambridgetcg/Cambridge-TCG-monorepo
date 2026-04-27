import { NextResponse } from "next/server";
import { SUPPORTED_COUNTRIES } from "@/lib/payouts/stripe-connect";

// GET — list of Stripe Connect Express countries this platform accepts.
// Static; publicly fetchable so the onboarding UI can render a dropdown
// without auth plumbing.
export async function GET() {
  return NextResponse.json({ countries: SUPPORTED_COUNTRIES });
}
