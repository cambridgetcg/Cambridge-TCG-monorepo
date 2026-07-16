"use client";

// One card on a game board — shared by the practice board and the PvP room.
//
// The fix this component exists for: a card with no artwork used to render
// as a featureless placeholder, which made boards unreadable whenever image
// resolution failed. A card face now always carries its text: name, cost,
// power, category. Art is an enhancement, never a requirement.
//
// Card color (the strip) is card CONTENT like the art itself, so it renders
// from the printed color via inline style — the page chrome around it stays
// on semantic tokens per the quiet-gallery doctrine.

import Image from "next/image";
import type { GameCard } from "@/lib/game/types";

// Muted ink-adjacent tones per printed color — content-derived, low
// saturation so the art (when present) stays the loudest thing on the board.
const COLOR_TONES: Record<string, string> = {
  red: "#a04b43",
  green: "#4e7a5c",
  blue: "#4a6b93",
  purple: "#6a5a8f",
  black: "#4c4a55",
  yellow: "#a58a3d",
};

const CATEGORY_TAG: Record<string, string> = {
  event: "EVENT",
  stage: "STAGE",
  leader: "LEADER",
};

export function GameCardView({
  card,
  small = false,
  selected = false,
  dimmed = false,
  onClick,
}: {
  card: GameCard | null;
  small?: boolean;
  selected?: boolean;
  /** Muted presentation for cards that can't act right now. */
  dimmed?: boolean;
  onClick?: () => void;
}) {
  const sizeClasses = small ? "w-12 h-[66px]" : "w-16 h-[88px]";

  if (!card) {
    return (
      <div
        className={`${sizeClasses} rounded-lg border border-border-subtle bg-surface-subtle flex-shrink-0`}
      />
    );
  }

  const tone = card.color ? COLOR_TONES[card.color] ?? null : null;

  const face = card.faceDown ? (
    // Face-down: a quiet card back, visibly different from "no art".
    <div className="w-full h-full bg-surface-subtle flex items-center justify-center">
      <div className="w-6 h-9 rounded-sm border border-border-strong/60 flex items-center justify-center">
        <span className="text-ink-faint text-[9px] font-mono rotate-90 tracking-widest">
          CTCG
        </span>
      </div>
    </div>
  ) : card.imageUrl ? (
    <Image
      src={card.imageUrl}
      alt={card.name}
      fill
      sizes={small ? "48px" : "64px"}
      className="object-cover"
    />
  ) : (
    // Text face — the card is fully playable without artwork.
    <div className="w-full h-full bg-surface flex flex-col relative">
      {tone && (
        <div className="h-1 w-full flex-shrink-0" style={{ backgroundColor: tone }} />
      )}
      <div className="flex items-start justify-between px-0.5 pt-0.5">
        {card.cost != null ? (
          <span
            className="min-w-[14px] h-[14px] px-0.5 rounded-full text-page text-[9px] font-mono font-bold flex items-center justify-center"
            style={{ backgroundColor: tone ?? "var(--color-ink, #1c1917)" }}
          >
            {card.cost}
          </span>
        ) : (
          <span />
        )}
        {card.category && CATEGORY_TAG[card.category] && (
          <span className="text-[7px] font-mono text-ink-faint tracking-wider">
            {CATEGORY_TAG[card.category]}
          </span>
        )}
      </div>
      <span
        className={`flex-1 px-0.5 pt-0.5 text-ink font-medium leading-tight break-words overflow-hidden ${
          small ? "text-[8px]" : "text-[9px]"
        }`}
      >
        {card.name}
      </span>
      {card.power != null && (
        <span className="px-0.5 pb-0.5 text-[9px] font-mono text-ink-muted text-right">
          {card.power >= 1000 ? `${card.power / 1000}k` : card.power}
        </span>
      )}
    </div>
  );

  return (
    <div className="relative flex-shrink-0">
      <button
        type="button"
        onClick={onClick}
        disabled={!onClick}
        aria-label={card.faceDown ? "Face-down card" : card.name}
        className={`${sizeClasses} rounded-lg overflow-hidden border-2 transition-all flex-shrink-0 relative ${
          selected
            ? "border-accent ring-2 ring-accent/40 scale-105"
            : "border-border-subtle hover:border-border-strong"
        } ${card.isRested ? "rotate-90 origin-center" : ""} ${
          dimmed ? "opacity-60" : ""
        }`}
        style={card.isRested ? { margin: "0 12px" } : undefined}
      >
        {face}
      </button>
      {card.attachedDon > 0 && (
        <span className="absolute -top-1.5 -right-1.5 bg-ink text-page text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center shadow z-10">
          +{card.attachedDon}
        </span>
      )}
    </div>
  );
}
