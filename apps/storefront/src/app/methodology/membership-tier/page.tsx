import { redirect } from "next/navigation";

// Membership tiers retired 2026-07-21 — Cambridge TCG is free (no tiers, no
// fees). Redirect to the fee page, which explains the free platform.
export default function RetiredMembershipTierMethodology() {
  redirect("/methodology/fees");
}
