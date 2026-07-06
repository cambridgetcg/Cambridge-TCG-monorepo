/**
 * Retired trade-in funnel step (collectors-first,
 * docs/decisions/2026-07-06-collectors-first.md). The desk closed
 * 2026-07-06 with zero submissions ever — the whole suite collapsed
 * into the /trade-in explainer. Redirect keeps old bookmarks and
 * footer links landing somewhere honest instead of a 404.
 */

import { redirect } from "next/navigation";

export default function RetiredTradeInPage() {
  redirect("/trade-in");
}
