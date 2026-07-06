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
import { query } from "@/lib/db";
import { AccountNav } from "./_nav";

// Count offers awaiting the seller's response (pending + countered, not
// yet expired) for the nav badge. Optional read — a failure degrades to
// no badge, never a broken layout (same ethos as the overview's safe()).
async function pendingOffersCount(userId: string): Promise<number> {
  try {
    const r = await query(
      `SELECT COUNT(*)::int AS n FROM market_offers
        WHERE seller_id = $1
          AND status IN ('pending', 'countered')
          AND expires_at > NOW()`,
      [userId],
    );
    const n = Number((r.rows[0] as { n?: number } | undefined)?.n ?? 0);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

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

  const offersPending = await pendingOffersCount(session.user.id);

  return (
    <div className="min-h-screen bg-page">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex gap-8">
          <AccountNav badges={{ "/account/offers": offersPending }} />
          <main className="flex-1 min-w-0">{children}</main>
        </div>
      </div>
    </div>
  );
}
