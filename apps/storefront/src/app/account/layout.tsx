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
    // Preserve the requested path so /login can redirect back after sign-in.
    const headerStore = await headers();
    const pathname = headerStore.get("x-pathname") ?? "/account";
    const returnTo = encodeURIComponent(pathname);
    redirect(`/login?return=${returnTo}`);
  }

  return (
    <div className="min-h-screen bg-neutral-950">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex gap-8">
          <AccountNav />
          <main className="flex-1 min-w-0">{children}</main>
        </div>
      </div>
    </div>
  );
}
