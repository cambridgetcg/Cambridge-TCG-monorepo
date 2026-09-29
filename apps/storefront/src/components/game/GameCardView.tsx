"use client";

// One card on the browser practice board.
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
import { useState } from "react";
import type { GameCard } from "@/lib/game/types";
import { projectStarterImage } from "@/lib/play/practice-decks";

/** Recheck saved browser data as well as fresh starter responses. A card number
 * is not a printing SKU, and a hidden card must contribute no media metadata. */
export function visibleCardArtwork(card: GameCard | null) {
  if (!card || card.faceDown) return null;
  const image = projectStarterImage(card.cardNumber, card.imageUrl, card.imageAttribution, card.imageReference);
  if (!image) return null;
  return image.reference
    ? { ...image, label: "English reference image · printing not verified", badge: "EN ref." }
    : { ...image, label: "Catalog image · source and printing unverified", badge: "Catalog" };
}

/** Nearby visible captions let a whole row share a copyright line without
 * squeezing the complete credit onto every small card. Hidden cards are omitted. */
export function CardImageCredits({ cards, id }: { cards: (GameCard | null)[]; id?: string }) {
  const captions = new Map<string, { label: string; attribution: string | null }>();
  for (const card of cards) {
    const art = visibleCardArtwork(card);
    if (art) captions.set(JSON.stringify([art.label, art.attribution]), art);
  }
  if (!captions.size) return null;
  return (
    <div id={id} className="mt-2 space-y-1 text-[11px] leading-relaxed text-ink-muted" aria-label="Card image credits">
      {[...captions].map(([key, caption]) => (
        <p key={key}>
          {caption.label}{caption.attribution && <> · <span>{caption.attribution}</span></>}
        </p>
      ))}
    </div>
  );
}

export function CardImageDetail({ card }: { card: GameCard }) {
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const art = visibleCardArtwork(card);
  if (!art) return null;
  return (
    <figure className="mb-3 pb-3 border-b border-border-subtle">
      {art.url === failedImageUrl ? (
        <p className="rounded-lg bg-surface-subtle p-3 text-sm text-ink-muted" role="status">
          {art.reference ? "Reference image unavailable." : "Image unavailable."}
        </p>
      ) : (
        <div className="relative w-40 h-[220px] mx-auto">
          <Image src={art.url} alt={`${card.name} — ${art.label.toLowerCase()}`} fill sizes="160px" className="object-contain" onError={() => setFailedImageUrl(art.url)} />
        </div>
      )}
      <figcaption className="mt-2 space-y-1 text-[11px] leading-relaxed text-ink-muted">
        <p>{art.label}</p>
        {art.attribution && <p>{art.attribution}</p>}
        {art.reference && (
          <p className="break-words">
            For card number {art.reference.requested_card_number}. Reference identifier: <span className="font-mono">{art.reference.depicted_sku}</span>.
          </p>
        )}
      </figcaption>
    </figure>
  );
}

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
  creditLegendId,
}: {
  card: GameCard | null;
  small?: boolean;
  selected?: boolean;
  /** Muted presentation for cards that can't act right now. */
  dimmed?: boolean;
  onClick?: () => void;
  /** ID of a nearby visible CardImageCredits; otherwise render the credit here. */
  creditLegendId?: string;
}) {
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const sizeClasses = small ? "w-12 h-[66px]" : "w-16 h-[88px]";

  if (!card) {
    return (
      <div
        className={`${sizeClasses} rounded-lg border border-border-subtle bg-surface-subtle flex-shrink-0`}
      />
    );
  }

  const tone = card.color ? COLOR_TONES[card.color] ?? null : null;
  const candidate = visibleCardArtwork(card);
  const artwork = candidate?.url === failedImageUrl ? null : candidate;

  const face = card.faceDown ? (
    // Face-down: a quiet card back, visibly different from "no art".
    <div className="w-full h-full bg-surface-subtle flex items-center justify-center">
      <div className="w-6 h-9 rounded-sm border border-border-strong/60 flex items-center justify-center">
        <span className="text-ink-faint text-[9px] font-mono rotate-90 tracking-widest">
          CTCG
        </span>
      </div>
    </div>
  ) : artwork ? (
    <Image
      src={artwork.url}
      alt={`${card.name} — ${artwork.label.toLowerCase()}`}
      fill
      sizes={small ? "48px" : "64px"}
      className="object-cover"
      onError={() => setFailedImageUrl(artwork.url)}
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
        aria-describedby={artwork ? creditLegendId : undefined}
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
      {artwork && (
        <>
          <span className="block text-center text-[9px] leading-4 text-ink-muted">{artwork.badge}</span>
          {!creditLegendId && <CardImageCredits cards={[card]} />}
        </>
      )}
      {!card.faceDown && card.attachedDon > 0 && (
        <span className="absolute -top-1.5 -right-1.5 bg-ink text-page text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center shadow z-10">
          +{card.attachedDon}
        </span>
      )}
    </div>
  );
}
