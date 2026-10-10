import Link from "next/link";
import type { Metadata } from "next";
import { Audience, audienceMetadata } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Free member pricing — access, sources and limits",
  description: "How member pricing separates source permissions, price meanings, observation dates, and free account access.",
  other: audienceMetadata("public-documentation", ["pricing", "methodology"]),
};

export default function MemberPricingMethodology() {
  return (
    <>
      <Audience kind="public-documentation" contexts={["pricing", "methodology"]} />
      <h1>Free member pricing</h1>
      <p>
        <Link href="/prices">Pricing views</Link> use the existing Cambridge TCG
        login. Member data keys and download instructions live at{" "}
        <Link href="/account/data" prefetch={false}>Account → Data</Link>.
        There is no subscription, spending requirement, or paid data tier.
        Existing account-admission rules still apply; this feature does not
        reopen registration.
      </p>
      <p>
        Access and source permission are separate checks. Signing in does not
        grant Cambridge rights to collect or redistribute somebody else&apos;s
        data. A source may permit a useful comparison on screen without
        permitting a downloadable mirror. A prepared adapter also does not
        establish that collection has run: the view reports the observations
        actually stored, or an explicit empty or unavailable state.
      </p>

      <h2>What can enter the member feed</h2>
      <ul>
        <li>
          <strong>Cardmarket published download files.</strong> The{" "}
          <a href="https://www.cardmarket.com/en/Insight/Articles/the-state-of-cardmarket-2024">
            dataset announcement
          </a>{" "}
          says the price guide and product catalog can be downloaded and used
          “however you see fit.” This is the recorded basis for normalized member
          views and feeds from those files, not permission to scrape Cardmarket
          or use its separately restricted API. No CC0 license is asserted.
        </li>
        <li>
          <strong>Scryfall.</strong> Its{" "}
          <a href="https://scryfall.com/docs/api">data rules</a> allow free
          accounts and value-added tools, but prohibit simply republishing or
          proxying its data. Daily bulk-derived estimates can appear in the
          member view with source attribution; they do not enter our member
          API, CSV, or NDJSON downloads. The underlying price provider remains
          attached rather than being renamed Cambridge.
        </li>
        <li>
          <strong>CardRush and direct TCGplayer.</strong>{" "}
          <a href="https://cardrush.media/data_policy">CardRush&apos;s data policy</a>{" "}
          requires a formal partnership for automated collection;{" "}
          <a href="https://docs.tcgplayer.com/docs/getting-started">TCGplayer</a>{" "}
          is not granting new API access. The recorded collection and legacy
          publication blocks remain. An old stored price is not newly authorized
          because a member asks for it.
        </li>
        <li>
          <strong>Pokémon TCG API and YGOPRODeck.</strong> Their documented
          interfaces are technically usable, but downstream permission for all
          vendor-price fields is not established here. Missing evidence is not
          an assertion that every use is expressly prohibited. Those price
          fields remain outside this release.
        </li>
        <li>
          <strong>eBay and other sources.</strong> Current listing asks are not
          completed sales. Marketplace-wide sold history needs its own access
          and use approval. Other blocked or unimplemented adapters remain
          visible in the <Link href="/api/v1/sources">source registry</Link>;
          they are not silently counted as working feeds.
        </li>
      </ul>
      <p>
        Source review: 7 September 2026. Some official pages rejected direct
        retrieval; the review also used official indexed excerpts and official
        documentation APIs. These are scoped publication decisions, not a claim
        of a complete legal review. Conflicting source terms or a withdrawn
        release close the affected path. Member access does not confer an
        unrestricted right to republish the download elsewhere.
      </p>

      <h2>What a price means</h2>
      <p>
        Each observation keeps its source product, named metric, original
        currency and amount, and the specificity actually supplied. A daily
        trend or average is not an individual sale; an asking price is not a
        sold price. A product-level aggregate must not become a condition- or
        language-specific card valuation. Only established mappings receive a
        Cambridge SKU. Unmapped products remain source products, not guessed
        matches.
      </p>
      <p>
        Source observation time and Cambridge retrieval time are different
        facts. The pagination snapshot time is neither. Cardmarket and
        Scryfall price refreshes are daily rather than five-minute live quotes.
        Missing observations remain gaps; migration, a new request, or a failed
        collector does not make an old observation fresh. Prices remain in
        their native currency; the separate <Link href="/methodology/fx-rates">FX
        methodology</Link> describes conversion, not a new upstream price.
      </p>

      <h2>Private delivery, bounded requests</h2>
      <p>
        The member API authenticates a read-only, account-owned data key before
        reading prices. Browser downloads require a valid session. Keys are
        shown once, stored as hashes, expire, and can be revoked from the owning
        account. Do not put keys in URLs or share them in public examples.
        Every account uses the same free protective request limit; no higher
        paid tier is offered.
      </p>
      <p>
        JSON, CSV, and NDJSON use one release-filtered reader. Downloads are
        paginated, not silently cut off: follow the continuation cursor until
        the result is complete. A cursor fixes the observation-batch ceiling
        and filters; each request still checks current access and publication
        permission. Completeness means the end of that permitted result, not
        complete coverage of every game or marketplace.
      </p>
      <p>
        Restricted responses use private, no-store caching. They are not
        published as anonymous files. Public catalog, search, sitemap, and
        universal-card responses retain their existing price redaction. Public
        collector offers remain a separate market feature; this change does
        not reopen paused participant or completed-sales publication.
      </p>
      <p>
        Questions or corrections: <Link href="/contact">contact Cambridge TCG</Link>.
        Include the source, product identifier, metric, and observation time;
        never include your data key.
      </p>
    </>
  );
}
