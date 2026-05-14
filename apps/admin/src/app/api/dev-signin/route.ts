/**
 * Dev-only sign-in shortcut for local review.
 *
 * Mints a NextAuth session cookie for the requested email without going
 * through the magic-link flow. Skips email entirely.
 *
 * Three defense-in-depth gates — ALL must pass:
 *   1. process.env.NODE_ENV !== 'production'
 *   2. Host header starts with localhost / 127.0.0.1 / [::1]
 *   3. ?secret=<DEV_SIGNIN_SECRET> matches the env var (when set)
 *
 * Gate 3 is opt-in: if DEV_SIGNIN_SECRET is unset, this route works
 * with just NODE_ENV + Host (preserving the historical zero-config
 * developer experience). To harden a shared dev box, set
 * DEV_SIGNIN_SECRET in apps/admin/.env.local and append ?secret=...
 * to the URL.
 *
 * Email is now sourced from ?email= (or body), not hardcoded — a
 * misconfigured NODE_ENV in prod would no longer mint a session for
 * the platform owner's address by default. Falls back to
 * contact@cambridgetcg.com only when the request omits ?email AND
 * NODE_ENV is dev AND host is localhost (the safe path).
 *
 * This file is a development aid. Keep it out of any deploy preview.
 */

import { NextResponse } from "next/server";
import { sfQuery } from "@/lib/db";
import { randomBytes } from "node:crypto";

const DEFAULT_DEV_EMAIL = "contact@cambridgetcg.com";

export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const host = request.headers.get("host") ?? "";
  if (!host.startsWith("localhost") && !host.startsWith("127.0.0.1") && !host.startsWith("[::1]")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const requiredSecret = process.env.DEV_SIGNIN_SECRET?.trim();
  const url = new URL(request.url);
  const providedSecret = url.searchParams.get("secret")?.trim();
  if (requiredSecret && providedSecret !== requiredSecret) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Email: ?email= overrides default. Lowercased + trimmed for stable lookup.
  const requestedEmail = url.searchParams.get("email")?.trim().toLowerCase();
  const email = requestedEmail || DEFAULT_DEV_EMAIL;

  const existing = await sfQuery<{ id: string; role: string }>(
    `SELECT id, role FROM users WHERE email = $1`,
    [email],
  );
  let userId: string;
  if (existing.rows.length === 0) {
    const inserted = await sfQuery<{ id: string }>(
      `INSERT INTO users (email, role, email_verified)
       VALUES ($1, 'admin', NOW())
       RETURNING id`,
      [email],
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

  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await sfQuery(`DELETE FROM sessions WHERE user_id = $1`, [userId]);
  await sfQuery(
    `INSERT INTO sessions (session_token, user_id, expires)
     VALUES ($1, $2, $3)`,
    [token, userId, expires.toISOString()],
  );

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
