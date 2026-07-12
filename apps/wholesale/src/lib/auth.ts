import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compareSync } from "bcryptjs";
import { db } from "./db";
import { clients } from "./db/schema";
import { eq } from "drizzle-orm";
import {
  isBoundedCredentialPassword,
  normalizeCredentialEmail,
} from "./credential-input";
import { reserveCredentialLoginAttempt } from "./login-rate-limit";

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
        const email = normalizeCredentialEmail(credentials?.email);
        const password = credentials?.password;
        if (!email || !isBoundedCredentialPassword(password)) {
          return null;
        }

        if (!(await reserveCredentialLoginAttempt(email))) return null;

        try {
          const [user] = await db
            .select()
            .from(clients)
            .where(eq(clients.email, email))
            .limit(1);

          if (!user || !compareSync(password, user.passwordHash)) {
            return null;
          }

          return {
            id: String(user.id),
            email: user.email,
            name: user.name,
            role: user.role,
          };
        } catch {
          console.error(
            "[AUTH] Credential lookup unavailable; denying attempt",
          );
          return null;
        }
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
