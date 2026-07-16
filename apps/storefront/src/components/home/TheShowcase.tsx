import Image from "next/image";
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
 * Renders nothing until the fetch pipeline has hung something. Server
 * component (no hooks).
 */
export default function TheShowcase() {
  if (GALLERY_SHOWCASE.length === 0) return null;

  return (
    <section className="max-w-7xl mx-auto px-4 pt-24 sm:pt-28">
      {/* A vertical 縦書き mark in 明朝 beside the plate. */}
      <header className="mb-14 sm:mb-20 flex items-start gap-5 sm:gap-8">
        <p
          aria-hidden="true"
          className="wardrobe-jp [writing-mode:vertical-rl] text-ink-faint text-base tracking-[0.4em] pt-1 select-none hidden sm:block"
        >
          名品
        </p>
        <div className="max-w-2xl">
          <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-ink-faint mb-4">
            01 — shown in full
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

      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-14 sm:gap-y-16">
        {GALLERY_SHOWCASE.map((p) => (
          <li key={p.id}>
            {/* The mount: a hairline frame, the art floated whole inside. */}
            <div className="relative aspect-[3/4] overflow-hidden wardrobe-mat">
              <Image
                src={p.image_url}
                alt={p.name}
                fill
                className="object-contain p-3 sm:p-4"
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              />
            </div>

            {/* The wall label: the piece, its set, the hand, and the source. */}
            <div className="mt-4 px-1">
              <p className="font-display text-base text-ink leading-snug">{p.name}</p>
              <p className="mt-0.5 text-sm text-ink-muted">
                {p.set_name}
                <span className="text-ink-faint"> · №{p.number}</span>
              </p>
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
    </section>
  );
}
