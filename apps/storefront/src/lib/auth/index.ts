import NextAuth from "next-auth";
import type { NextAuthConfig } from "next-auth";
import EmailProvider from "next-auth/providers/email";
import Google from "next-auth/providers/google";
import { PgAdapter } from "./adapter";
import { sendVerificationRequest } from "./email";
import { query } from "@/lib/db";
import { generateHandle, fallbackHandle, HANDLE_MAX_ATTEMPTS } from "@/lib/users/handle";
// Single source of truth for the session-cookie name. proxy.ts reads
// SESSION_COOKIE_NAMES (derived from the same override below); a
// vitest tripwire in cookies.test.ts asserts they can't drift.
import { SESSION_COOKIE_OVERRIDE } from "./cookies";

const MAGIC_LINK_TOKEN_SECRET = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;

// Google sign-in — registered ONLY when its credentials are present, so the
// app deploys safely before the Google OAuth app exists (no creds → no
// provider, no button; the /login page hides it via /api/auth/providers).
// Switch it on by setting AUTH_GOOGLE_ID + AUTH_GOOGLE_SECRET in the prod env.
// Google console → Authorized redirect URI:
//   https://cambridgetcg.com/api/auth/callback/google
const GOOGLE_ID = process.env.AUTH_GOOGLE_ID;
const GOOGLE_SECRET = process.env.AUTH_GOOGLE_SECRET;
const googleProvider =
  GOOGLE_ID && GOOGLE_SECRET
    ? [
        Google({
          clientId: GOOGLE_ID,
          clientSecret: GOOGLE_SECRET,
          // Google verifies email ownership, so mapping a Google sign-in onto
          // an existing magic-link account with the same address is safe here
          // (the "dangerous" caveat is for providers that do NOT verify email).
          // One person, one account, whichever door they use.
          allowDangerousEmailAccountLinking: true,
        }),
      ]
    : [];

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
      // Pin the provider to the same secret that NextAuth infers. The sender
      // needs this exact value to reserve the same hashed token before mail.
      ...(MAGIC_LINK_TOKEN_SECRET ? { secret: MAGIC_LINK_TOKEN_SECRET } : {}),
      sendVerificationRequest,
    }),
    ...googleProvider,
  ],
  pages: {
    signIn: "/login",
    verifyRequest: "/login/check-email",
    // Branded auth-error page. Without this, an expired/used magic link
    // lands on Auth.js's default page whose "Sign in" button href is
    // malformed (/api/auth/error?error=Verification/signin) and dead-ends
    // on a bare "Error Error" screen. /login/error names the cause and
    // offers a working "request a new link".
    error: "/login/error",
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
        // Handle disclosure (walker: session payload reported username:null
        // forever, so no surface could tell a collector the public name they
        // were already trading under). The adapter's getSessionAndUser SELECT
        // doesn't carry username, so read it here — one indexed PK lookup,
        // failing soft to null so a naming read never breaks a session.
        const carried = (user as unknown as { username?: string | null }).username;
        if (carried != null) {
          session.user.username = carried;
        } else {
          try {
            const r = await query(`SELECT username FROM users WHERE id = $1`, [user.id]);
            session.user.username = (r.rows[0]?.username as string | null) ?? null;
          } catch {
            session.user.username = null;
          }
        }
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
