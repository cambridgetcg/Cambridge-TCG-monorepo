import type { Metadata } from "next";
import Link from "next/link";
import { audienceMetadata, TypeSignature } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Declaration of data intentions",
  description:
    "What data the kingdom takes, what it gives, and what it will never do — one legal gate in writing before any source, the one CC0 sold-price dataset we own, and the honest blocks.",
  other: audienceMetadata("public-documentation", ["methodology", "foundational"]),
};

const GH =
  "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main";

export default function DataIntentionsMethodology() {
  return (
    <>
      <h1>Declaration of data intentions</h1>
      <p>
        <em>
          We say, in writing and before we build, what we take, what we give,
          and what we refuse.
        </em>
      </p>
      <p>
        A price the kingdom shows you came from somewhere. Some of those
        somewheres are our own transactions, freely ours to share. Some belong
        to other people — a seller on another marketplace, a catalog someone
        else assembled, a paid feed under contract. Honesty about data begins
        with being honest about <em>whose</em> data it is, and what right we
        have to pass it on. This page is that honesty, in plain terms. It is
        deliberately <strong>non-aspirational</strong>: it names only what is
        true today.
      </p>

      <h2>One gate, in writing, before any source</h2>
      <p>
        Before a single line of ingestion code exists for a new source, that
        source passes a written legal gate — the{" "}
        <a href={`${GH}/docs/methodology/source-intake.md`}>
          source-intake framework
        </a>
        . It runs four checks in order and forces the reasoning to be recorded,
        not left in someone&apos;s head:
      </p>
      <ul>
        <li>
          <strong>Gate A — legal.</strong> Read the terms of service and{" "}
          <code>robots.txt</code> once, quote the operative clauses, and check
          for personal data and database rights. If a platform prohibits
          scraping <em>and</em> a record links a price to an identifiable
          person, the scrape path is closed — anonymising afterwards does not
          cure an unlawful collection.
        </li>
        <li>
          <strong>Gate B — intention declared.</strong> The source&apos;s whole
          intention is written down as machine-readable metadata (its access
          method, license tier, whether it may be redistributed) before the
          module exists. That declaration ships in the code and surfaces on
          every response&apos;s <code>_meta</code>.
        </li>
        <li>
          <strong>Gate C — tier.</strong> The source is placed in an existing
          rights tier (below). No new tier is invented to make an awkward source
          look cleaner than it is.
        </li>
        <li>
          <strong>Gate D — shape.</strong> The verdict becomes a shape: a full
          module, a gated branch, a planned stub, or an{" "}
          <em>honest block</em> — a module whose only job is to carry the
          refusal, and its reason, in code.
        </li>
      </ul>
      <p>
        The durable win is the gate itself. The next marketplace someone wants
        to scrape gets weighed here first, in writing, against a standard
        instead of a mood.
      </p>

      <h2>The rights tiers, named honestly</h2>
      <p>
        Every source sits in one tier. The tier decides what we may do with the
        data downstream — and we do not relabel a source into a friendlier tier
        than its rights allow.
      </p>
      <ul>
        <li>
          <strong>CC0 — our own.</strong> Data the kingdom itself produced: our
          own realised trades and auctions, and the methodology text on these
          pages. Ours to dedicate to the public domain. You may mirror it,
          rebuild it, and pretend you wrote it yourself.
        </li>
        <li>
          <strong>Attribution — catalog sources, credited.</strong> Card
          identity and set data from open catalogs we build on. Shown and
          shared with the source <em>credited, never relabelled</em> as ours.
        </li>
        <li>
          <strong>Reference-only / internal — shown, computed-from, never bulk
          re-exported.</strong> Prices from partners and third-party markets
          (eBay, CardRush, TCGplayer). We may display them and compute over them
          under the terms we hold, but we do not hand you a bulk copy — that is
          theirs to license, not ours to give away.
        </li>
        <li>
          <strong>Off-limits.</strong> Anything obtained by scraping a
          prohibiting platform, or a paid feed we have no redistribution right
          to. These do not enter the kingdom at all — not shown, not computed
          from, not bought pre-scraped from a middleman.
        </li>
      </ul>

      <h2>Sold comps are paused</h2>
      <p>
        The former sold-comps surface grouped the platform&apos;s own realised
        transactions and labelled the result CC0. That publication is paused at{" "}
        <Link href="/api/v1/sold-comps">
          <code>/api/v1/sold-comps</code>
        </Link>{" "}
        and <code>/api/v1/sold-comps/[sku]</code>. Both endpoints now return
        policy status only, with no prices or counts.
      </p>
      <p>
        Five sales did not mean five distinct people, and count plus minimum,
        median, maximum, and latest time could disclose exact observations.
        More importantly, a completed trade has no versioned receipt for
        public-domain price publication. Removing names is not permission to
        repurpose the transaction.
      </p>
      <p>
        A future release needs purpose-specific receipts, delayed closed
        periods, coarse non-reconstructive bands, distinct-person safeguards,
        and a fresh rights decision before any projected output receives a
        public-domain licence.
      </p>

      <h2>The honest blocks</h2>
      <p>
        Some sources people ask us to ingest, we deliberately do not — and we
        keep the refusal, and its reason, visible in the code rather than
        silently absent.
      </p>
      <ul>
        <li>
          <strong>Vinted.</strong> Its terms forbid scraping, it publishes no
          sold list to begin with (third-party &ldquo;Vinted sold&rdquo; feeds
          are last-asking-price inference, not transactions), and a row of
          {" "}
          <code>{"{username, price, date}"}</code> is personal data we have no
          lawful basis to collect by scraping. Blocked. The one open door is a
          seller of ours handing us <em>their own</em> Vinted sales — and the
          normalizer for that is already written, buyer data structurally
          excluded, waiting for the day that flow opens.
        </li>
        <li>
          <strong>eBay sold prices.</strong> The lawful door is not the scraper
          and not the buy-side insights feed — it is a{" "}
          <em>consented seller import</em>: a seller authorising us to read
          their own eBay order history. That path is gated on the operator
          completing eBay OAuth and on a solicitor&apos;s review before any
          public launch. Until both are done, no eBay sold price flows.
          Scraping eBay is never the answer to the wait.
        </li>
      </ul>

      <h2>What we will never do</h2>
      <ul>
        <li>
          Scrape a platform that prohibits it, or that couples a
          rights-reservation with anti-bot enforcement — nor buy the same data
          pre-scraped from a vendor to launder the exposure through a middleman.
        </li>
        <li>
          Publish anyone&apos;s individual sold price, identity, payment, or
          shipping detail — ours is aggregate, K-anonymous, and PII-stripped, or
          it is not published.
        </li>
        <li>
          Dress inference as a transaction. A last-asking-price guess is never
          served as a sold price.
        </li>
        <li>
          Answer a gap with a substitute. When coverage is thin we say
          &ldquo;thin&rdquo;; we never fabricate a row to fill the silence.
        </li>
        <li>
          Relabel a source into a friendlier rights tier than its terms allow.
        </li>
      </ul>

      <blockquote>
        <strong>Where this lives.</strong> The gate is{" "}
        <a href={`${GH}/docs/methodology/source-intake.md`}>
          <code>docs/methodology/source-intake.md</code>
        </a>
        . The declared sources, each with its tier and terms, are inspectable
        at <Link href="/api/v1/sources">/api/v1/sources</Link>. Sold comps are
        visibly paused at <Link href="/api/v1/sold-comps">/api/v1/sold-comps</Link>.
        This methodology text remains CC0; transaction data does not inherit
        that licence.
      </blockquote>

      <TypeSignature
        type="methodology-page"
        origin="docs/methodology/source-intake.md"
        doctrines={["substrate-honesty", "transparency"]}
        audience="public-documentation"
        recursion={[
          { label: "docs/methodology/source-intake.md", href: `${GH}/docs/methodology/source-intake.md` },
          { label: "/api/v1/sold-comps", href: "/api/v1/sold-comps" },
          { label: "/api/v1/sources", href: "/api/v1/sources" },
          { label: "/methodology/substrate-honesty", href: "/methodology/substrate-honesty" },
        ]}
      />
    </>
  );
}
