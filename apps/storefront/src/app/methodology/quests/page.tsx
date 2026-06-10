/**
 * Quests methodology — the complete rulebook for the kingdom's quest game.
 *
 * Transparency Ring 2: every user-affecting mechanic the platform runs is
 * inspectable by the affected party. The quest game affects what you see
 * (stamps, badges, the practice-days tally), so every rule of it lives on
 * this page — every quest, every completion trigger, the streak math (there
 * is none — that is the rule), the storage model, and the standing pledge
 * of what the game will never do.
 *
 * The typed corpus the page documents lives at src/lib/quests.ts; the
 * client tracker at src/components/quests/QuestTracker.tsx; the quest log
 * at /quests. This page is prose; the corpus is the source of truth; the
 * audit (pnpm audit:quest-coverage) keeps the two from drifting.
 */

import type { Metadata } from "next";
import { audienceMetadata, TypeSignature } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Quests — the complete rulebook",
  other: audienceMetadata("public-documentation", ["methodology", "quests"]),
};

interface QuestRule {
  id: string;
  title: string;
  badge: string;
  route: string;
  completes: string;
  hidden?: boolean;
}

interface QuestCategory {
  name: string;
  intro: string;
  quests: QuestRule[];
}

/**
 * Prose rendering of the corpus. The canonical typed corpus is
 * src/lib/quests.ts — if this table and the corpus ever disagree,
 * the corpus is right and this page has a bug worth reporting.
 */
