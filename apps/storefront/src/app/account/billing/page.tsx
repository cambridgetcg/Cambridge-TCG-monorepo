import { redirect } from "next/navigation";

// Billing retired 2026-07-21 — there are no paid memberships on Cambridge TCG
// anymore (the platform is free). Nothing to bill; send bookmarks to /account.
export default function RetiredBillingPage() {
  redirect("/account");
}
