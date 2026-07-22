import { NextResponse } from "next/server";

// The Bounty Board (a weighted-RNG draw mechanic) has been retired. This
// endpoint used to merge lower-tier pull tokens into a higher tier. It now
// returns 410 Gone so bookmarked or replayed requests get an explicit,
// honest answer instead of a 404 or a 500.
const GONE = () =>
  NextResponse.json(
    { error: "The Bounty Board has been retired.", code: "gone" },
    { status: 410 },
  );

export const GET = GONE;
export const POST = GONE;
export const PUT = GONE;
export const PATCH = GONE;
export const DELETE = GONE;
