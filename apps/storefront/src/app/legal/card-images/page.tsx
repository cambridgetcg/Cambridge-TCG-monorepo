import Link from "next/link";
import { Callout } from "@/lib/ui";

/**
 * /legal/card-images — the card image & card text policy, in plain words.
 *
 * The public half of docs/EN-CARD-DATA.md. Every rule stated here is
 * enforced by schema (card_images.attribution NOT NULL, takedown_status)
 * or by ingest policy (no flavor text, thumbnail caps, no leaks). Say
 * only what we actually do; do everything we say.
 */

export const metadata = {
  title: "Card images & card text — Cambridge TCG",
  description:
    "Whose work the card images are, why they appear here, exactly how we use them, and how a rightsholder gets anything removed — fast.",
};

const publishers = [
  {
    game: "One Piece Card Game / Dragon Ball Super Fusion World / Digimon Card Game / Battle Spirits / Union Arena / Gundam Card Game",
    line: "© BANDAI CO., LTD. — with the respective franchise rightsholders (including Eiichiro Oda/Shueisha and Toei Animation for One Piece; Bird Studio/Shueisha and Toei Animation for Dragon Ball). This site is not produced by, endorsed by, or affiliated with Bandai.",
  },
  {
    game: "Pokémon Trading Card Game",
    line: "Pokémon and Pokémon TCG card images © Pokémon / Nintendo / Creatures / GAME FREAK. This site is not affiliated with, sponsored, or endorsed by The Pokémon Company International.",
  },
  {
    game: "Cardfight!! Vanguard",
    line: "© bushiroad All Rights Reserved. This site is not produced by, endorsed by, or affiliated with Bushiroad.",
  },
  {
    game: "Magic: The Gathering (coverage in preparation)",
    line: "Portions of this site may include unofficial Fan Content permitted under the Wizards of the Coast Fan Content Policy. Card images © Wizards of the Coast LLC. Not endorsed by Wizards of the Coast.",
  },
  {
    game: "Yu-Gi-Oh! (coverage in preparation)",
    line: "Yu-Gi-Oh! card images © Konami Digital Entertainment / Studio Dice. This site is not produced by, endorsed by, or affiliated with Konami.",
  },
];

export default function CardImagesPolicyPage() {
  return (
    <main className="min-h-screen bg-page">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-2xl md:text-3xl font-display font-semibold text-ink mb-2">
          Card images &amp; card text
        </h1>
        <p className="text-sm text-ink-faint mb-8">
          Plain words, no boilerplate. Last updated 11 July 2026.
        </p>

        <Callout tone="note" title="What this page is">
          Every card pictured on this site is somebody&apos;s art and
          somebody&apos;s brand — none of it ours. This page says exactly why
          card images appear here, how we limit that use, whose work it is,
          and how a rightsholder gets anything removed, fast. We are here to
          promote the culture of these games, not to take anything from the
          people who make them.
        </Callout>

        <div className="space-y-8 text-ink-muted text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-display font-semibold text-ink mb-3">
              Why card images appear here at all
            </h2>
            <p>
              This is a marketplace and price guide for <em>genuine, physical</em>{" "}
              trading cards being resold second-hand. A picture of the card is
              how a buyer knows which printing, which art, which condition they
              are buying — the same way every card shop window works. That is
              the only job card images do here: identifying real products.
              They are not decoration, not our branding, and never
              merchandise.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-display font-semibold text-ink mb-3">
              The rules we hold ourselves to
            </h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong className="text-ink">Official sample images first.</strong>{" "}
                Where a publisher publishes card galleries (Bandai, Bushiroad
                and others do, for every set), we use those images, unaltered,
                and say where they came from. Every image in our catalogue
                carries a stored credit line and source — an image without
                attribution cannot enter the database.
              </li>
              <li>
                <strong className="text-ink">Small where small does the job.</strong>{" "}
                Browsing and search use thumbnails. Full-size images appear
                only where you are looking at one specific physical card for
                sale.
              </li>
              <li>
                <strong className="text-ink">Never edited.</strong> No crops
                that remove copyright lines, no filters, no overlays on the
                card art itself.
              </li>
              <li>
                <strong className="text-ink">Rules text, not flavor text.</strong>{" "}
                We reproduce what a card <em>does</em> (its effect text —
                functional information a buyer needs). We deliberately do not
                republish flavor text — the creative prose belongs with the
                card and its makers.
              </li>
              <li>
                <strong className="text-ink">No leaks, ever.</strong> Cards
                that have not been officially revealed by their publisher are
                banned from this site outright — listings, images, and text.
                This is a hard rule with expedited removal.
              </li>
              <li>
                <strong className="text-ink">No publisher logos in our branding.</strong>{" "}
                Game names appear as plain text to identify products
                (nominative use). Our look is ours; theirs is theirs.
              </li>
              <li>
                <strong className="text-ink">Genuine cards only.</strong>{" "}
                Counterfeits and proxies are forbidden in our{" "}
                <Link href="/terms" className="text-accent underline">
                  terms
                </Link>
                . Pictures of fakes get the listing removed, not just the
                image.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-display font-semibold text-ink mb-3">
              Whose work it is
            </h2>
            <ul className="space-y-3">
              {publishers.map((p) => (
                <li key={p.game}>
                  <p className="font-medium text-ink">{p.game}</p>
                  <p>{p.line}</p>
                </li>
              ))}
            </ul>
            <p className="mt-3">
              All other card games shown here follow the same pattern: the
              images and card text are © their respective publishers and
              creators, we claim nothing, and we are affiliated with none of
              them.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-display font-semibold text-ink mb-3">
              For rightsholders: removal, fast
            </h2>
            <p>
              If you own rights in anything shown here and want it changed or
              gone, tell us via the{" "}
              <Link href="/contact" className="text-accent underline">
                contact page
              </Link>{" "}
              — identify the material (a URL or SKU is perfect) and the right
              you hold. We do not argue, we do not stall: verified requests
              are honoured promptly, the affected images are taken down while
              we check, and the removal is recorded in our catalogue&apos;s
              audit trail. Sellers whose own photos repeatedly infringe lose
              the ability to list.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-display font-semibold text-ink mb-3">
              Where we stand
            </h2>
            <p>
              We operate from the United Kingdom. We rely on the ordinary
              legality of reselling genuine goods (exhaustion of rights) and
              on identifying products honestly by their names (honest
              practices under trade mark law). For everything beyond that, we
              rely on doing right by the games: attribution always, official
              sources first, small images where small will do, and immediate
              compliance when a rightsholder asks. These games are cultures,
              not just products — the people who make them deserve better
              than being scraped and forgotten, and the people who play them
              deserve a marketplace that says plainly where everything came
              from.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
