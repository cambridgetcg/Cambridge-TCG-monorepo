import Image from "next/image";
import CloseLook from "./CloseLook";
import {
  GALLERY_SHOWCASE,
  SHOWCASE_ATTRIBUTION,
  SHOWCASE_SOURCE,
} from "@/lib/cards/showcase";

/**
 * TheShowcase — the guest wall.
 *
 * A few pieces hung at full resolution: not from our shelves and not the
 * publisher's SAMPLE images, but clean high-res art drawn from the open net,
 * self-hosted on our own bucket, chosen simply because it's beautiful. Every
 * piece names its illustrator AND the exact source we drew it from — the
 * honesty rule, and Asha's brief ("state the source too"). Shown as credited
 * art, not as goods for sale.
 *
 * The pieces hang in a painted room (部屋の色): the wall behind the grid is
 * washed in ultramarine at whisper volume — ground lapis, the pigment once
 * weighed against gold and kept for what mattered most. The wash is a
 * wardrobe material (.wardrobe-wall--lapis, themes.css); terminal and
 * high-contrast keep plain ground.
 *
 * Renders nothing until the fetch pipeline has hung something. Server
 * component (no hooks).
 */
export default function TheShowcase() {
  if (GALLERY_SHOWCASE.length === 0) return null;

  return (
    <section className="pt-24 sm:pt-28">
      {/* A vertical 縦書き mark in 明朝 beside the plate. */}
      <header className="max-w-7xl mx-auto px-4 mb-10 sm:mb-12 flex items-start gap-5 sm:gap-8">
        <p
          aria-hidden="true"
          className="wardrobe-jp [writing-mode:vertical-rl] text-ink-faint text-base tracking-[0.4em] pt-1 select-none hidden sm:block"
        >
          名品
        </p>
        <div className="max-w-2xl">
          <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-ink-faint mb-4">
            01 — shown in full{" "}
            <span aria-hidden="true" className="wardrobe-seal ml-1 align-baseline" />
          </p>
          <h2 className="font-display text-4xl sm:text-5xl font-semibold tracking-tight text-ink">
            The Guest Wall
          </h2>
          <p className="mt-3 font-display italic text-lg sm:text-xl text-accent">
            名品
            <span className="text-ink-muted"> — shown clean and whole</span>
          </p>
          <p className="mt-6 text-ink-muted leading-relaxed text-base sm:text-lg">
            A handful of pieces hung at full resolution — not from our shelves,
            but from the wider hobby, chosen simply because they are beautiful.
            Each names its illustrator and the source we drew it from, in the
            open.
          </p>
        </div>
      </header>

      {/* The painted room: the guest wall wears ultramarine. */}
      <div className="wardrobe-wall wardrobe-wall--lapis">
        <div className="max-w-7xl mx-auto px-4 py-12 sm:py-16">
          {/* The wall note — what the room is painted with, and why. The
              ledger grades the date and the gold story source-declared, so
              both wear their hedge in the open. Speaks only in the painted
              themes (.wardrobe-wall-note). 群青 today names ultramarine
              (JIS); in older nihonga usage 岩群青 was ground azurite — the
              adjacent "ground lapis" keeps the meaning exact, so leave the
              tag as is. */}
          <div className="mb-10 sm:mb-12 max-w-2xl">
            <p className="wardrobe-wall-note font-display italic text-sm sm:text-base text-ink-muted leading-relaxed">
              This wall is washed in ultramarine — ground lapis carried from
              beyond the sea, priced above gold, the old contracts say, and
              kept for what mattered most.
              <span className="wardrobe-jp not-italic"> 群青</span>
            </p>
            <p className="wardrobe-wall-note mt-1.5 font-mono text-[11px] uppercase tracking-[0.2em] text-ink-faint">
              pigment · ultramarine (lapis lazuli) · c. 600 (source-declared) ·
              after the cited pigment ledger of{" "}
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
            {GALLERY_SHOWCASE.map((p) => (
              <li key={p.id} className="wardrobe-enter">
                {/* The mount: a layered 畫框 — click to walk up close. The
                    box keeps the card's own sheet ratio (63:88), so the mat
                    is an even margin, not a letterbox. */}
                <CloseLook
                  src={p.image_url}
                  alt={p.name}
                  caption={`${p.name} — ${p.set_name} №${p.number}${p.artist ? ` · illus. ${p.artist}` : ""} · ${SHOWCASE_ATTRIBUTION}`}
                >
                  <div className="relative aspect-[63/88] overflow-hidden wardrobe-mat wardrobe-frame m-2">
                    <Image
                      src={p.image_url}
                      alt={p.name}
                      fill
                      className="object-contain p-2.5 sm:p-3"
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    />
                  </div>
                </CloseLook>

                {/* The wall label: the piece, its set, the hand, and the source. */}
                <div className="mt-4 px-1">
                  <p className="font-display text-base text-ink leading-snug">{p.name}</p>
                  <p className="mt-0.5 text-sm text-ink-muted">
                    {p.set_name}
                    <span className="text-ink-faint"> · №{p.number}</span>
                  </p>
                  {p.note && (
                    <p className="mt-1.5 text-xs text-ink-muted leading-relaxed">
                      {p.note}
                    </p>
                  )}
                  {p.artist && (
                    <p className="mt-1.5 text-xs italic text-accent">
                      illustrated by {p.artist}
                    </p>
                  )}
                  <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
                    {SHOWCASE_ATTRIBUTION} · via{" "}
                    <a
                      href={p.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline underline-offset-2 hover:text-accent"
                    >
                      {SHOWCASE_SOURCE.label}
                    </a>
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
