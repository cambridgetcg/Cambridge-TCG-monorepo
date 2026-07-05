// Compact trust-tier badge — used wherever counterparty reputation
// matters (trade listings, auction bidder cards, profile cards, etc).
//
// Two variants:
//   compact  — tiny pill, "Veteran 87" style, fits in a row of metadata
//   inline   — slightly larger, includes a tier dot + label, links to
//              the user's public profile when username is supplied
//
// Tier→colour mapping mirrors @/lib/escrow/types TRUST_TIERS so a
// design change in one place propagates here.

import Link from "next/link";

const TIER_FOR_SCORE: Array<{ min: number; name: string; tone: string; ring: string }> = [
  { min: 95, name: "Elite",   tone: "text-[#6a5a8f] bg-[#6a5a8f]/15 border-[#6a5a8f]/30", ring: "ring-[#6a5a8f]" },
  { min: 80, name: "Veteran", tone: "text-accent-strong bg-accent-wash border-accent/30", ring: "ring-accent" },
  { min: 50, name: "Trusted", tone: "text-ok bg-ok/10 border-ok/30",                      ring: "ring-ok" },
  { min: 20, name: "Starter", tone: "text-info bg-info/10 border-info/30",                ring: "ring-info" },
  { min: 0,  name: "New",     tone: "text-ink-muted bg-surface-subtle border-border-subtle", ring: "ring-ink-faint" },
];

function tierFor(score: number) {
  return TIER_FOR_SCORE.find(t => score >= t.min) ?? TIER_FOR_SCORE[TIER_FOR_SCORE.length - 1];
}

export interface TrustBadgeProps {
  score: number | null | undefined;
  /** When supplied, the badge becomes a link to /u/[username]. */
  username?: string | null;
  /** Compact = tiny inline pill; inline = pill with dot + label. */
  variant?: "compact" | "inline";
}

export function TrustBadge({ score, username, variant = "compact" }: TrustBadgeProps) {
  if (score == null) return null;
  const t = tierFor(score);

  const content = variant === "compact" ? (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border ${t.tone}`}>
      <span>{t.name}</span>
      <span className="font-mono opacity-80">{score}</span>
    </span>
  ) : (
    <span className={`inline-flex items-center gap-2 text-xs px-2 py-1 rounded border ${t.tone}`}>
      <span className={`w-2 h-2 rounded-full ring-2 ring-offset-1 ring-offset-page ${t.ring}`} />
      <span className="font-semibold">{t.name}</span>
      <span className="opacity-80">· {score}</span>
    </span>
  );

  if (username) {
    return (
      <Link href={`/u/${username}`} className="hover:opacity-80 transition-opacity">
        {content}
      </Link>
    );
  }
  return content;
}