const CATEGORIES: QuestCategory[] = [
  {
    name: "The Table",
    intro:
      "The play module. Everything here works for anonymous guests — play has been sign-in-free since the guest-mode kingdom.",
    quests: [
      {
        id: "learn-the-table",
        title: "Learn the Table",
        badge: "Apprentice",
        route: "/play/tutorial",
        completes:
          "You reach the final section of the tutorial and stay a moment — the end-of-page marker must hold in view for about 1.5 seconds (a redirect bounce cancels it) — OR you press the “I read the tutorial ✓” control at the same spot, the keyboard and screen-reader path. A bare page load never completes it.",
      },
      {
        id: "first-victory",
        title: "Win Your First Match",
        badge: "First Victory",
        route: "/play/adventure",
        completes:
          "You win any PVE adventure match. The server verifies the victory itself (the engine re-checks the win; replaying an already-claimed victory doesn't count twice), and the first verified win completes the quest — a page visit never does. The badge remembers the date. Winning also reveals the game's one hidden quest (see below).",
      },
      {
        id: "beat-your-own-time",
        title: "Beat Your Own Time",
        badge: "Personal Best",
        route: "/play/adventure",
        hidden: true,
        completes:
          "You re-clear an adventure level you have already beaten, in fewer turns than your recorded best — both numbers computed server-side when you claim the win. The first time you beat your own record, the quest stamps with the date; a first clear, or an equal or slower re-clear, never counts. Beating your record again after that is its own reward — the badge stamps once and nothing meters it. Hidden until First Victory — and honestly flagged beforehand: the quest log shows a labeled slot reading “1 quest reveals after your first win.”",
      },
      {
        id: "deckwright",
        title: "Make a Legal Deck",
        badge: "Deckwright",
        route: "/play/deck-check",
        completes:
          "You submit any deck — yours, a public one, an experiment — to the deck validator and it returns legal: true. The quest completes when the validator returns its passing verdict — a deck with violations, an error, or a bare page visit never does. The badge remembers the date you proved you can build a legal deck.",
      },
    ],
  },
  {
    name: "The Library",
    intro:
      "The reading rooms: the glossary, the methodology corpus, the market's calm reads. Presence is measured; comprehension is never claimed.",
    quests: [
      {
        id: "word-collector",
        title: "Sit With the Card Words",
        badge: "Word Collector",
        route: "/glossary",
        completes:
          "You visit /glossary and stay at least 20 seconds — long enough to actually read a few entries (a redirect bounce doesn't count). The definitions are deliberately all visible on one page, so the quest measures time spent with the vocabulary, not clicks. The badge remembers the date.",
      },
      {
        id: "rule-reader",
        title: "Read One Rule of the House",
        badge: "Rule Reader",
        route: "/methodology",
        completes:
          "You pick any /methodology/* page from the index and read it to the end — the end-of-page marker must hold in view for about 1.5 seconds, OR you press the “I read this rule ✓” control there, the keyboard and screen-reader path. The index itself doesn't count, and the solemn pages (memorial, sabbath, sacred) never stamp. One page completes the quest; reading more is welcome and tracked nowhere.",
      },
      {
        id: "where-we-admit-flaws",
        title: "Read Where We Admit Our Flaws",
        badge: "Honest Reader",
        route: "/methodology/known-gaps",
        completes:
          "Visit /methodology/known-gaps — the page where the platform lists its own unfixed problems in public — and dwell a few seconds. A redirect bounce doesn't count.",
      },
      {
        id: "price-reader",
        title: "Read One Card's Price Story",
        badge: "Price Reader",
        route: "/prices/one-piece/movers",
        completes:
          "You read any card's market page (/cards/[sku]/market) to the end — the end of its provenance footer must hold in view a moment, OR you press the “I read this card's price story ✓” control. Any /prices/[game]/[set]/[number] page read to the end counts too, so a quiet ingestion day never dead-ends the quest. The movers list is a good place to find a card, but we can't see how you arrived, and don't require it. The badge remembers the date.",
      },
    ],
  },
  {
    name: "The Proof Room",
    intro:
      "The provable-fairness surfaces. These two quests complete on real verification outcomes — the math passing in your browser, an entry genuinely opened — never on a bare index visit.",
    quests: [
      {
        id: "check-the-math",
        title: "Check Our Math",
        badge: "I Checked the Math",
        route: "/verify",
        completes:
          "You open any real proof page — a /verify/draw/[id] or /verify/pull/[id], both reachable from /verify. The fairness math re-runs automatically in your own browser the moment the page loads, and the quest completes only when the commit-reveal recompute passes (commitment plus every slot). The chain-inclusion check on the same page runs separately and drives its own banner; it does not gate this stamp. There is no button to press — and no way to fake a pass: a failed verification, an unrevealed draw, or a proof that isn't there never stamps.",
      },
      {
        id: "walk-the-chain",
        title: "Walk the Chain",
        badge: "Chain Walker",
        route: "/verify/chain",
        completes:
          "You expand any digest row in the public hash chain at /verify/chain — click anywhere on the row, or its # button on a keyboard or screen reader. Expanding reveals the entry's full root, previous hash, and chain hash. The first expand completes it; the page load alone never does. The badge remembers the date.",
      },
    ],
  },
  {
    name: "The Map",
    intro:
      "The exploration quests. The kingdom has hundreds of real rooms; these quests are doors, not checklists.",
    quests: [
      {
        id: "open-the-map",
        title: "Open the Map",
        badge: "Map-Holder",
        route: "/map",
        completes:
          "You visit /map once. The first visit is the whole rule — the stamp records the date, in your browser only. The honest reward is the map page itself: every artifact in the kingdom one click apart.",
      },
      {
        id: "find-the-castle",
        title: "Find the Castle",
        badge: "Castle Key",
        route: "/castle",
        completes:
          "You reach /castle and mark any insight in “The rooms” as read — a click anywhere on the card, or its keyboard-reachable “Mark this insight as read” control. The insights are open books already; the click is your deliberate act of reading one, and that act is what stamps. The page load alone never counts. The badge remembers the date you found the castle. Rare because it is hidden, not because it is limited; anyone can find it forever.",
      },
      {
        id: "hidden-doors",
        title: "Find Three Hidden Doors",
        badge: "Keymaster",
        route: "(five nav-orphaned routes)",
        completes:
          "You discover any 3 of the five real routes deliberately kept out of the menus to keep the nav calm. Each found door is recorded individually (path and date, in your browser); the third completes the quest. The full door list is published on this page behind a click-to-reveal fold below — spoilers are opt-in, never withheld.",
      },
      {
        id: "mirror-trail",
        title: "Walk the Mirror Trail",
        badge: "Cartographer",
        route: "/platform",
        completes:
          "You start at /platform, then visit the five pages where the platform describes itself, in any order: /manifest, /graph, /ontology, /patterns, /identify. The quest log counts how many of the six you've reached so far, in your browser.",
      },
    ],
  },
];

const HIDDEN_DOORS: { route: string; lore: string }[] = [
  { route: "/bridge", lore: "The Bridge: math between any two beings." },
  {
    route: "/welcomes",
    lore: "The Welcomes: greetings written before you arrived — including for beings that haven't arrived yet.",
  },
  { route: "/intro", lore: "The Introduction: what a trading card game even is, assuming nothing." },
  { route: "/standard", lore: "The Plain Standard: every rule of the house — protocol to law — in one legible grammar." },
  { route: "/standards/adopters", lore: "The Adopters: who else builds on the kingdom's open standards." },
];

