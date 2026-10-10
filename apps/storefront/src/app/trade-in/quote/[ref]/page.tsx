/**
 * Retired trade-in funnel step (collectors-first,
 * docs/decisions/2026-07-06-collectors-first.md). The desk closed
 * 2026-07-06; its dated close-out decision records zero submissions. This
 * retired page performs no historical-record lookup. Redirect keeps
 * old links landing on the honest explainer instead of a 404.
 */

import { redirect } from "next/navigation";

export default function RetiredTradeInPage() {
  redirect("/trade-in");
}
