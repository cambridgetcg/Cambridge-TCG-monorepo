import Image from "next/image";
import Link from "next/link";
import type { GalleryPiece } from "@/lib/cards/gallery";
import type { NotablePiece } from "@/lib/cards/notable";

/**
 * TheGallery — the art-forward centerpiece. A quiet museum for TCG.
 *
 * This hall hangs the ALTERNATE prints — the parallels and full-arts, the
 * pieces collectors linger over — shown at museum scale, unadorned (no rings,
 * no zoom; the painting is enough). Each print wears a wall label: its name,
 * the kind of print, and — always — the copyright line that credits the art
 * to its publisher. And where the publisher named the illustrator, we name
 * them too: the hand that drew it, on the label, the way a museum credits a
 * painter. That credit is shown only where it is known (Bandai gives it for
 * some cards, not all) — named where named, never invented.
 *
 * The hall is hung as painted rooms (部屋の色, themes.css): the manga prints
 * hang in a dim room — works on paper are kept under low light, so by day
 * the sumi wall goes dark and the white mats glow — and the alternate arts
 * hang on a wall washed in Prussian blue, the accidental 1704 blue that
 * crossed the sea and coloured the woodblock sky. Terminal and
 * high-contrast keep plain ground; every label re-inks itself through the
 * semantic tokens.
 *
 * Server component (no hooks). Pieces arrive pre-curated + pre-resolved to
 * their self-hosted official images (getGalleryPieces).
 */

