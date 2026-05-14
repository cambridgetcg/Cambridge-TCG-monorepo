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
import { B2BNav } from "./_nav";

export default async function B2BLayout({ children }: { children: React.ReactNode }) {
  await requireWholesalePage();
  return (
    <div>
      <B2BNav />
      {children}
    </div>
  );
}
