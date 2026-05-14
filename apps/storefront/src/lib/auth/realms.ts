// Role-aware auth helpers — the Data Access Layer pattern.
//
// Background: Next.js 16's authentication guide prescribes proxy.ts as
// an *optimistic* cookie-presence check, with the real role gate living
// at the page/action layer. This file is that layer.
//
// Why this shape:
//   - One canonical place where role logic lives. Adding a fourth realm
//     (e.g. /account/seller) means one new helper here, not a fourth
//     branch in proxy.ts.
//   - React `cache()` collapses repeated `auth()` calls within a single
//     request to one DB roundtrip — pages can call requireAdminPage()
//     and downstream server components can call getSessionUser() without
//     paying twice.
//   - Page helpers redirect; API code should keep using
//     `requireAdmin()` from `@/lib/admin/auth` (returns null on failure,
//     caller emits JSON). Symmetric helpers would let API routes
//     accidentally redirect, which is wrong for JSON consumers.
//
// See:
//   - docs/connections/the-four-auth-realms.md (S30) — realm topology
//   - apps/storefront/src/proxy.ts — slim cookie-presence gate
//   - https://nextjs.org/docs/app/guides/authentication

import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export type Role = "user" | "wholesale" | "admin";

export interface SessionUser {
  id: string;
  email: string;
  role: Role;
}

// `cache()` deduplicates within a single React render pass. A layout's
// requireAdminPage() and a downstream Server Component's getSessionUser()
// share one underlying `auth()` invocation.
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const session = await auth();
  if (!session?.user?.id) return null;
  return {
    id: session.user.id,
    email: session.user.email,
    role: ((session.user as { role?: string }).role ?? "user") as Role,
  };
});

export async function requireSessionUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdminPage(): Promise<SessionUser> {
  const user = await requireSessionUser();
  // Admins land "/" (not "/account") so a non-admin landing on /admin/*
  // bounces to the public home rather than implying they have an
  // account-shaped destination.
  if (user.role !== "admin") redirect("/");
  return user;
}

export async function requireWholesalePage(): Promise<SessionUser> {
  const user = await requireSessionUser();
  // Admins pass for operator inspection (matches the proxy's prior
  // behaviour at apps/storefront/src/proxy.ts:56-58).
  if (user.role !== "wholesale" && user.role !== "admin") {
    redirect("/account");
  }
  return user;
}