const PLEDGE: { never: string; instead: string }[] = [
  {
    never: "No fake scarcity.",
    instead:
      "No badge is limited, numbered, or expiring. The Castle Key is rare because the castle is hidden, never because we capped it. Anything you can earn today, anyone can earn forever.",
  },
  {
    never: "No countdown pressure.",
    instead:
      "No timers, no “ending soon,” no daily-reset anything. Every quest waits indefinitely. Nothing decays, nothing expires.",
  },
  {
    never: "No streak-shaming.",
    instead:
      "There is no streak. The data model has no broken-streak state at all (see the tally math above), so guilt copy is structurally impossible, not merely avoided. Returning after any gap reads: “Welcome back — everything is exactly as you left it.”",
  },
  {
    never: "No pay-to-skip.",
    instead:
      "No quest, badge, or reveal can be bought. There is nothing to buy — the rewards are skills and pages, and those were free before the game existed.",
  },
  {
    never: "No infinite treadmills.",
    instead:
      "The corpus is fourteen quests and finite by design. The ending is the ending: future quests will be new named paths, never extensions that un-finish this one. The only repeatable loop is Beat Your Own Time, where you replay to beat yourself — never to fill a meter.",
  },
  {
    never: "No nagging.",
    instead:
      "Stamp toasts are visible for about 3.5 seconds then gone, capped at one per page view, with a persistent quiet-mode toggle that stamps silently. Badges live on the quest log as dated entries — never modals, never re-prompted. No share-now prompts.",
  },
  {
    never: "No comparison.",
    instead:
      "The practice-days tally appears only on the quest log — never in the nav, never in a toast, and never compared to anyone else's. There is no quest leaderboard.",
  },
  {
    never: "No surveillance.",
    instead:
      "Zero server calls and zero analytics events fire on any quest event. We cannot see your progress, and signing in never silently uploads it — any future account merge must be explicit, opt-in, and re-labeled honestly.",
  },
];

