/**
 * Admin dashboard NextAuth configuration.
 *
 * Auth model:
 * - Magic link only (email provider) — no passwords
 * - Adapter reads/writes storefront's Postgres database (users, sessions,
 *   verification_tokens tables)
 * - signIn callback gates on role='admin' — non-admins are rejected at
 *   the auth layer, not just the middleware layer
 * - Sessions are stored database-side (30-day expiry)
 *
 * Admin access is granted by setting role='admin' on a user row in the
 * storefront's users table. The admin app never creates users itself.
 */

import NextAuth from "next-auth";
import type { NextAuthConfig } from "next-auth";
import EmailProvider from "next-auth/providers/email";
import { AdminDbAdapter } from "./adapter";
import { sendVerificationRequest } from "./email";

export const authConfig: NextAuthConfig = {
  adapter: AdminDbAdapter(),
  providers: [
    EmailProvider({
      server: { host: "localhost", port: 587, auth: { user: "x", pass: "x" } },
      from: process.env.AUTH_FROM_EMAIL ?? "admin@cambridgetcg.com",
      sendVerificationRequest,
    }),
  ],
  pages: {
    signIn: "/login",
    verifyRequest: "/login/check-email",
    error: "/login",
  },
  session: {
    strategy: "database",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  callbacks: {
    async signIn({ user }) {
      // Gate at the auth level — only admin-role users may sign in here.
      // If someone without admin tries the magic link, we reject before
      // even creating a session. This is defense-in-depth on top of
      // the middleware check.
      const role = (user as unknown as { role?: string }).role;
      if (role !== "admin") {
        return false; // NextAuth shows the error page
      }
      return true;
    },
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        session.user.role = (user as unknown as { role: string }).role ?? "user";
      }
      return session;
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
