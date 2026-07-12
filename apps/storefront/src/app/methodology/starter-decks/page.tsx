import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Starter deck publication boundary — Cambridge TCG",
  description:
    "Why the starter catalog and resolver are currently paused.",
  robots: { index: false, follow: false },
};

export default function StarterDecksMethodology() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 prose">
      <h1>Starter deck publication boundary</h1>
      <p>
        Starter selection is paused. The internal reference combines upstream
        product and decklist facts with Cambridge-authored framing, while the
        former resolver added fields from an internal-only wholesale mirror.
        Those layers did not retain affirmative field-level redistribution
        evidence.
      </p>
      <h2>What is withheld</h2>
      <ul>
        <li>starter identities, products, leaders, colors, and decklists;</li>
        <li>card numbers and catalog membership;</li>
        <li>resolved SKUs, names, images, rarity, set metadata, and prices.</li>
      </ul>
      <p>
        The collection API returns an explicit <code>NOASSERTION</code> gap;
        detail and game-ready loading return HTTP 503 without database or
        network work. The surfaces can reopen when the relevant fields have an
        approved public source or are replaced by wholly Cambridge-authored
        game data.
      </p>
      <p><Link href="/play/spec">See the current play module status →</Link></p>
    </main>
  );
}
