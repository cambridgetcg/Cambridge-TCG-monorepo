import NextAuth from "next-auth";
import type { NextAuthConfig } from "next-auth";
import EmailProvider from "next-auth/providers/email";
import { PgAdapter } from "./adapter";
import { sendVerificationRequest } from "./email";
import { query } from "@/lib/db";
import { generateHandle, fallbackHandle, HANDLE_MAX_ATTEMPTS } from "@/lib/users/handle";
// Single source of truth for the session-cookie name. proxy.ts reads
// SESSION_COOKIE_NAMES (derived from the same override below); a
// vitest tripwire in cookies.test.ts asserts they can't drift.
import { SESSION_COOKIE_OVERRIDE } from "./cookies";

export const authConfig: NextAuthConfig = {
  adapter: PgAdapter(),
  // Pass the override through if defined; otherwise let Auth.js v5 pick
  // its default name based on `useSecureCookies` (HTTPS → `__Secure-`
  // prefix, HTTP → bare). Both default names are listed in cookies.ts.
  ...(SESSION_COOKIE_OVERRIDE !== undefined && {
    cookies: { sessionToken: { name: SESSION_COOKIE_OVERRIDE } },
  }),
  providers: [
    EmailProvider({
      // Dummy server — sendVerificationRequest is fully overridden so
      // nodemailer's createTransport is never actually called.
      server: { host: "localhost", port: 587, auth: { user: "x", pass: "x" } },
      from: "noreply@cambridgetcg.com",
      sendVerificationRequest,
    }),
  ],
  pages: {
    signIn: "/login",
    verifyRequest: "/login/check-email",
  },
  session: {
    strategy: "database",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        // Role comes from the adapter's toAdapterUser which reads
        // the role column from the users table.
        session.user.role = (user as unknown as { role: string }).role ?? "user";
      }
      return session;
    },
  },
  events: {
    // Legacy backfill: accounts created before the adapter assigned
    // handles at createUser still carry NULL username and render as "—"
    // to counterparties. The WHERE username IS NULL guard makes this a
    // no-op for everyone else, and a lost race with a concurrent login
    // just leaves the winner's handle in place.
    async signIn({ user }) {
      const u = user as { id?: string; username?: string | null };
      if (!u.id || u.username) return;
      for (let attempt = 1; attempt <= HANDLE_MAX_ATTEMPTS + 1; attempt++) {
        const username = attempt <= HANDLE_MAX_ATTEMPTS ? generateHandle() : fallbackHandle();
        try {
          await query(
            `UPDATE users SET username = $1 WHERE id = $2 AND username IS NULL`,
            [username, u.id],
          );
          return;
        } catch (err) {
          const pg = err as { code?: string; constraint?: string };
          const collision = pg.code === "23505" && (pg.constraint ?? "").includes("username");
          if (!collision) return; // never block sign-in on naming
        }
      }
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
