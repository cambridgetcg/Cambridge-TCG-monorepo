import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compareSync } from "bcryptjs";
import { db } from "./db";
import { clients } from "./db/schema";
import { eq } from "drizzle-orm";

// Simple in-memory brute-force guard: 5 failed attempts per email per 15 minutes.
// Not persistent across restarts — good enough for a low-traffic B2B site.
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function checkLoginRateLimit(email: string): boolean {
  const now = Date.now();
  const record = loginAttempts.get(email);
  if (!record || now > record.resetAt) {
    loginAttempts.set(email, { count: 0, resetAt: now + WINDOW_MS });
    return true; // allowed
  }
  if (record.count >= MAX_ATTEMPTS) return false; // blocked
  return true;
}

function recordLoginFailure(email: string): void {
  const now = Date.now();
  const record = loginAttempts.get(email);
  if (!record || now > record.resetAt) {
    loginAttempts.set(email, { count: 1, resetAt: now + WINDOW_MS });
  } else {
    record.count += 1;
  }
}

function clearLoginFailures(email: string): void {
  loginAttempts.delete(email);
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

        // Rate limit check
        if (!checkLoginRateLimit(email)) {
          console.warn(`[AUTH] Login blocked for ${email} — too many failed attempts`);
          return null;
        }

        const [user] = await db
          .select()
          .from(clients)
          .where(eq(clients.email, email))
          .limit(1);

        if (!user || !compareSync(password, user.passwordHash)) {
          recordLoginFailure(email);
          return null;
        }

        clearLoginFailures(email);
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
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
});