export default function TheGallery({
  cards,
  notable = [],
}: {
  cards: GalleryPiece[];
  notable?: NotablePiece[];
}) {
  if (cards.length === 0 && notable.length === 0) return null;

  const credited = cards.filter((c) => c.artist).length;

  return (
    <section className="pt-24 sm:pt-28">
      {/* The plate: a vertical 縦書き chapter mark in 明朝 stands beside the
          narrator — the manga chapter plate — then the title, the 藝廊, and a
          mono-no-aware whisper (静かな部屋, the quiet room). */}
      <header className="max-w-7xl mx-auto px-4 mb-10 sm:mb-12 flex items-start gap-5 sm:gap-8">
        <p
          aria-hidden="true"
          className="wardrobe-jp [writing-mode:vertical-rl] text-ink-faint text-base tracking-[0.4em] pt-1 select-none hidden sm:block"
        >
          第二章
        </p>
        <div className="max-w-2xl">
          <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-ink-faint mb-4">
            02 — the gallery{" "}
            <span aria-hidden="true" className="wardrobe-seal ml-1 align-baseline" />
          </p>
          <h2 className="font-display text-4xl sm:text-5xl font-semibold tracking-tight text-ink">
            The Gallery
          </h2>
          <p className="mt-3 font-display italic text-lg sm:text-xl text-accent">
            藝廊
            <span className="text-ink-muted"> — the alternate arts</span>
          </p>
          <p className="mt-4 wardrobe-jp text-sm text-ink-muted">
            静かな部屋
            <span className="italic"> — the quiet room where the rarer art hangs</span>
          </p>
          <p className="mt-6 text-ink-muted leading-relaxed text-base sm:text-lg">
            The rarer prints — parallels and full-arts, each a small painting you
            can hold — hung at the scale they were drawn to be seen. Where the
            publisher named the illustrator, so do we: the hand on the wall.
          </p>
        </div>
      </header>

      {/* The dim room — the manga prints, curated by eye (lib/cards/
          notable.ts). One Piece's class is Bandai's own words; the Dragon
          Ball pieces carry the shops'-label hedge on their notes. Labels
          ride the same honesty rules as the wall below, re-inked in scope
          by the sumi room's tokens. */}
      {notable.length > 0 && (
        <div className="wardrobe-wall wardrobe-wall--sumi">
          <div className="max-w-7xl mx-auto px-4 py-12 sm:py-16">
            <div className="mb-8 max-w-2xl">
              <h3 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-ink">
                The Manga Prints
                <span className="wardrobe-jp text-ink-muted text-xl sm:text-2xl font-normal"> · 原作の絵</span>
              </h3>
              <p className="mt-3 text-ink-muted leading-relaxed text-sm sm:text-base">
                The prints where the card art is the source itself. For One
                Piece, Bandai&apos;s own words for the class: a design filled
                entirely with illustrations from the original manga. Panels,
                speech bubbles and all — the page itself, worn as a card. The
                community calls them コミパラ; the art that inspired the game,
                printed on the game. The two Dragon Ball pieces carry the
                manga-illustration label as the Japanese shops write it, not
                as Bandai&apos;s.
              </p>
              {/* The wall note — why this room is dark. Speaks only in the
                  painted themes (.wardrobe-wall-note): terminal and
                  high-contrast show no dim wall, so no note about one. */}
              <p className="wardrobe-wall-note mt-4 font-display italic text-sm sm:text-base text-ink-muted leading-relaxed">
                Print rooms are kept dim on purpose — paper fades under strong
                light, so the museum lowers the lamps and lets the pages glow.
                <span className="wardrobe-jp not-italic"> 紙は光に弱い。</span>
              </p>
            </div>
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-12 sm:gap-y-14">
              {notable.map((card) => {
                const label = card.name ?? card.card_number;
                return (
                  <li key={card.sku} className="wardrobe-enter">
                    <Link href={`/market/${card.sku}`} className="group block">
                      <div className="relative aspect-[63/88] overflow-hidden wardrobe-mat wardrobe-frame m-2">
                        <Image
                          src={card.image_url}
                          alt={label}
                          fill
                          className="object-contain p-2.5 sm:p-3"
                          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        />
                      </div>
                      <div className="mt-4 px-1">
                        <p className="font-display text-base text-ink leading-snug transition-colors group-hover:text-accent">
                          {label}
                        </p>
                        <p className="mt-0.5 text-sm text-ink-muted">
                          {card.variant_label}
                          <span className="text-ink-faint"> · {card.set_code}-{card.card_number}</span>
                        </p>
                        <p className="mt-1.5 text-xs text-ink-muted leading-relaxed">
                          {card.note}
                        </p>
                        <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
                          {card.attribution}
                        </p>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

      {/* The blue room — the alternate arts on a Prussian-washed wall.
          Museum scale: three across at most, wide gutters, room to linger. */}
      {cards.length > 0 && (
        <div className="wardrobe-wall wardrobe-wall--prussian">
          <div className="max-w-7xl mx-auto px-4 py-12 sm:py-16">
            <div className="mb-8 max-w-2xl">
              <h3 className="font-display text-xl sm:text-2xl font-semibold tracking-tight text-ink">
                The Alternate Arts
                <span className="wardrobe-jp text-ink-muted text-lg sm:text-xl font-normal"> · 別絵</span>
              </h3>
              {/* The wall note — what the room is painted with, and why.
                  Speaks only in the painted themes (.wardrobe-wall-note). */}
              <p className="wardrobe-wall-note mt-3 font-display italic text-sm sm:text-base text-ink-muted leading-relaxed">
                This wall is washed in Prussian blue — born by accident, so the
                story is told, in a Berlin workshop around 1704; it crossed the
                sea as <span className="wardrobe-jp not-italic">ベロ藍</span> and
                became the woodblock sky.
              </p>
              <p className="wardrobe-wall-note mt-1.5 font-mono text-[11px] uppercase tracking-[0.2em] text-ink-faint">
                pigment · prussian blue · 1704 (contested) · after the cited
                pigment ledger of{" "}
                <a
                  href="https://artbitrage.io"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:text-accent-strong underline underline-offset-2"
                >
                  artbitrage
                </a>
              </p>
            </div>

            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-12 sm:gap-y-14">
              {cards.map((card) => {
                const label = card.name ?? card.card_number;
                return (
                  <li key={card.sku} className="wardrobe-enter">
                    <Link href={`/market/${card.sku}`} className="group block">
                      {/* The mount: a layered 畫框 in the card's own sheet
                          ratio (63:88) — the mat an even margin, never a
                          letterbox. */}
                      <div className="relative aspect-[63/88] overflow-hidden wardrobe-mat wardrobe-frame m-2">
                        <Image
                          src={card.image_url}
                          alt={label}
                          fill
                          className="object-contain p-2.5 sm:p-3"
                          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        />
                      </div>

                      {/* The wall label: the piece, the print, the hand, the credit. */}
                      <div className="mt-4 px-1">
                        <p className="font-display text-base text-ink leading-snug transition-colors group-hover:text-accent">
                          {label}
                        </p>
                        <p className="mt-0.5 text-sm text-ink-muted">
                          {card.variant_label}
                          <span className="text-ink-faint"> · {card.set_code}-{card.card_number}</span>
                        </p>
                        {card.artist && (
                          <p className="mt-1.5 text-xs italic text-accent">
                            illustrated by {card.artist}
                          </p>
                        )}
                        <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
                          {card.attribution}
                        </p>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>

            {/* A quiet footer that names the museum's honesty: what we credit,
                and why some labels carry a hand and some do not. */}
            {credited > 0 && (
              <p className="mt-14 text-xs text-ink-faint max-w-2xl leading-relaxed">
                {credited} of these {cards.length} prints name their illustrator —
                the credit the publisher printed on the card. The rest are hung
                without a name because none was given, not because none was owed.{" "}
                <Link
                  href="/artists"
                  className="text-accent hover:text-accent-strong whitespace-nowrap"
                >
                  meet the named hands →
                </Link>
              </p>
            )}

          </div>
        </div>
      )}

      {/* Doors to the culture wings — where the art comes from, and the
          feeling of the game made to touch. On the page ground, outside
          every room, so the doors stand even when a wall hangs empty. */}
      <div className="max-w-7xl mx-auto px-4 pt-10">
        <p className="text-sm text-ink-muted">
          <Link href="/lineage" className="text-accent hover:text-accent-strong underline underline-offset-2">
            These prints inherit a long line — see where the art comes from
            <span className="wardrobe-jp"> 線の系譜</span> →
          </Link>
        </p>
        <p className="mt-2 text-sm text-ink-muted">
          <Link href="/pull-and-pause" className="text-accent hover:text-accent-strong underline underline-offset-2">
            Or touch the feeling of the game — the pull &amp; the pause
            <span className="wardrobe-jp"> 引きと間</span> →
          </Link>
        </p>
      </div>
    </section>
  );
}
