/**
 * /account/b2b layout — role gate + B2B sub-nav.
 *
 * Parent /account/layout.tsx already gates "must be signed in" via
 * auth(). This layout adds the role check (wholesale | admin) — proxy.ts
 * now does cookie-presence only, not role enforcement (Option B
 * refactor; see lib/auth/realms.ts header for the rationale).
 *
 * The B2BNav sub-strip (Overview / Catalog / Orders) renders after the
 * gate so non-wholesale users never see it.
 */

import { requireWholesalePage } from "@/lib/auth/realms";
import { countItems } from "@/lib/b2b/cart";
import { B2BNav } from "./_nav";

export default async function B2BLayout({ children }: { children: React.ReactNode }) {
  const user = await requireWholesalePage();
  // Cart count for the nav badge. Read here (once) and pass to the
  // client nav so we don't trigger a cart query in every server
  // component that mounts inside the layout.
  const cartCount = await countItems(user.id).catch(() => 0);
  return (
    <div>
      <B2BNav cartCount={cartCount} />
      {children}
    </div>
  );
}
