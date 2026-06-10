import NextAuth from "next-auth";
import type { NextAuthConfig } from "next-auth";
import EmailProvider from "next-auth/providers/email";
import { PgAdapter } from "./adapter";
import { sendVerificationRequest } from "./email";
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
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
