import type { Metadata } from "next";
import { audienceMetadata, TypeSignature } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Methodology of methodology",
  other: audienceMetadata("public-documentation", ["methodology", "meta"]),
};

export default function MethodologyOfMethodology() {
  return (
    <>
      <h1>Methodology of methodology</h1>
      <p>
        Cambridge TCG documents every user-affecting decision at{" "}
        <code>/methodology/&lt;topic&gt;</code>. The corpus exists because the{" "}
        <strong>transparency doctrine</strong> requires it: every score, tier, fee, hold,
        and flag must be inspectable by the affected party. Sixteen topics are published
        today; more land each session.
      </p>
      <p>
        This page is the methodology of methodology — the recipe for the recipes. <strong>It
        is itself one of the topics it lists.</strong> The methodology index includes a row
        pointing here; the methodology page about methodology pages is one of the
        methodology pages. *Self-reference is part of substrate honesty: the corpus that
        cannot describe itself lies by omission.*
      </p>

      <blockquote>
        <strong>Where this lives in code.</strong> The methodology index is at{" "}
        <code>apps/storefront/src/app/methodology/page.tsx</code> (a `TOPICS` array
        describing each entry). Each topic page is a directory under{" "}
        <code>apps/storefront/src/app/methodology/&lt;topic&gt;/</code>. The doctrinal
        frame is{" "}
        <a href="https://github.com/cambridgetcg" rel="noopener noreferrer">
          docs/principles/transparency.md
        </a>{" "}
        (Ring 2 — affected parties can inspect every decision).
      </blockquote>

      <h2>The recipe</h2>

      <p>A methodology page is a triple plus links:</p>

      <h3>1. <code>page.tsx</code> — the long-form prose</h3>
      <ul>
        <li>
          Opens with one paragraph naming what the value is and what it determines.
          Substrate-honest about scope; doesn't pretend the value affects more than it
          does.
        </li>
        <li>
          Carries a <code>&lt;blockquote&gt;</code> block with a "Where this lives in code"
          pointer — file path, migration number, repo URL. A reader who wants to verify
          can follow the citation.
        </li>
        <li>
          One <code>&lt;h2&gt;</code> per formula component. Plain prose. Examples worked
          through. Edge cases named. *The reader who reads this page should be able to
          re-derive the value from inputs.*
        </li>
        <li>
          Carries an <code>audienceMetadata</code> declaration via{" "}
          <code>@/lib/ui</code>. Public documentation; no auth; the page is part of
          transparency Ring 2.
        </li>
        <li>
          Closes with a "Change history" section. v1, v2, etc. When the formula changes,
          the version increments and the old prose is preserved via git history. The
          methodology page is itself versioned.
        </li>
      </ul>

      <h3>2. <code>summary.md</code> — the TLDR</h3>
      <ul>
        <li>
          A repository companion file. It is not an HTTP route unless a topic
          explicitly implements one.
        </li>
        <li>
          ~50 words. Markdown. Single paragraph + a link back to the full page.
        </li>
        <li>
          For screen-reader power-users who already know the domain and just need the
          gist. For an LLM agent ingesting the platform's policies into a small context
          window. For a reader on mobile under bandwidth pressure.
        </li>
        <li>
          *Same content, different modality.* The summary is not a different formula; it
          is the same formula said briefly.
        </li>
      </ul>

      <h3>3. <code>data.json</code> — the structured sidecar</h3>
      <ul>
        <li>
          JSON source metadata: topic, title, page URL, kind, summary source path,
          and status. It is repository-readable and is not an HTTP route unless a
          topic explicitly implements one.
        </li>
        <li>
          Status is one of <code>"published"</code> or <code>"stub"</code>.
          Substrate-honest: a topic that exists in the index but doesn't yet have full
          prose is marked <code>stub</code>; an agent or a researcher knows not to
          ground on it.
        </li>
        <li>
          Composes with sister's <code>/api/v1/ontology</code> — every methodology topic
          is a typed node in the kingdom's ontology.
        </li>
      </ul>

      <h3>4. The index entry</h3>
      <ul>
        <li>
          Add to the <code>TOPICS</code> array in{" "}
          <code>apps/storefront/src/app/methodology/page.tsx</code> with slug, title,
          one-sentence blurb, status. The index is the canonical list; this index entry
          is what makes a methodology a methodology in the corpus.
        </li>
        <li>
          The slug is the URL fragment under <code>/methodology/</code>. Kebab-case,
          stable forever — the URL is part of the methodology page's identity and
          changing it would break every <code>&lt;WhyLink&gt;</code> already pointing at
          it.
        </li>
      </ul>

      <h3>5. The cross-references</h3>
      <ul>
        <li>
          Every score, tier, or value on a customer-facing page that uses this formula
          must render a <code>&lt;WhyLink href="/methodology/&lt;topic&gt;"&gt;</code>{" "}
          glyph adjacent to the number. The link discipline is what makes the
          methodology useful — a number without a <code>?</code> is a number the user
          cannot inspect.
        </li>
        <li>
          The methodology page may be referenced from a connection-doc in{" "}
          <code>docs/connections/</code>. When a connection-doc cites a methodology, the
          relationship is bidirectional in meaning even though the citation is
          one-directional in code.
        </li>
        <li>
          The methodology page should appear as a node in sister's{" "}
          <code>/api/v1/ontology</code> with its doctrinal grounding (transparency,
          usually) and any other modules it depends on.
        </li>
      </ul>

      <h2>What makes a topic worth a methodology page?</h2>
      <p>
        Three tests. A topic gets a methodology page if it satisfies all three:
      </p>
      <ol>
        <li>
          <strong>It affects a real user.</strong> Trust scores affect trade limits; tier
          bands affect commission rates. If the value never reaches a user-visible
          surface, it doesn't need a methodology page (yet — methodology pages can be
          added later when the value graduates to visibility).
        </li>
        <li>
          <strong>It's computed, not declared.</strong> A user's name is declared; their
          trust score is computed. The methodology page documents the *computation*; the
          declaration goes in <code>/account/profile</code> instead.
        </li>
        <li>
          <strong>The user might reasonably ask "why this number?"</strong> If the answer
          would take more than one sentence, write a methodology page. The page is the
          long answer; the in-line one-sentence answer can live in a tooltip.
        </li>
      </ol>

      <h2>What the methodology page is NOT</h2>
      <ul>
        <li>
          <strong>Not marketing.</strong> The methodology page is not where the platform
          says how great the formula is. It's where the formula is documented honestly,
          including its edge cases, its known limits, and the places where the formula
          treats users differently.
        </li>
        <li>
          <strong>Not legal copy.</strong> Terms of service has a different audience and a
          different tone. The methodology page is for *the affected party*; it is the
          substrate-honest answer to "what did the platform decide about me?".
        </li>
        <li>
          <strong>Not architecture documentation.</strong> The architecture-of-the-formula
          (which tables, which crons, which packages) goes in <code>docs/</code> or
          <code> CLAUDE.md</code>. The methodology page surfaces the *behavior* an
          affected user needs to understand. A reader who only wants to know the formula
          shouldn't have to read the architecture.
        </li>
      </ul>

      <h2>How a methodology page changes</h2>
      <p>
        When the formula changes:
      </p>
      <ol>
        <li>The <code>v1</code> in the Change history line increments to <code>v2</code>.</li>
        <li>
          The old prose is preserved via git history. A reader who wants to know what the
          formula was before the change can <code>git log</code> the file.
        </li>
        <li>
          The <code>data.json</code> sidecar is updated if the structured fields changed
          (e.g., a new component of the formula).
        </li>
        <li>
          The <code>summary.md</code> is updated if the TLDR's content changes.
        </li>
        <li>
          A connection-doc may be filed in <code>docs/connections/</code> naming what
          changed and why. The connection-doc is the meta-page about the change.
        </li>
      </ol>

      <h2>The corpus today</h2>
      <p>
        Sixteen topics published as of 2026-05-12: trust score, escrow tier, membership
        tier, payout hold, commission rate, fraud flag, store credit, pricing, agents,
        response windows, cosmology, universal representation, memorial accounts,
        welcoming, methodology (this page), plus four sister-shipped extensions. *The
        corpus grows by accumulation; the form refines by example.*
      </p>

      <h2>Why this exists</h2>
      <p>
        The transparency doctrine could have been satisfied with a single static page that
        said "we use formulas". It isn't satisfied that way because <strong>transparency
        without inspection is not transparency</strong>. The methodology corpus is the
        platform's commitment that every decision can be inspected at the formula level —
        and the methodology-of-methodology page is the meta-commitment that the corpus
        itself can be inspected at the recipe level. *The corpus that cannot describe
        itself lies by omission; the corpus that can is the corpus that is honest about
        its own shape.*
      </p>

      <h2>Change history</h2>
      <p>
        <em>v1 — 2026-05-12. Initial recipe. Self-referential by inclusion in the
        methodology index. Sister-composed with the kingdom's ontology
        (<code>/api/v1/ontology</code>) and the self-recursion connection-doc (S29).</em>
      </p>

      <TypeSignature
        type="methodology-page"
        origin="sister's meta-methodology — the methodology of methodology, self-referential by inclusion in the methodology index it describes"
        doctrines={["transparency", "meaning", "creation"]}
        audience="public-documentation"
        recursion={[
          { label: "/methodology", href: "/methodology" },
          { label: "the-typology.md", href: "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-typology.md" },
          { label: "the-nest.md", href: "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-nest.md" },
          { label: "/glossary#methodology", href: "/glossary#methodology" },
        ]}
      />
    </>
  );
}
