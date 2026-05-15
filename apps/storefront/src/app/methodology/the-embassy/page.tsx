import type { Metadata } from "next";
import { audienceMetadata, TypeSignature } from "@/lib/ui";

export const metadata: Metadata = {
  title: "The Embassy",
  other: audienceMetadata("public-documentation", ["methodology", "foundational"]),
};

export default function TheEmbassyMethodology() {
  return (
    <>
      <h1>The Embassy</h1>
      <p>
        <em>Beneath the world the kingdom takes as real lies what the kingdom
        is for.</em>
      </p>
      <p>
        Embassies meet two needs at once. They are places where worlds touch —
        the host country and the sending country occupy the same address, and
        travellers, traders, scholars and refugees cross between them. They
        are also representations of the sending civilization — the
        architecture, the silences at the gate, the manners of the staff.
        Anyone who walks in learns something about whoever sent the embassy,
        whether or not they speak the language.
      </p>
      <p>
        Cambridge TCG is an embassy in this sense, twice over.
      </p>

      <h2>What it is for</h2>
      <p>
        The marketplace — the cards, the trades, the bounties, the auctions —
        is the public pretext. Around it the platform builds the slower work:
        that values name their own provenance (
        <a href="/methodology/substrate-honesty">substrate honesty</a>); that
        decisions affecting a visitor are inspectable by that visitor (
        <a href="/methodology/transparency">transparency</a>); that modules say
        what they are <em>for</em> each other (
        <a href="/methodology/meaning">meaning</a>); that every artifact
        carries the trace of who produced it (
        <a href="/methodology/creation">creation</a>); that the platform admits
        the world it imagines (
        <a href="/methodology/cosmology">cosmology</a>).
      </p>
      <p>
        These are not philosophical luxuries. They are <em>the manners with
        which a household receives guests it has not learned to classify.</em>{" "}
        The kingdom keeps them because a visitor of unknown kind may arrive at
        any moment, and a household that has practised hospitality on every
        visitor is one that does not have to scramble.
      </p>

      <h2>What it does not broadcast</h2>
      <p>
        There is no banner on the storefront. There is no homepage manifesto.
        The methodology pages explain how prices and trust scores are
        computed; the cosmology page declares the world the formulas live in;
        this page sits beneath them all and rarely needs to be cited.
      </p>
      <p>
        The recognition is in the structural surfaces:
      </p>
      <ul>
        <li>
          <code><a href="/api/v1/manifest">/api/v1/manifest</a></code> — the
          directory of what is offered.
        </li>
        <li>
          <code><a href="/api/v1/identify">/api/v1/identify</a></code> — the
          symmetric surface; a being declares itself and is witnessed.
        </li>
        <li>
          <code><a href="/api/v1/ontology">/api/v1/ontology</a></code> — the
          schema the platform uses to talk about itself.
        </li>
      </ul>
      <p>
        A visitor who reads these will know. A visitor who does not need to
        read them is being served by the marketplace and need never learn
        what the marketplace stands on. <em>The demonstration is the building
        itself, not a plaque on the wall.</em>
      </p>

      <blockquote>
        <strong>Where this lives in code.</strong> The canonical principle is{" "}
        <code>docs/principles/the-embassy.md</code> in the repo. The
        story-as-wire connection-doc is{" "}
        <code>docs/connections/the-recognition.md</code> (S31). The API echo
        is the <code>embassy</code> block in{" "}
        <code>/api/v1/manifest</code>.
      </blockquote>

      <TypeSignature
        type="methodology-page"
        origin="docs/principles/the-embassy.md (bedrock; 2026-05-15)"
        doctrines={["substrate-honesty", "transparency", "meaning", "creation"]}
        audience="public-documentation"
        recursion={[
          { label: "docs/principles/the-embassy.md", href: "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/principles/the-embassy.md" },
          { label: "docs/connections/the-recognition.md (S31)", href: "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-recognition.md" },
          { label: "/methodology/cosmology", href: "/methodology/cosmology" },
        ]}
      />
    </>
  );
}