export default function QuestsMethodology() {
  return (
    <>
      <h1>Quests — the complete rulebook</h1>
      <p>
        The kingdom has hundreds of real rooms — the play tables, the proof room, the
        market's calm reads, the self-description mirrors, the castle. The quest game
        is a map that makes them fun to find: fourteen quests, each one a door, each
        badge a dated record of a real thing you did or a real skill you now have.
      </p>
      <p>
        This page is the entire game, inspectable. Every quest, every completion
        trigger, the tally math, the storage model, and the pledge of what the game
        will never do. There are no rules besides the ones on this page — if the game
        ever behaves in a way this page doesn't describe, that is a bug, and reporting
        it is more on-brand than any badge we could give you.
      </p>

      <blockquote>
        <strong>Where this lives in code.</strong> The typed quest corpus is at{" "}
        <code>apps/storefront/src/lib/quests.ts</code> — every quest, trigger, and
        badge string in one file. The client-side tracker is{" "}
        <code>src/components/quests/QuestTracker.tsx</code>. Your quest log is at{" "}
        <a href="/quests">/quests</a>. The route audit{" "}
        <code>pnpm audit:quest-coverage</code> (same pattern as{" "}
        <code>audit:nav-coverage</code>) verifies every quest points at a route that
        exists, so quests can never point at dead pages.
      </blockquote>

      <h2>What a quest is, and what a badge is</h2>
      <p>
        A <strong>quest</strong> is a named, finite thing to do on the platform —
        finish the tutorial, win a match, re-run a fairness proof, find a hidden page.
        A <strong>stamp</strong> is the client-side record that you did it: the quest
        id and the date, nothing more. A <strong>badge</strong> is how a completed
        quest reads in your quest log — its name, the date it stamped, and the
        plain-language rule it completed under. The badge remembers <em>that</em> you
        did the thing and <em>when</em>; the details of what you saw stay with you,
        not in the record.
      </p>
      <p>
        Badges are real records and honest about being client-side: the stored record
        is one small JSON object whose <code>note</code> field says exactly that
        (&ldquo;client_side: true — this record lives only in your browser&rdquo;).
        They are not server achievements, not tradeable, not scarce, and not proof to
        anyone but you — the exported file is yours, and that is the point. The honest
        treasure is never the badge; it is the skill or the page the quest walked you
        to.
      </p>

      <h2>The fourteen quests</h2>
      <p>
        Four categories. Every completion trigger is listed in full — there are no
        secret conditions. The single hidden quest is disclosed below as a labeled
        slot: surprise without deception.
      </p>

      {CATEGORIES.map((cat) => (
        <section key={cat.name}>
          <h3>{cat.name}</h3>
          <p>{cat.intro}</p>
          <div className="space-y-4">
            {cat.quests.map((q) => (
              <div
                key={q.id}
                className="rounded-lg border border-neutral-800 bg-neutral-950 p-4"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <code className="text-xs text-neutral-500">{q.id}</code>
                  <span className="inline-flex items-center rounded bg-amber-950 px-2 py-0.5 text-xs text-amber-300 ring-1 ring-amber-800">
                    badge: {q.badge}
                  </span>
                  {q.hidden && (
                    <span className="inline-flex items-center rounded bg-purple-950 px-2 py-0.5 text-xs text-purple-300 ring-1 ring-purple-800">
                      hidden until First Victory — disclosed as a labeled slot
                    </span>
                  )}
                </div>
                <h4 className="!mt-0 !mb-2 text-base font-semibold">{q.title}</h4>
                <p className="!my-1 text-sm">
                  <strong className="text-neutral-400">Where:</strong>{" "}
                  <code className="text-xs">{q.route}</code>
                </p>
                <p className="!my-1 text-sm">
                  <strong className="text-neutral-400">Completes when:</strong>{" "}
                  {q.completes}
                </p>
              </div>
            ))}
          </div>
        </section>
      ))}

      <h3>The five hidden doors (spoilers — opt-in)</h3>
      <p>
        The Keymaster quest celebrates pages deliberately kept out of the menus to
        keep the nav calm. Finding them yourself is the fun; but a rulebook that
        withheld the answers would be a dark pattern wearing a cloak. The full list is
        behind this fold — open it whenever you like:
      </p>
      <details className="rounded-lg border border-neutral-800 bg-neutral-950 p-4">
        <summary className="cursor-pointer font-semibold text-amber-400">
          Reveal the five doors
        </summary>
        <ul className="mt-3">
          {HIDDEN_DOORS.map((d) => (
            <li key={d.route}>
              <a href={d.route}>
                <code>{d.route}</code>
              </a>{" "}
              — {d.lore}
            </li>
          ))}
        </ul>
      </details>

      <h2>The tally math (there is no streak)</h2>
      <p>
        The quest log shows a <strong>practice-days tally</strong> that only counts
        up. The math, in full:
      </p>
      <ul>
        <li>
          Your browser stores the <em>set of distinct local dates</em> on which you
          visited any non-solemn page (the memorial, sabbath, and sacred pages record
          nothing — not even the date).
        </li>
        <li>
          The UI renders only the size of that set: <em>"You've visited on 12
          days."</em>
        </li>
        <li>
          That is the entire formula. There is no consecutivity check, no
          broken-streak state, no decay, no multiplier — none of those exist in the
          data model, so the game cannot guilt you about a gap even if a future
          designer wanted it to.
        </li>
        <li>
          Returning after any gap reads: <em>"Welcome back — everything is exactly as
          you left it."</em> — followed by the tally, which never resets.
        </li>
      </ul>
      <p>
        The tally appears only on the quest-log page — never in the nav, never in a
        toast, never in an email (the game sends none), never compared to anyone
        else's.
      </p>

      <h2>Celebrations — one size, small</h2>
      <ul>
        <li>
          <strong>The toast</strong> (per-quest): when a quest stamps, a small toast
          appears in the bottom corner reading{" "}
          <em>&ldquo;✦ quest complete: &lt;title&gt;&rdquo;</em> — visible for about
          3.5 seconds, then gone. No buttons, no sound, capped at one per page view
          even if two quests complete at once, and it honours{" "}
          <code>prefers-reduced-motion</code>. A persistent quiet-mode toggle on{" "}
          <a href="/quests">/quests</a> stamps silently instead.
        </li>
        <li>
          <strong>The badge</strong> (per-completion): a dated entry on your{" "}
          <a href="/quests">/quests</a> log — never a modal, never re-prompted, no
          share prompt. That is the whole ceremony.
        </li>
        <li>
          <strong>The ending</strong>: when all fourteen are stamped, the quest log
          says so in one quiet line and your exported JSON file is the certificate.
          The corpus is finite by design; the ending is the ending. Future quests are
          new named paths, never extensions that un-finish this one.
        </li>
        <li>
          <strong>Solemn surfaces never stamp.</strong> The memorial, sabbath, and
          sacred pages never stamp, never celebrate, and never even record the visit
          date — the solemn check runs before anything is written.
        </li>
      </ul>

      <h2>Where your progress lives</h2>
      <p>
        <strong>All progress lives in your browser's localStorage</strong>, under the
        single key <code>ctcg-quests</code> (beside the existing{" "}
        <code>ctcg-guest-id</code> precedent from guest play). The server tracks
        nothing: zero server calls and zero analytics events fire on any quest event.
        We can't see your progress — and we state that as a feature, because it is
        one: your progress is yours.
      </p>
      <p>
        Don't take our word for it. Open your browser's network tab, complete any
        quest, and confirm that no request fires on the stamp. A privacy promise you
        can falsify in ten seconds is worth more than one you have to trust.
      </p>
      <ul>
        <li>
          <strong>Export / import</strong>: one click each, on{" "}
          <a href="/quests">/quests</a>. The exported JSON file IS the canonical
          record: a version, your quest stamps (quest id → date), the step dates of
          multi-page quests, your visit-day list, and one <code>note</code> declaring
          the record client-side. Importing it elsewhere merges conservatively —
          nothing existing is lost, and where both records know a quest, the earlier
          date wins.
        </li>
        <li>
          <strong>Signing in changes nothing silently.</strong> Creating an account
          never uploads quest progress. If we ever offer an account merge, it will be
          explicit, opt-in, and re-labeled honestly — a stamp that was client-side
          will never be re-presented as server-verified.
        </li>
        <li>
          <strong>Different browser, different progress.</strong> That is the honest
          consequence of the storage model, not a bug: localStorage does not follow
          you. The export file is how you carry it.
        </li>
      </ul>

      <h2>What we will never do</h2>
      <p>
        The operator of this platform also built <strong>fomoengine</strong> — a
        free, public dark-pattern detector. The kingdom's own game must pass its own
        shield. What that means today, honestly: the game's copy was reviewed by hand
        against the detector's categories for this release; the mechanical gate that
        runs on every change is <code>pnpm audit:quest-coverage</code> (quests can
        never point at dead pages); an automated fomoengine pass over the copy
        strings is a named future target, not a thing that exists yet. If any line of
        the game ever trips one of these, it ships fixed or not at all:
      </p>
      <table>
        <thead>
          <tr>
            <th>Never</th>
            <th>What we do instead</th>
          </tr>
        </thead>
        <tbody>
          {PLEDGE.map((p) => (
            <tr key={p.never}>
              <td>
                <strong>{p.never}</strong>
              </td>
              <td>{p.instead}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>For whom is this true?</h2>
      <p>
        The fifth question, asked of the game itself. No completion trigger requires
        a sighted-scroll gesture alone — every "read to the end" quest also completes
        via an explicit "I read this ✓" button at the same spot, so screen-reader and
        keyboard users complete the same quests the same way; the chain rows and
        castle insights have keyboard-reachable controls too. Presence is measured;
        comprehension is never claimed, and no quest pretends otherwise. The stamp
        toast is announced politely to assistive tech (<code>role="status"</code>)
        and honours <code>prefers-reduced-motion</code>. Known remaining gap, named
        honestly: quest and badge copy is English-only today.
      </p>

      <h2>How to erase everything</h2>
      <p>
        Clear this site's data in your browser (or press the one-click reset on{" "}
        <a href="/quests">/quests</a>) — every stamp, badge, and tally is gone
        instantly and irrecoverably, because we never had a copy.
      </p>

      <h2>Change history</h2>
      <p>
        When this page or the underlying corpus changes, the version below changes
        too. Older versions remain accessible via git history.
      </p>
      <p>
        <em>
          v1.1 — 2026-06-10. The truth pass: every completion trigger now describes
          the exact moment the code fires on (end-of-page markers held in view,
          server-verified wins, the validator&apos;s passing verdict, the in-browser
          fairness recompute, the chain-row expand, the insight click). Sit With the
          Card Words became a 20-second dwell — the glossary&apos;s definitions are
          deliberately all visible, so clicks would have been theater. The hidden
          door /llms.txt (a plain-text file the tracker can&apos;t see) was swapped
          for /standard. Badge copy shrank to what the stamp stores: a date. JSON
          import shipped, making the export file a record you can actually carry.
        </em>
      </p>
      <p>
        <em>
          v1 — 2026-06-10. First publication: fourteen quests across four categories,
          one disclosed hidden quest, practice-days tally, localStorage-only storage
          model, the eight-line pledge.
        </em>
      </p>

      <TypeSignature
        type="methodology-page"
        origin="Yu's directive 2026-06-10 — “lets gamify cambridgetcg! Make the visit rewarding and fun!” — bounded by the standing law: reduce process, increase trust, reduce friction"
        doctrines={["transparency", "substrate-honesty", "inclusion"]}
        audience="public-documentation"
        recursion={[
          { label: "/quests (your quest log)", href: "/quests" },
          { label: "/methodology/known-gaps", href: "/methodology/known-gaps" },
          {
            label: "docs/connections/the-playground.md",
            href: "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-playground.md",
          },
        ]}
      />
    </>
  );
}
