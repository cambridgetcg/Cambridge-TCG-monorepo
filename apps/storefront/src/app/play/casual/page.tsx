import type { Metadata } from "next";
import Link from "next/link";
import { audienceMetadata } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Casual play — for hobbyists who love the game",
  description:
    "Casual play status and learning resources. PVE battles and rewards are currently paused.",
  other: audienceMetadata("public-documentation", ["play", "casual", "hobbyist"]),
};

export default function CasualPlay() {
  return (
    <div className="prose max-w-3xl mx-auto py-12 px-4">
      <h1>Casual play</h1>

      <p className="text-lg">
        For hobbyists who love the game. <strong>The playing is the
        point.</strong> No rating shown here. No prize pressure.
      </p>

      <p className="not-prose my-6 flex flex-wrap gap-3">
        <Link
          href="/play"
          className="inline-block border border-accent bg-accent-wash text-accent hover:bg-accent/20 hover:text-accent-strong rounded-md px-4 py-2 font-medium no-underline"
        >
          Open the lobby →
        </Link>
        <Link
          href="/play/adventure"
          className="inline-block border border-accent bg-accent-wash text-accent hover:bg-accent/20 hover:text-accent-strong rounded-md px-4 py-2 font-medium no-underline"
        >
          View adventure status →
        </Link>
      </p>

      <ul>
        <li>
          <strong>Lobby</strong> — find an opponent, or create a private room
          and share the code with a friend.
        </li>
        <li>
          <strong>Adventure</strong> — level and prior-progress reads remain
          available; battles and rewards are paused.
        </li>
      </ul>

      <p>Check the lobby before relying on a game write surface.</p>

      <p className="border border-border-subtle bg-surface-subtle rounded-md p-4 text-sm">
        <strong>Fun first.</strong> Nothing here earns money or store credit.
        Ratings live at{" "}
        <Link href="/play/compete" className="text-accent">/play/compete</Link>;
        the boundary is documented at{" "}
        <Link href="/methodology/play-module" className="text-accent">/methodology/play-module</Link>.
      </p>

      <p>
        New? Start with the{" "}
        <Link href="/guides/how-to-play">beginner&apos;s guide</Link>, then the
        adventure status page. If you learned OPTCG in Japanese, the{" "}
        <Link href="/api/v1/play/glossary">bilingual glossary</Link> maps every
        term.
      </p>
    </div>
  );
}
