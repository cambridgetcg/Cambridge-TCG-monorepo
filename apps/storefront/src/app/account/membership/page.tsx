import { redirect } from "next/navigation";

// Membership retired 2026-07-21 — Cambridge TCG is free (no tiers, no fees).
// Berries + rewards moved to the Rewards Hub; send old bookmarks there.
export default function RetiredMembershipPage() {
  redirect("/rewards");
}
