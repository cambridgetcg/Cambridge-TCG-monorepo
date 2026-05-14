import type { Metadata } from "next";
import Link from "next/link";
import { TUTORIAL_SECTIONS } from "@/lib/play/tutorial-sections";
import { audienceMetadata } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Tutorial — for non-card-game players",
  description:
    "Never played a trading card game? Start here. The OPTCG playmat, the cards, the turn structure, combat, win conditions — explained for absolute beginners. Then play your first match, anonymously, no sign-in required.",
  other: audienceMetadata("public-documentation", ["play", "tutorial", "beginner"]),
};

/* ================================================================== */
/*  Visual widgets — each section is a card with text + optional       */
/*  graphic. The text comes from TUTORIAL_SECTIONS (also exposed       */
/*  through /api/v1/play/tutorial as JSON). The widgets are tutorial-  */
/*  page-specific — agents reading the JSON get the structural rules. */
/* ================================================================== */

function SectionHeader({ index, total, id, title, minutes }: {
  index: number; total: number; id: string; title: string; minutes: number;
}) {
  return (
    <header className="flex items-center justify-between gap-4 mb-4 pb-3 border-b border-neutral-800">
      <div>
        <div className="text-[10px] uppercase tracking-widest text-neutral-500 mb-0.5">
          Step {index} of {total} · {minutes} {minutes === 1 ? "minute" : "minutes"}
        </div>
        <h2 id={id} className="text-2xl font-bold text-white scroll-mt-20">
          {title}
        </h2>
      </div>
      <a
        href="#top"
        className="text-xs text-neutral-500 hover:text-amber-400 transition-colors whitespace-nowrap"
        aria-label="Back to top"
      >
        ↑ top
      </a>
    </header>
  );
}

