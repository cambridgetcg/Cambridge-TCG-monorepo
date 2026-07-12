/** PVE identity is an authenticated account; guest persistence is paused. */

import { auth } from "@/lib/auth";

export const LEGACY_PVE_GUEST_COOKIE = "ctcg-guest-id";

export interface PveActor {
  userId: string;
  name: string;
  isGuest: false;
}

export async function resolveActor(
  _mintIfMissing = false,
): Promise<PveActor | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  return {
    userId: session.user.id,
    name: session.user.name || "Player",
    isGuest: false,
  };
}
