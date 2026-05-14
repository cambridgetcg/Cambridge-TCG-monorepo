// Admin role gate (Data Access Layer pattern).
//
// proxy.ts already redirected logged-out visitors at the network edge
// (cookie-presence check, no DB). This layout runs the *authoritative*
// role lookup — single DB read, deduped via React `cache()` across all
// downstream server components.
//
// See lib/auth/realms.ts for the helper; docs/connections/the-four-auth-realms.md
// for the realm topology.

import { requireAdminPage } from "@/lib/auth/realms";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminPage();
  return <>{children}</>;
}
