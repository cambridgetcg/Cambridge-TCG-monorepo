/**
 * UserChip — compact "who is this counterparty" pill.
 *
 * Avatar + display name + optional trust-tier dot, optionally linking to
 * the public profile. Used by trade lists, auction bidder cards, message
 * threads, social feed. Subsumes ad-hoc avatar+name renderings across
 * /account/messages, /account/external-rep, /u/[username].
 */

import * as React from "react";
import Link from "next/link";

interface UserChipProps {
  /** Public username — when supplied, the chip becomes a Link to /u/[username]. */
  username?: string | null;
  /** Display label. Falls back to username, then "anonymous". */
  displayName?: string | null;
  /** Avatar URL. Falls back to a neutral disc with the first letter. */
  avatarUrl?: string | null;
  /** Optional trust tier name — renders a small coloured dot before the name. */
  tier?: string | null;
  /** Visual size. */
  size?: "sm" | "md";
}

// Muted tier dots — tone semantics unchanged; plum/teal literals match
// Badge's TONE_CLS purple/sky.
const TIER_DOT: Record<string, string> = {
  Elite:   "bg-[#6a5a8f]",
  Veteran: "bg-warning",
  Trusted: "bg-ok",
  Starter: "bg-[#3e7d8f]",
  New:     "bg-ink-faint",
};

export function UserChip({ username, displayName, avatarUrl, tier, size = "sm" }: UserChipProps) {
  const name = displayName ?? username ?? "anonymous";
  const initial = name.charAt(0).toUpperCase() || "?";
  const avatarSize = size === "sm" ? "w-5 h-5 text-[10px]" : "w-7 h-7 text-xs";
  const textSize = size === "sm" ? "text-xs" : "text-sm";

  const inner = (
    <span className={`inline-flex items-center gap-1.5 ${textSize}`}>
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt=""
          className={`${avatarSize} rounded-full object-cover bg-surface-subtle`}
        />
      ) : (
        <span className={`${avatarSize} rounded-full bg-surface-subtle text-ink-muted inline-flex items-center justify-center font-semibold`}>
          {initial}
        </span>
      )}
      {tier && <span className={`w-1.5 h-1.5 rounded-full ${TIER_DOT[tier] ?? "bg-ink-faint"}`} aria-hidden />}
      <span className="text-ink truncate">{name}</span>
    </span>
  );

  if (username) {
    return (
      <Link href={`/u/${username}`} className="hover:opacity-80 transition-opacity">
        {inner}
      </Link>
    );
  }
  return inner;
}
