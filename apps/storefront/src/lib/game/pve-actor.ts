// Shared PVE identity resolution — signed-in user OR cookie-pinned guest.
//
// Guest play (no sign-in required): on the first `start` request without a
// session, we mint a `users` row with role='guest' and pin its id to an
// HTTP-only cookie. The cookie persists across visits so progress survives
// reloads on the same browser. Rewards (Berries / store credit / activity
// posts) stay gated behind a real sign-in.
//
// Both the level-list route (GET /api/game/pve) and the game route
// (/api/game/pve/[levelId]) resolve identity through here, so a guest's
// pve_progress rows unlock levels in the UI exactly like a member's.

import { cookies } from "next/headers";
import crypto from "node:crypto";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";

const GUEST_COOKIE = "ctcg-guest-id";
const GUEST_COOKIE_MAX_AGE_S = 60 * 60 * 24 * 365; // 1 year
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface PveActor {
  userId: string;
  name: string;
  isGuest: boolean;
}

/** Resolve who is making this PVE request.
 *  - Signed in via next-auth → returns that user.
 *  - Has a valid guest cookie pointing at a `role='guest'` user → returns it.
 *  - Otherwise, if `mintIfMissing` is true (start-of-game), creates a new
 *    guest user and sets the cookie. If false, returns null. */
export async function resolveActor(mintIfMissing: boolean): Promise<PveActor | null> {
  const session = await auth();
  if (session?.user?.id) {
    return {
      userId: session.user.id,
      name: session.user.name || "Player",
      isGuest: false,
    };
  }

  const jar = await cookies();
  const existing = jar.get(GUEST_COOKIE)?.value;
  if (existing && UUID_RE.test(existing)) {
    const r = await query(
      `SELECT id FROM users WHERE id=$1 AND role='guest'`,
      [existing],
    );
    if (r.rows[0]) {
      return { userId: existing, name: "Guest", isGuest: true };
    }
  }
  if (!mintIfMissing) return null;

  const newId = crypto.randomUUID();
  await query(
    `INSERT INTO users (id, email, role) VALUES ($1, $2, 'guest')`,
    [newId, `guest+${newId}@cambridgetcg.local`],
  );
  jar.set(GUEST_COOKIE, newId, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: GUEST_COOKIE_MAX_AGE_S,
  });
  return { userId: newId, name: "Guest", isGuest: true };
}
