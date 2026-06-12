import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getMemberProfile, getAllTiers } from "@/lib/membership/db";
import { getExpiringSoon } from "@/lib/membership/points-expiry";

// GET — member profile with tier, points, perks, progress
export async function GET(request: Request) {
  const url = new URL(request.url);

  // Public: list tiers
  if (url.searchParams.get("tiers") === "true") {
    const tiers = await getAllTiers();
    return NextResponse.json({ tiers });
  }

  // Authenticated: full member profile.
  // Anonymous: return null profile (200) instead of 401. Every page that
  // displays credit/points/tier already handles `d?.profile == null`
  // (see /rewards/*, /account/membership). The previous 401 logged a
  // noisy error in the browser console on every anonymous rewards page
  // load.
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ profile: null, expiringSoon: [] });
  }

  const [profile, expiringSoon] = await Promise.all([
    getMemberProfile(session.user.id),
    getExpiringSoon(session.user.id, 30),
  ]);
  return NextResponse.json({ profile, expiringSoon });
}
