/**
 * Dev-only sign-in shortcut for local review.
 *
 * Opens, seeds a session for contact@cambridgetcg.com (creating the user
 * with role='admin' if absent), sets the NextAuth session cookie, and
 * redirects to /overview. Skips the magic-link email flow entirely.
 *
 * Hard-gated on NODE_ENV !== 'production' AND a localhost-only host check.
 * On production this returns 404 and never touches the DB.
 *
 * This file is a development aid — keep it out of any deploy preview.
 */

import { NextResponse } from "next/server";
import { sfQuery } from "@/lib/db";
import { randomBytes } from "node:crypto";

const EMAIL = "contact@cambridgetcg.com";

export async function GET(request: Request) {
  // Production gate
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Localhost-only — refuse remote hits even on dev
  const host = request.headers.get("host") ?? "";
  if (!host.startsWith("localhost") && !host.startsWith("127.0.0.1") && !host.startsWith("[::1]")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Find or create admin user
  const existing = await sfQuery<{ id: string; role: string }>(
    `SELECT id, role FROM users WHERE email = $1`,
    [EMAIL],
  );
  let userId: string;
  if (existing.rows.length === 0) {
    const inserted = await sfQuery<{ id: string }>(
      `INSERT INTO users (email, role, email_verified)
       VALUES ($1, 'admin', NOW())
       RETURNING id`,
      [EMAIL],
    );
    userId = inserted.rows[0]!.id;
  } else {
    userId = existing.rows[0]!.id;
    if (existing.rows[0]!.role !== "admin") {
      await sfQuery(
        `UPDATE users SET role = 'admin' WHERE id = $1`,
        [userId],
      );
    }
  }

  // Mint a session token; replace any prior session for this user
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await sfQuery(`DELETE FROM sessions WHERE user_id = $1`, [userId]);
  await sfQuery(
    `INSERT INTO sessions (session_token, user_id, expires)
     VALUES ($1, $2, $3)`,
    [token, userId, expires.toISOString()],
  );

  // Redirect to /overview with the cookie set
  const response = NextResponse.redirect(new URL("/overview", request.url));
  response.cookies.set("authjs.session-token", token, {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    path: "/",
    expires,
  });
  return response;
}
