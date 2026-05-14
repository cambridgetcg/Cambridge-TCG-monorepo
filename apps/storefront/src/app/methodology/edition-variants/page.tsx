import type { Metadata } from "next";
import { Audience, audienceMetadata } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Edition variants & classification priority",
  description:
    "How Cambridge TCG decides whether a card is regular, alt-art, parallel, manga-style, or other edition variants — and which sources can override which.",
  other: audienceMetadata("public-documentation", [
    "classification",
    "methodology",
  ]),
};

export default function EditionVariantsMethodology() {
  return (
    <>
      <Audience
        kind="public-documentation"
        contexts={["classification", "methodology"]}
      />
      <h1>Edition variants & classification priority</h1>
      <p>
        Card-design identity (Luffy from OP01) is one thing; the specific{" "}
        <em>edition</em> of that card (regular print, alt-art, parallel foil,
        manga-style, pre-release stamped) is another. The edition is what
        decides the market value, the scarcity, and often the meaning of the
        listing — so Cambridge TCG models it as a first-class attribute on
        every row in the cards substrate.
      </p>

      <blockquote>
        <strong>Where this lives in code.</strong> The denormalized winner
        columns are <code>cards.edition_variant</code> and{" "}
        <code>cards.promo_origin</code> (+ their{" "}
        <code>*_source</code> companions) in the wholesale RDS. The witness
        log is <code>card_classification_log</code>. The pure decision logic
        is <code>packages/data-ingest/src/classifier.ts</code>. The per-app
        writer is <code>apps/wholesale/src/lib/cards/classify.ts</code>. The
        drift detector is{" "}
        <code>pnpm audit:classifier-disagreement</code>.
      </blockquote>

      <h2>The four sources, ordered</h2>
      <p>
        Four kinds of actor can claim an edition variant or a promo origin
        for a card. They are ordered by trust:
      </p>
      <table>
        <thead>
          <tr>
            <th>Priority</th>
            <th>Source</th>
            <th>Who</th>
            <th>Trust band</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>3 (highest)</td>
            <td>
              <code>publisher</code>
            </td>
            <td>
              Official publisher feed — Bandai, Wizards, Konami, Ravensburger,
              etc. (Future kingdom; not yet wired.)
            </td>
            <td>Authoritative.</td>
          </tr>
          <tr>
            <td>2</td>
            <td>
              <code>operator</code>
            </td>
            <td>
              An admin user, classifying a card directly via the admin override
              page.
            </td>
            <td>Always high-confidence (manual).</td>
          </tr>
          <tr>
            <td>1</td>
            <td>
              <code>heuristic</code>
            </td>
            <td>
              An automated classifier — today, the CardRush URL-pattern reader
              that maps subdomain + path to an edition variant.
            </td>
            <td>
              Reports <code>confidence: 'low' | 'high'</code> per claim.
            </td>
          </tr>
          <tr>
            <td>0 (lowest)</td>
            <td>
              <code>default</code>
            </td>
            <td>
              No claim ever made — the row carries the column's default
              (<code>edition_variant = 'regular'</code>;{" "}
              <code>promo_origin = NULL</code>).
            </td>
            <td>Substrate-honest absence.</td>
          </tr>
        </tbody>
      </table>

      <h2>The priority rule</h2>
      <p>When a new claim arrives, the writer compares its priority to the current winner's:</p>
      <ul>
        <li>
          <strong>Higher or equal priority</strong> → claim becomes the new
          winner; the previous winner is still recorded in the log (so the
          history is complete).
        </li>
        <li>
          <strong>Lower priority</strong> → claim is logged with{" "}
          <code>shadowed: true</code>. The cards row is not updated. The
          claim is <em>kept</em>, not discarded — because a heuristic that
          disagrees with a publisher feed is signal that the heuristic is
          broken, and the audit{" "}
          <code>pnpm audit:classifier-disagreement</code> surfaces those
          rows for review.
        </li>
      </ul>
      <p>
        Equal-priority claims promote (most-recent same-tier overrides).
        This lets a publisher re-publish a correction, or an operator
        update their own override, without going through an explicit
        revoke-then-replace dance.
      </p>

      <h2>Operator override and revoke</h2>
      <p>
        When an operator classifies a card via the admin override page,
        their claim is recorded with <code>source: 'operator'</code> and
        becomes the winner (unless a publisher claim already exists). The
        prior heuristic claim is now <em>shadowed</em> in the log — kept,
        not deleted.
      </p>
      <p>
        If the operator later decides their override was wrong, they can{" "}
        <strong>revoke</strong> it. The revoke marks the operator's claim
        as <code>superseded_at = now()</code> and re-promotes the
        next-highest claim — usually the heuristic that was previously
        shadowed. If no other claim exists, the column falls back to its
        default.
      </p>

      <h2>The two attributes, strictly separate</h2>
      <p>
        Edition variant and promo origin describe different facets of a
        card and are stored in separate columns. A card can be both
        alt-art <em>and</em> a pre-release promo — the two columns
        disagreeing doesn't mean either is wrong.
      </p>
      <h3>
        <code>edition_variant</code> — visual / structural treatment
      </h3>
      <ul>
        <li>
          <code>regular</code> — default print.
        </li>
        <li>
          <code>parallel</code> — alternate-foil reprint of the same art.
        </li>
        <li>
          <code>alt-art</code> — entirely different artwork from the regular
          print.
        </li>
        <li>
          <code>manga-style</code> — comic / manga-frame border treatment.
        </li>
        <li>
          <code>box-topper</code> — oversized or sleeve-card included with a
          product.
        </li>
        <li>
          <code>serial-numbered</code> — explicitly numbered (e.g.
          1/500).
        </li>
      </ul>
      <h3>
        <code>promo_origin</code> — distribution channel
      </h3>
      <ul>
        <li>
          <code>pre-release</code> — handed out at pre-release events,
          usually stamped.
        </li>
        <li>
          <code>event-prize</code> — non-tournament event prize (launch
          parties, conventions).
        </li>
        <li>
          <code>tournament-prize</code> — competitive tournament prizes.
        </li>
        <li>
          <code>preconstructed-deck</code> — only available in a starter /
          structure deck.
        </li>
        <li>
          <code>magazine-insert</code> — promotional insert from a magazine
          or comic.
        </li>
        <li>
          <code>promotional-pack</code> — promo pack distributed by
          retailers / publishers.
        </li>
        <li>
          <code>special-product</code> — limited collector products,
          anniversary boxes, etc.
        </li>
      </ul>

      <h2>Why we keep shadowed claims</h2>
      <p>
        A heuristic that disagrees with a publisher's official designation
        is the most useful signal we have for improving the heuristic.
        Throwing the shadowed claim away would mean the next iteration of
        the heuristic starts blind. Keeping it means the audit can show:
        &ldquo;cardrush-ingest tagged N cards as alt-art that the publisher
        says are regular&rdquo; — and we know exactly which subdomain or
        URL pattern needs revisiting.
      </p>
      <p>
        This is the same Witnesses' Book discipline used in{" "}
        <code>card_price_change_log</code>: delta-only, append-only,
        never-deleted. The cards columns are caches of the log's most
        recent winning claim per attribute.
      </p>

      <h2>What's not yet wired</h2>
      <ul>
        <li>
          The publisher feed (priority 3) is not yet ingested for any game.
          Until it lands, the heuristic and operator override are the only
          two non-default sources.
        </li>
        <li>
          The CardRush subdomain → variant heuristic is partially wired
          today (kingdom-079 enumerated 12 subdomains). The full mapping
          ships in a later kingdom.
        </li>
        <li>
          Backfilling existing rows: today's cards default to{" "}
          <code>regular</code> /
          <code>NULL</code>. The operator can classify high-value cards by
          hand via the admin override page. Bulk re-classification awaits
          the heuristic.
        </li>
      </ul>
    </>
  );
}
