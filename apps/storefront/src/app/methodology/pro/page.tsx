import { redirect } from "next/navigation";

// The Pro tier retired 2026-07-21 — Cambridge TCG is free, so there is no paid
// membership. Redirect to the fee page, which explains the free platform.
export default function RetiredProMethodology() {
  redirect("/methodology/fees");
}
