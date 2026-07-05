/**
 * Account layout — the auth gate for every /account/* page.
 *
 * Server component: calls auth() at request-time. Unauthenticated visitors
 * are redirected to /login before any child page renders. The 44 child
 * pages can therefore assume an authenticated user — their per-page
 * session-fetch calls become idempotent no-ops (they re-confirm what the
 * layout already enforced).
 *
 * The interactive sidebar lives in `_nav.tsx` (client component, files
 * prefixed with `_` are kept out of the Next.js route table).
 */

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { AccountNav } from "./_nav";

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.email) {
    // Cookie present but session row invalid/expired (the no-cookie case
    // is redirected by proxy.ts before reaching here). x-pathname is
    // forwarded by proxy.ts on /account/* so the visitor returns to the
    // page they were on, not the account hub.
    const headerStore = await headers();
    const pathname = headerStore.get("x-pathname") ?? "/account";
    const returnTo = encodeURIComponent(pathname);
    redirect(`/login?return=${returnTo}`);
  }

  return (
    <div className="min-h-screen bg-page">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex gap-8">
          <AccountNav />
          <main className="flex-1 min-w-0">{children}</main>
        </div>
      </div>
    </div>
  );
}