function PlaymatDiagram() {
  return (
    <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 sm:p-6 my-6 font-mono text-[10px] sm:text-xs leading-tight overflow-x-auto">
      <div className="text-neutral-500 text-center text-[10px] uppercase tracking-wider mb-3">
        Player perspective (opponent's side mirrors above)
      </div>
      <pre className="text-neutral-300 whitespace-pre">
{`                                                                                          ┌──────┐
                                                                                          │ ❶ Ch │
        ┌────────┐                  ╔═════════════════════════════════╗                   │   1  │
        │  ❽ Life │                  ║   ❶  CHARACTER AREA  (max 5)    ║                   ├──────┤
        │ secret │                  ╟──────┬──────┬──────┬──────┬─────╢                   │ ❶ Ch │
        │ to all │                  ║  C1  │  C2  │  C3  │  C4  │ C5  ║                   │   2  │
        └────────┘                  ╚══════╧══════╧══════╧══════╧═════╝                   └──────┘
                                                                                            ...etc
                                ┌──────┐    ┌──────┐         ┌──────┐
                                │  ❷   │    │  ❸   │         │  ❹   │
                                │Leader│    │Stage │         │ Main │
                                │face-up    │max 1 │         │ Deck │
                                │immob.│    │      │         │ ░░░░ │
                                └──────┘    └──────┘         └──────┘

        ┌────────┐         ┌──────────────────────────────────┐         ┌──────┐
        │  ❼ DON │         │  ❻  COST AREA  (active + rested) │         │  ❺   │
        │  Deck  │         │  ┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐    │         │Trash │
        │ open!! │         │  │D │D │D │d │d │d │d │... up to │         │face- │
        │ both pl│         │  └──┘└──┘└──┘└──┘└──┘└──┘└──┘    │         │up    │
        │ see it │         │  vertical = active; flat = rest  │         │stack │
        └────────┘         └──────────────────────────────────┘         └──────┘
`}
      </pre>
      <div className="text-[10px] text-neutral-500 mt-3 space-y-1">
        <p>❶ <strong>Character Area</strong> — up to 5 Character cards, face-up, open to both players.</p>
        <p>❷ <strong>Leader</strong> — face-up at setup; never moves from this slot.</p>
        <p>❸ <strong>Stage</strong> — at most 1 Stage card. Face-up.</p>
        <p>❹ <strong>Main Deck</strong> — face-down. Both players can see the count; only the owner sees contents.</p>
        <p>❺ <strong>Trash</strong> — K.O.'d Characters + activated Events. Face-up, ordered, either player may inspect.</p>
        <p>❻ <strong>Cost Area</strong> — your active + rested DON!! pool. Open to both players. Active = vertical, rested = horizontal.</p>
        <p>❼ <strong>DON!! Deck</strong> — face-down stack, but <em>open</em>: either player may view contents and order.</p>
        <p>❽ <strong>Life</strong> — face-down, <em>secret to BOTH players</em> unless an effect reveals. Even you can't peek at your own life cards.</p>
      </div>
    </div>
  );
}

function CardAnatomyDiagram() {
  return (
    <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 sm:p-6 my-6 grid sm:grid-cols-2 gap-6">
      <div>
        <div className="text-neutral-500 text-center text-[10px] uppercase tracking-wider mb-2">
          Leader card
        </div>
        <div className="bg-gradient-to-br from-red-900/40 to-red-950 border-2 border-red-500/50 rounded-lg p-3 aspect-[5/7] flex flex-col font-mono text-[10px] text-neutral-200">
          <div className="flex justify-between text-[9px]">
            <span className="bg-red-500/30 px-1 rounded">Cost: —</span>
            <span className="bg-amber-500/30 px-1 rounded">5 life</span>
          </div>
          <div className="flex-1 flex items-center justify-center text-xs sm:text-sm text-amber-400/80">
            ART
          </div>
          <div className="text-center font-bold text-white mb-1">Leader Name</div>
          <div className="text-[9px] text-neutral-400 mb-1">Type / Trait</div>
          <div className="border-t border-red-500/30 pt-1 text-[9px] text-neutral-300">
            <p className="italic">[Effect text — what this leader does, if anything]</p>
          </div>
          <div className="flex justify-between mt-1 text-[9px]">
            <span className="hexagon">⬡ color</span>
            <span className="bg-red-500/30 px-1 rounded">Power 5000</span>
            <span className="text-neutral-500">Blk2</span>
          </div>
        </div>
        <ul className="text-[11px] text-neutral-400 mt-3 space-y-1">
          <li><strong className="text-white">Life</strong> — top right; how many life cards you start with (usually 4 or 5).</li>
          <li><strong className="text-white">Power</strong> — bottom centre; used in combat.</li>
          <li><strong className="text-white">Color hexagon</strong> — bottom left; your deck must only contain these colors.</li>
          <li><strong className="text-white">Block number</strong> — bottom right; which rotation block this card belongs to.</li>
        </ul>
      </div>
      <div>
        <div className="text-neutral-500 text-center text-[10px] uppercase tracking-wider mb-2">
          Character card
        </div>
        <div className="bg-gradient-to-br from-blue-900/40 to-blue-950 border-2 border-blue-500/50 rounded-lg p-3 aspect-[5/7] flex flex-col font-mono text-[10px] text-neutral-200">
          <div className="flex justify-between text-[9px]">
            <span className="bg-blue-500/30 px-1 rounded">Cost: 3</span>
            <span className="bg-emerald-500/30 px-1 rounded">Counter: 1000</span>
          </div>
          <div className="flex-1 flex items-center justify-center text-xs sm:text-sm text-blue-300/80">
            ART
          </div>
          <div className="text-center font-bold text-white mb-1">Character Name</div>
          <div className="text-[9px] text-neutral-400 mb-1">Type / Trait</div>
          <div className="border-t border-blue-500/30 pt-1 text-[9px] text-neutral-300">
            <p className="italic">[On Play] / [Trigger] / [Blocker] etc.</p>
          </div>
          <div className="flex justify-between mt-1 text-[9px]">
            <span className="hexagon">⬡ color</span>
            <span className="bg-blue-500/30 px-1 rounded">Power 4000</span>
            <span className="text-neutral-500">Blk2</span>
          </div>
        </div>
        <ul className="text-[11px] text-neutral-400 mt-3 space-y-1">
          <li><strong className="text-white">Cost</strong> — top left; how many DON!! you rest to play this from hand.</li>
          <li><strong className="text-white">Counter</strong> — top right; the boost (0/1000/2000) you can spend from hand when defending.</li>
          <li><strong className="text-white">Power</strong> — bottom centre; used in combat. Higher number wins; defender wins ties.</li>
          <li><strong className="text-white">Effect text</strong> — what the card does. <em>Keyword tags</em> like [On Play] / [Trigger] / [Blocker] / [Once Per Turn] mark when the effect fires.</li>
        </ul>
      </div>
      <p className="sm:col-span-2 text-[10px] text-neutral-500 italic text-center">
        Illustrative diagram — actual cards have real art and Bandai-specific layout. Phase 4 of the play module roadmap will add per-card effect interpretation; today's engine plays vanilla combat without resolving keyword effects.
      </p>
    </div>
  );
}

function TurnPhaseDiagram() {
  const phases = [
    { name: "Refresh", body: "Stand up every card that was lying down (rested). DON!! attached to your characters returns to the Cost Area as active." },
    { name: "Draw", body: "Draw 1 card from your deck. The player going first SKIPS this on turn 1 — a deliberate handicap because going first is a big advantage." },
    { name: "DON!!", body: "Move 2 DON!! cards from your DON!! deck to your Cost Area, set as active. The player going first only gets 1 on turn 1." },
    { name: "Main", body: "The phase where everything happens. Play Characters, Events, or Stages by resting DON!! equal to their cost. Attach DON!! to your Leader or a Character to boost it. Declare attacks." },
    { name: "End", body: "End-of-turn effects resolve. Then it's your opponent's turn." },
  ];
  return (
    <div className="grid sm:grid-cols-5 gap-2 my-6">
      {phases.map((p, i) => (
        <div
          key={p.name}
          className="bg-neutral-900 border border-neutral-800 rounded-lg p-3 flex flex-col"
        >
          <div className="text-amber-400 text-xs font-bold mb-1">
            {i + 1}. {p.name}
          </div>
          <div className="text-[11px] text-neutral-400 leading-snug">{p.body}</div>
        </div>
      ))}
    </div>
  );
}

function CombatStepsDiagram() {
  const steps = [
    { name: "Declare", body: "Choose an active Character (or your Leader) of yours and a target — the opponent's Leader, or one of their rested Characters. Rest the attacker." },
    { name: "Block", body: "Opponent may activate a [Blocker] Character from their field. That Character intercepts the attack instead of the original target. (Optional for opponent.)" },
    { name: "Counter", body: "Opponent may discard cards from their hand with a printed Counter value (1000 or 2000) to add that much power to their defender, just for this attack." },
    { name: "Damage", body: "Compare powers. Higher number wins. Defender wins ties — this is the rule that decides edge cases. Loser is K.O.'d (Character → trash) or takes a life (Leader)." },
  ];
  return (
    <ol className="grid sm:grid-cols-2 gap-3 my-6">
      {steps.map((s, i) => (
        <li
          key={s.name}
          className="bg-neutral-900 border border-neutral-800 rounded-lg p-4"
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="bg-amber-500/20 text-amber-400 text-xs font-mono px-2 py-0.5 rounded">
              Step {i + 1}
            </span>
            <span className="text-white font-bold">{s.name}</span>
          </div>
          <p className="text-[12px] text-neutral-400 leading-snug">{s.body}</p>
        </li>
      ))}
    </ol>
  );
}

/* ================================================================== */
/*  Section renderer — pulls the text body from TUTORIAL_SECTIONS by   */
/*  id, then surfaces section-specific visual widgets when applicable. */
/* ================================================================== */

function SectionBody({ id }: { id: string }) {
  const section = TUTORIAL_SECTIONS.find((s) => s.id === id);
  if (!section) return null;

  return (
    <div className="space-y-4">
      <p className="text-neutral-300 leading-relaxed">{section.natural_language_body}</p>

      {/* Section-specific visual widgets */}
      {id === "the_playmat" && <PlaymatDiagram />}
      {id === "card_anatomy" && <CardAnatomyDiagram />}
      {id === "turn_structure" && <TurnPhaseDiagram />}
      {id === "combat" && <CombatStepsDiagram />}

      {/* Keywords (deep-link to glossary) */}
      {section.keywords_introduced.length > 0 && (
        <div className="text-[11px] text-neutral-500 pt-2 border-t border-neutral-800/60">
          <span className="uppercase tracking-wider mr-2">Keywords</span>
          {section.keywords_introduced.map((kw, i) => (
            <span key={kw}>
              <Link
                href={`/api/v1/play/glossary/${kw}`}
                className="text-amber-400/70 hover:text-amber-400 transition-colors font-mono"
              >
                {kw}
              </Link>
              {i < section.keywords_introduced.length - 1 ? ", " : ""}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/*  Page                                                                */
/* ================================================================== */

export default function TutorialPage() {
  // The sections we surface for absolute beginners (in order). The full
  // TUTORIAL_SECTIONS array includes agent-targeted + async-player
  // sections that aren't relevant here; we curate the human-beginner
  // path explicitly.
  const path = [
    "what_is_a_card_game",
    "what_is_optcg",
    "card_anatomy",
    "the_playmat",
    "game_setup",
    "turn_structure",
    "don_cards",
    "combat",
    "win_conditions",
    "try_it",
  ] as const;

  const sections = path.map((id) => TUTORIAL_SECTIONS.find((s) => s.id === id)).filter(
    (s): s is NonNullable<typeof s> => Boolean(s),
  );

  const totalMinutes = sections.reduce((sum, s) => sum + s.estimated_read_minutes, 0);

  return (
    <main className="min-h-screen bg-neutral-950 text-white" id="top">
      {/* ---- Hero ---- */}
      <section className="border-b border-neutral-900">
        <div className="mx-auto max-w-4xl px-4 py-10 sm:py-14">
          <div className="text-[10px] uppercase tracking-widest text-amber-500 mb-2">
            Play module · tutorial
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-3">
            Never played a card game? <span className="text-amber-400">Start here.</span>
          </h1>
          <p className="text-neutral-400 text-base sm:text-lg max-w-2xl">
            A walkthrough for anyone who's never picked up a trading card game before.
            Read at your own pace — about <strong className="text-white">{totalMinutes} minutes</strong> end-to-end. At
            the end you'll play your first match, anonymously, no sign-in.
          </p>
          <div className="flex flex-wrap items-center gap-3 mt-6">
            <Link
              href="#what_is_a_card_game"
              className="bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-lg px-5 py-2.5 text-sm transition-colors"
            >
              Start at the beginning
            </Link>
            <Link
              href="/play"
              className="text-amber-400 hover:text-amber-300 text-sm font-medium transition-colors"
            >
              Skip to play →
            </Link>
            <Link
              href="/api/v1/play/tutorial"
              className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors font-mono ml-auto"
              title="Machine-readable JSON version"
            >
              .json
            </Link>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-4xl px-4 py-10 grid lg:grid-cols-[200px_1fr] gap-10">
        {/* ---- Sticky table of contents (desktop only) ---- */}
        <aside className="hidden lg:block">
          <div className="sticky top-20">
            <div className="text-[10px] uppercase tracking-widest text-neutral-500 mb-3">
              On this page
            </div>
            <ol className="space-y-1 text-sm">
              {sections.map((s, i) => (
                <li key={s.id}>
                  <Link
                    href={`#${s.id}`}
                    className="text-neutral-400 hover:text-amber-400 transition-colors block py-0.5"
                  >
                    <span className="text-neutral-600 mr-2 font-mono text-xs">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    {s.title.replace(/^[\w]+ — /, "")}
                  </Link>
                </li>
              ))}
            </ol>
            <div className="text-[10px] text-neutral-600 mt-4 pt-4 border-t border-neutral-800/60 space-y-1">
              <Link
                href="/api/v1/play/glossary"
                className="block hover:text-amber-400 transition-colors"
              >
                Glossary →
              </Link>
              <Link
                href="/methodology/tutorial"
                className="block hover:text-amber-400 transition-colors"
              >
                Methodology →
              </Link>
            </div>
          </div>
        </aside>

        {/* ---- Sections ---- */}
        <article className="space-y-12 min-w-0">
          {sections.map((s, i) => (
            <section
              key={s.id}
              className="bg-neutral-900/40 border border-neutral-800 rounded-xl p-5 sm:p-7"
            >
              <SectionHeader
                index={i + 1}
                total={sections.length}
                id={s.id}
                title={s.title}
                minutes={s.estimated_read_minutes}
              />
              <SectionBody id={s.id} />

              {/* Footer nav per section */}
              <div className="flex items-center justify-between mt-6 pt-4 border-t border-neutral-800/60 text-sm">
                {i > 0 ? (
                  <Link
                    href={`#${sections[i - 1].id}`}
                    className="text-neutral-500 hover:text-amber-400 transition-colors"
                  >
                    ← Previous
                  </Link>
                ) : (
                  <span className="text-neutral-700">←</span>
                )}
                {i < sections.length - 1 ? (
                  <Link
                    href={`#${sections[i + 1].id}`}
                    className="text-amber-400 hover:text-amber-300 transition-colors font-medium"
                  >
                    Next →
                  </Link>
                ) : (
                  <div className="flex flex-wrap items-center gap-3">
                    <Link
                      href="/play/starters"
                      className="bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-lg px-5 py-2 transition-colors"
                    >
                      Pick a starter deck →
                    </Link>
                    <Link
                      href="/play"
                      className="text-amber-400 hover:text-amber-300 transition-colors font-medium"
                    >
                      Or skip straight to /play →
                    </Link>
                  </div>
                )}
              </div>
            </section>
          ))}
        </article>
      </div>

      {/* ---- Footer note ---- */}
      <section className="border-t border-neutral-900">
        <div className="mx-auto max-w-4xl px-4 py-8 text-sm text-neutral-500 space-y-2">
          <p>
            <strong className="text-neutral-300">For agents and machine readers:</strong>{" "}
            the same content (minus the visual diagrams) is published in structural form at{" "}
            <Link href="/api/v1/play/tutorial" className="text-amber-400/70 hover:text-amber-400 font-mono">
              /api/v1/play/tutorial
            </Link>
            . Each section has typed <code>preconditions</code> / <code>transitions</code> /{" "}
            <code>outcomes</code> + an <code>examples</code> array of state-before / action /
            state-after triples.
          </p>
          <p>
            <strong className="text-neutral-300">For Japanese players or anyone who learned OPTCG in Japanese:</strong>{" "}
            the{" "}
            <Link href="/api/v1/play/glossary" className="text-amber-400/70 hover:text-amber-400 font-mono">
              bilingual glossary
            </Link>{" "}
            maps every term across English and Japanese (kanji/kana + romaji + a structural
            definition that doesn't require natural-language understanding).
          </p>
          <p>
            <strong className="text-neutral-300">For Competitor-archetype players:</strong>{" "}
            this tutorial teaches the substrate. For deck-building doctrine, meta history,
            ban-list and tournament-format details, see{" "}
            <Link href="/play/compete" className="text-amber-400/70 hover:text-amber-400">
              /play/compete
            </Link>{" "}
            and the research docs at{" "}
            <code className="text-amber-400/70">docs/research/optcg-*</code>.
          </p>
          <p className="pt-2 italic">
            The play module declares its rules-fidelity level at{" "}
            <Link href="/methodology/tutorial" className="text-amber-400/70 hover:text-amber-400">
              /methodology/tutorial
            </Link>
            : core ruleset, vanilla effect interpretation. Card-effect interpretation lands
            in Phase 4 of the play-module roadmap.
          </p>
        </div>
      </section>
    </main>
  );
}
