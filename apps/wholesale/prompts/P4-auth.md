# P4 — Auth (NextAuth.js)

Set up NextAuth v5 (beta) with credentials provider.

## src/lib/auth.ts

```ts
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { db } from "./db";
import { clients } from "./db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const user = await db.query.clients.findFirst({
          where: eq(clients.email, credentials.email as string),
        });
        if (!user) return null;
        const valid = await bcrypt.compare(credentials.password as string, user.passwordHash);
        if (!valid) return null;
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
        token.role = (user as any).role;
        token.userId = (user as any).id;
      }
      return token;
    },
    session({ session, token }) {
      session.user.role = token.role as string;
      session.user.id = token.userId as string;
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
});
```

## src/app/api/auth/[...nextauth]/route.ts
Export GET and POST from handlers.

## src/middleware.ts
- Protect /catalog, /orders → must be authenticated
- Protect /admin → must be admin role
- Allow /login, /api/auth unauthenticated

## src/app/login/page.tsx
- Simple dark-themed login form (email + password)
- Show error on invalid credentials
- Redirect to /catalog on success

## Extend next-auth types (src/types/next-auth.d.ts)
Add `role` and `id` to Session user type.

Commit: `feat: NextAuth credentials + role-based middleware`
