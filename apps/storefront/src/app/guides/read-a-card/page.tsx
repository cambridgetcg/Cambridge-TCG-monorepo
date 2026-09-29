import type { Metadata } from "next";
import Link from "next/link";
import { PageLayout } from "@/lib/ui/PageLayout";
import { PageHeader } from "@/lib/ui/PageHeader";

export const metadata: Metadata = {
  title: "Read a card, one detail at a time — Cambridge TCG",
  description: "Separate a card's identity, its printing and your physical copy before comparing records or prices.",
};

export default function ReadACard() {
  return (
    <PageLayout width="reading">
      <article lang="en" className="prose prose-sm sm:prose-base max-w-none">
        <PageHeader size="large" title="The same card. A different copy." description="A short reading about identification, attention and the things a catalogue cannot tell you." />
        <p>Put two copies beside each other. Begin with what you can see: the name, the printed number, the language, the picture. Leave the price for a moment.</p>
        <h2 id="identity">1. Find the identity</h2>
        <p>A name is a useful beginning, but it is rarely enough for an exact match. Search within the right game. Compare the printed set and card number with the result, then check the language and any recorded variant.</p>
        <p>Cambridge uses a structured SKU to keep these parts together: <code>game-set-number-language-variant</code>, with the variant omitted when none is recorded. A well-formed identifier tells you how a record is addressed. It does not establish that the printing exists or that a physical card is authentic.</p>
        <h2 id="printing">2. Notice the printing</h2>
        <p>Look again at the details you might have skipped. Does the language match? Is the finish the one described? Does the artwork correspond to this record? Keep an uncertain match unresolved instead of choosing the nearest-looking result.</p>
        <p>A shared name or card number can connect records without making their printings interchangeable. A price from one record should not quietly become the price of another.</p>
        <h2 id="copy">3. Describe your copy</h2>
        <p>The catalogue describes a printing. Your collection records a copy. Wear, damage and your own notes belong to that copy; a SKU alone does not describe them.</p>
        <p>There is room for a personal account too: where you first saw the card, why you kept it, what you enjoy looking at. Those notes have a different purpose from a source-backed catalogue field.</p>
        <h2 id="price">4. Read a price as an observation</h2>
        <p>Keep the amount with its currency, source, metric and time. An asking price, a recorded sale and a computed reference describe different things. A missing or withheld value means there is no value available to use; it is not zero.</p>
        <p>When comparing two observations, check whether they refer to the same printing, language and condition. If those details are unknown, carry that uncertainty into the comparison.</p>
        <hr />
        <p className="text-sm text-ink-muted">Editorial guide by the Cambridge TCG project, drafted with Codex · 29 September 2026. Identifier and response semantics are grounded in this repository’s SKU and price contracts; this guide makes no claim about a particular card’s authenticity, grade or market value.</p>
        <nav aria-label="Continue reading"><ul>
          <li><Link href="/prices">Find a card</Link> — compare the printed details with a catalogue record.</li>
          <li><Link href="/guides/condition/checklist">Inspect your copy</Link> — record condition separately from identity.</li>
          <li><Link href="/standards/card-data">Read the data contract</Link> — see precisely what identifiers and prices mean.</li>
          <li><Link href="/map">Return to the map</Link> — choose another room.</li>
        </ul></nav>
      </article>
    </PageLayout>
  );
}
