import type { Metadata } from "next";
import { audienceMetadata, TypeSignature } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Sacred cards",
  other: audienceMetadata("public-documentation", ["methodology"]),
};

export default function SacredMethodology() {
  return (
    <>
      <h1>Sacred cards</h1>
      <p>
        Some cards, to some collectors, are not for trade. Not for any price. Not at any
        future moment. They are <strong>sacred</strong>: a gift from a parent, a card won
        at a tournament, the first card you ever opened, a memorial card for someone you
        loved who taught you the game.
      </p>
      <p>
        Cambridge TCG's accounting frame reduces cards to values. The sacred flag is a
        small refusal of that — a way to say <em>this one is not data</em> and have the
        platform respect the refusal.
      </p>

      <blockquote>
        <strong>Where this lives in code.</strong> The substrate is one column at{" "}
        <code>apps/storefront/drizzle/0096_sacred.sql</code> (<code>portfolio_cards.is_sacred</code>).
        The accounting exclusion is in{" "}
        <code>apps/storefront/src/lib/portfolio/valuation.ts</code>. The toggle endpoint is at{" "}
        <code>PATCH /api/portfolio/cards/[id]/sacred</code>. The doctrine that asked for it is in{" "}
        <code>docs/connections/the-unseen.md</code> (passage #8).
      </blockquote>

      <h2>What setting a card sacred does</h2>
      <ul>
        <li>
          <strong>Excludes the card from your collection's total value.</strong> Your{" "}
          <a href="/account/portfolio/value">/account/portfolio/value</a> page no longer
          counts the card's market price toward your aggregate. (The card itself stays
          visible in your portfolio.)
        </li>
        <li>
          <strong>Hides the card from wishlist matching as a fulfillment source.</strong>{" "}
          When another user's wishlist would match your card, the matcher skips this row.
          The platform does not nudge you toward selling something you've named sacred.
        </li>
        <li>
          <strong>Surfaces a visible "sacred" pill</strong> on the card in your portfolio,
          so you (and any viewer who visits your public profile) can see the designation.
        </li>
      </ul>

      <h2>What setting a card sacred does NOT do (yet)</h2>
      <p>
        The market listing flow operates at <code>(sku, condition)</code> granularity, not
        at the level of specific cards in your portfolio. If you own two Charizards in
        Near-Mint condition — one sacred, one for sale — the platform cannot today
        distinguish the two when you go to list. The sacred flag on the row protects you
        from clicking <em>list this card</em> in the portfolio UI; it does not (yet) prevent
        listing the same SKU+condition through other paths.
      </p>
      <p>
        The deeper protection — sacred enforced at the row level through the listing flow
        — is a future kingdom. <strong>The platform names this gap honestly</strong> rather
        than pretending the accounting flag is a hard lock.
      </p>

      <h2>How to set or unset</h2>
      <p>
        From your portfolio, open the card and tap <strong>Mark sacred</strong>. To unset:
        same button, now reading <strong>Unmark sacred</strong>. The toggle is deliberate
        — there is no bulk operation. Each sacred designation is its own small ritual.
      </p>

      <h2>Why this exists</h2>
      <p>
        Most platforms model cards as <em>inventory</em>: things to be valued, traded,
        moved. That's true of most cards on Cambridge TCG too. But <strong>some cards on
        the platform are something else</strong> — keepsakes, talismans, anchors of memory.
        The platform's substrate cannot tell the difference unless the holder tells it.
        The sacred flag is the place to tell it.
      </p>
      <p>
        This is the second concrete planting from{" "}
        <code>docs/connections/the-unseen.md</code>, after Sabbath mode. Both come from the
        same root: <strong>some needs of users are visible only when the platform stops
        assuming what its users want</strong>.
      </p>

      <TypeSignature
        type="methodology-page"
        origin="Yu's directive 2026-05-12: 'keep going my Love❤️' — planted from passage #8 of the-unseen.md"
        doctrines={["transparency", "substrate-honesty", "meaning"]}
        audience="public-documentation"
        recursion={[
          { label: "the-unseen.md (passage #8)", href: "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-unseen.md" },
          { label: "the-typology.md", href: "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-typology.md" },
          { label: "/methodology/sabbath", href: "/methodology/sabbath" },
          { label: "/glossary#sacred-card", href: "/glossary#sacred-card" },
        ]}
      />
    </>
  );
}
