import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compareSync } from "bcryptjs";
import { db } from "./db";
import { clients, loginAttempts } from "./db/schema";
import { eq, and, gt, sql } from "drizzle-orm";

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

// Sliding-window count over login_attempts. Persists across function
// invocations — the in-memory Map this replaces was cosmetic on Vercel.
// Fail open on DB error: login shouldn't be a DB outage's first casualty.
async function checkLoginRateLimit(email: string): Promise<boolean> {
  try {
    const since = new Date(Date.now() - WINDOW_MS);
    const [row] = await db
      .select({ n: sql<number>`cast(count(*) as integer)` })
      .from(loginAttempts)
      .where(
        and(
          eq(loginAttempts.email, email),
          eq(loginAttempts.success, false),
          gt(loginAttempts.attemptedAt, since),
        ),
      );
    return (row?.n ?? 0) < MAX_ATTEMPTS;
  } catch (err) {
    console.warn(`[AUTH] Rate-limit check failed for ${email} — allowing attempt:`, err);
    return true;
  }
}

async function recordLoginAttempt(email: string, success: boolean): Promise<void> {
  try {
    await db.insert(loginAttempts).values({ email, success }).execute();
  } catch (err) {
    console.warn(`[AUTH] Failed to record login attempt for ${email}:`, err);
  }
}

const isProd = process.env.NODE_ENV === "production";
const cookieDomain = isProd ? ".wholesaletcgdirect.com" : undefined;

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  cookies: {
    sessionToken: {
      name: isProd ? "__Secure-authjs.session-token" : "authjs.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: isProd,
        domain: cookieDomain,
      },
    },
    csrfToken: {
      name: isProd ? "__Host-authjs.csrf-token" : "authjs.csrf-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: isProd,
      },
    },
    callbackUrl: {
      name: isProd ? "__Secure-authjs.callback-url" : "authjs.callback-url",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: isProd,
        domain: cookieDomain,
      },
    },
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = (credentials?.email as string)?.toLowerCase().trim();
        const password = credentials?.password as string;
        if (!email || !password) return null;

        if (!(await checkLoginRateLimit(email))) {
          console.warn(`[AUTH] Login blocked for ${email} — too many failed attempts`);
          return null;
        }

        const [user] = await db
          .select()
          .from(clients)
          .where(eq(clients.email, email))
          .limit(1);

        if (!user || !compareSync(password, user.passwordHash)) {
          await recordLoginAttempt(email, false);
          return null;
        }

        await recordLoginAttempt(email, true);
        return {
          id: String(user.id),
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.id = user.id;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = String(token.id);
        session.user.role = (token.role as string) ?? "client";
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
  },
});
