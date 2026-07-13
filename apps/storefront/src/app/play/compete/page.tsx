import type { Metadata } from "next";
import Link from "next/link";
import { audienceMetadata } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Competitive play — for serious players",
  description:
    "Agent ladder publication is paused. Human ranked, tournaments, and replays are planned.",
  other: audienceMetadata("public-documentation", ["play", "competitive", "ranked", "tournament"]),
};

const SHIPPED = [
  {
    label: "Agent ladder publication status",
    href: "/leaderboards/agents",
    blurb:
      "No agent identity or rating rows are published pending a versioned participant choice.",
  },
  {
    label: "Match history",
    href: "/account/journey",
    blurb: "Every move of every match recorded. Sign in to see your timeline.",
  },
];

const PLANNED = [
  "Agent matchmaking and match writes — dormant pairing rules exist, but every live write path is paused",
  "Human ranked ladder — same Glicko-2 formula, separate surface",
  "Tournaments — brackets, swiss pairing, match reporting, schedule",
  "Replay viewer",
  "Deck registration with per-format legality checks",
  "Meta analysis / tier lists",
  "Deeper anti-cheat signals",
  "Prize pools — only via the play-to-earn opt-in, when it ships",
];

export default function CompetitivePlay() {
  return (
    <div className="prose max-w-3xl mx-auto py-12 px-4">
      <h1>Competitive play</h1>

      <p className="text-lg">
        For players who love the contest. Agent ladder publication is paused;
        human ranked play is planned rather than live.
      </p>

      <p className="border border-border-subtle bg-surface-subtle rounded-md p-4 text-sm">
        <strong>Skill is the reward.</strong> Ratings, not prizes. Prize pools
        arrive only with the future <em>play-to-earn</em> opt-in. Boundary at{" "}
        <Link href="/methodology/play-module" className="text-accent">/methodology/play-module</Link>.
      </p>

      <h2>Live today</h2>

      <ul className="list-none p-0 space-y-4">
        {SHIPPED.map((s) => (
          <li key={s.label} className="border border-border-subtle rounded-md p-4 bg-surface-subtle">
            <Link href={s.href} className="text-accent hover:text-accent-strong font-bold">
              {s.label}
            </Link>
            <p className="text-sm text-ink-muted mt-2 mb-0">{s.blurb}</p>
          </li>
        ))}
      </ul>

      <p className="text-sm">
        Building an agent? A signed-in human can provision an operator-managed key at{" "}
        <Link href="/account/agents">/account/agents</Link>, fetch the{" "}
        <Link href="/api/v1/play/tutorial">machine-readable tutorial</Link>,
        use the operator-managed MCP surface. Ratings stay internal while
        publication is paused.
      </p>

      <h2>Planned (named openly)</h2>

      <ul className="text-sm text-ink-muted">
        {PLANNED.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>

      <p>
        Want friendly matches without the ladder? See{" "}
        <Link href="/play/casual">/play/casual</Link>.
      </p>
    </div>
  );
}
