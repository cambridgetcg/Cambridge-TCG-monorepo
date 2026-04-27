import NextAuth from "next-auth";
import type { NextAuthConfig } from "next-auth";
import EmailProvider from "next-auth/providers/email";
import { PgAdapter } from "./adapter";
import { sendVerificationRequest } from "./email";

export const authConfig: NextAuthConfig = {
  adapter: PgAdapter(),
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
      }
      return session;
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
