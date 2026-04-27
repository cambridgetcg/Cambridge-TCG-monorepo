// Admin authentication — tied to NextAuth sessions.
//
// Admin users are regular users with role='admin' on the users table.
// They authenticate via the standard magic-link flow and get admin
// powers through their session role. This replaces the old shared-
// password HMAC cookie system.
//
// Usage in API routes:
//   const admin = await requireAdmin();
//   if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
//   // admin is { id, email, role } — use admin.id for audit logging

import { auth } from "@/lib/auth";

export interface AdminSession {
  id: string;
  email: string;
  role: string;
}

/**
 * Check if the current request is from an admin user.
 * Returns the admin session if authenticated, null otherwise.
 */
export async function requireAdmin(): Promise<AdminSession | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  if (session.user.role !== "admin") return null;
  return {
    id: session.user.id,
    email: session.user.email,
    role: session.user.role,
  };
}

/**
 * Backward-compatible check — returns boolean like the old isAdmin().
 * Prefer requireAdmin() in new code so you get the admin identity for audit logging.
 */
export async function isAdmin(): Promise<boolean> {
  return (await requireAdmin()) !== null;
}
