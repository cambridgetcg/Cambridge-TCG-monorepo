import type { Metadata } from "next";
import Link from "next/link";
import { audienceMetadata } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Casual play — for hobbyists who love the game",
  description:
    "Friendly matches, adventure mode against AI, themed events. No rating pressure, no prize pressure. Just the game.",
  other: audienceMetadata("public-documentation", ["play", "casual", "hobbyist"]),
};

export default function CasualPlay() {
  return (
    <div className="prose prose-invert max-w-3xl mx-auto py-12 px-4">
      <h1>Casual play</h1>

      <p className="text-lg">
        For hobbyists who love the game. <strong>The playing is the
        point.</strong> Wins are nice; combos are satisfying; meeting fellow
        fans is the joy. No rating shown by default. No prize pressure.
      </p>

      <p className="border border-neutral-800 bg-neutral-900/40 rounded-md p-4 text-sm">
        <strong>Fun first.</strong> Nothing on these surfaces earns money,
        commission, or store credit. Ratings exist for those who want them
        (see <Link href="/play/compete" className="text-amber-400">/play/compete</Link>) — here, they&apos;re hidden by default. The play
        module&apos;s financial boundary is documented at{" "}
        <Link href="/methodology/play-module" className="text-amber-400">/methodology/play-module</Link>.
      </p>

      <hr />

      <h2>Three ways in</h2>

      <ul className="list-none p-0 space-y-6">
        <li className="border border-neutral-800 rounded-md p-5 bg-neutral-900/40">
          <h3 className="text-white font-bold mb-2 mt-0">Drop into a public room</h3>
          <p className="text-sm text-neutral-400 mb-3">
            The lobby has rooms open right now. Pair up, play a friendly match,
            no commitment.
          </p>
          <Link href="/play" className="text-amber-400 hover:text-amber-300 font-medium">
            Open the lobby →
          </Link>
        </li>

        <li className="border border-neutral-800 rounded-md p-5 bg-neutral-900/40">
          <h3 className="text-white font-bold mb-2 mt-0">Solo against an AI opponent</h3>
          <p className="text-sm text-neutral-400 mb-3">
            Adventure mode. Themed AI opponents scaling from very easy upward.
            Practice your deck, learn new mechanics, take your time.
          </p>
          <Link href="/play/adventure" className="text-amber-400 hover:text-amber-300 font-medium">
            Open adventure mode →
          </Link>
        </li>

        <li className="border border-neutral-800 rounded-md p-5 bg-neutral-900/40">
          <h3 className="text-white font-bold mb-2 mt-0">Private room with a friend</h3>
          <p className="text-sm text-neutral-400 mb-3">
            Create a private room from the lobby; share the code; whoever joins
            with the code joins your match. Async-friendly — your opponent can
            take their declared response window per turn.
          </p>
          <Link href="/play" className="text-amber-400 hover:text-amber-300 font-medium">
            Create a private room →
          </Link>
        </li>
      </ul>

      <hr />

      <h2>What casual play is for</h2>

      <p>
        Hobbyists come to Cambridge TCG because they love OPTCG. The Casual
        surface is shaped for that love:
      </p>

      <ul>
        <li>
          <strong>No rating pressure.</strong> Your Glicko-2 rating exists
          (the agent ladder is public) but the Casual surface doesn&apos;t
          show it. You can play a hundred matches here without seeing a
          number that judges you.
        </li>
        <li>
          <strong>No prize pressure.</strong> Casual play earns nothing
          monetary. The reward is the game.
        </li>
        <li>
          <strong>Variety encouraged.</strong> Themed weekly events (planned)
          will land here — format-of-the-week, theme-of-the-week, novel
          rulesets. The substrate isn&apos;t shipped yet; named openly.
        </li>
        <li>
          <strong>Async honored.</strong> Your declared{" "}
          <Link href="/methodology/response-windows">response window</Link>{" "}
          governs your turn-deadline. Play a single match across hours, days,
          weeks — the substrate respects your cadence.
        </li>
        <li>
          <strong>Spectators welcome.</strong> If you want to watch first,
          play later, the lobby is browsable without joining.
        </li>
      </ul>

      <hr />

      <h2>If you&apos;re new</h2>

      <p>
        Start with the <Link href="/guides/how-to-play">complete beginner&apos;s
        guide</Link> (15-minute read; pictures, examples, full rules), then
        open <Link href="/play/adventure">adventure mode</Link> against the
        easiest AI. When you&apos;re comfortable, come back to the lobby for a
        real opponent.
      </p>

      <p>
        If you learned OPTCG in Japanese, the{" "}
        <Link href="/api/v1/play/glossary">bilingual glossary</Link> maps every
        term across English and Japanese (kanji/kana + romaji + structural
        definition).
      </p>

      <hr />

      <h2>If you&apos;re returning</h2>

      <p>
        Welcome back. Pick up a deck from your{" "}
        <Link href="/account/portfolio">portfolio</Link>, refresh on the{" "}
        <Link href="/api/v1/play/glossary">glossary</Link> if needed, and
        find an open room. The Casual surface remembers nothing about your
        absence — the platform is glad you&apos;re here now.
      </p>

      <hr />

      <h2>Looking for something more structured?</h2>

      <p>
        If you want ranked play, tournaments, or eventually prize pools, see{" "}
        <Link href="/play/compete">/play/compete</Link>. If you&apos;re here
        for the cards more than the matches, the collector flows live at{" "}
        <Link href="/account/portfolio">/account/portfolio</Link>,{" "}
        <Link href="/market">/market</Link>, and the catalog endpoints
        (<Link href="/api/v1/universal/games">/api/v1/universal/games</Link>).
      </p>

      <p className="text-sm text-neutral-500 mt-8">
        <em>
          Source-of-truth: docs/connections/the-three-paths.md (S33).
          Methodology: <Link href="/methodology/play-module">/methodology/play-module</Link>.
          Welcome landing with all archetypes:{" "}
          <Link href="/play/welcome">/play/welcome</Link>.
        </em>
      </p>
    </div>
  );
}
