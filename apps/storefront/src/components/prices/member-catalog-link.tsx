import Link from "next/link";
import { memberPriceHref } from "./member-query";

/** A public doorway, not a private read; metadata stays on the public catalog. */
export function MemberCatalogLink({ game, set, sku }: { game: string; set?: string; sku?: string }) {
  const filters = new URLSearchParams({ game });
  if (set) filters.set("set", set);
  if (sku) filters.set("sku", sku);
  return (
    <aside className="my-8 border-y border-border-subtle py-5 text-sm">
      <h2 className="font-display text-lg font-medium text-ink">Member price reference</h2>
      <p className="mt-2 max-w-3xl text-ink-muted">
        Browse permitted source prices and history with an existing account.
        Legacy CardRush values stay withheld. {set || sku ? "This filter includes only exact catalog mappings; unmatched source products may still appear in the wider browser." : "Coverage depends on the source and actual imported observations."}
      </p>
      <Link href={memberPriceHref(filters)} prefetch={false} className="mt-3 inline-block text-accent underline underline-offset-4">
        Browse member prices for {sku ? "this card" : set ? "this set" : "this game"}
      </Link>
      <p className="mt-2 text-xs text-ink-muted">Not signed in? Signing in keeps these filters. New registration may be paused.</p>
    </aside>
  );
}
