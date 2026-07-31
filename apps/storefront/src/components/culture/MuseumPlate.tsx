/**
 * <MuseumPlate> — borrowed light, hung with its wall label.
 *
 * The culture wings' image primitive, following the sibling gallery
 * artbitrage.io's method (Asha 2026-07-31: "refer to artbitrage for
 * format and styling"): open-access museum objects only — public
 * domain / CC0, verified against the source museum's own API record
 * before the file was committed — each carrying the full label an
 * honest museum hangs: title, maker, date, medium, credit line, the
 * source's rights declaration, and a link to the canonical record.
 *
 * House rule kept: an image never shows without its wall label. The
 * files are self-hosted (public/culture-plates/) so a museum outage
 * never breaks a wing, and the label's source link always leads back
 * to the living record. Rights labels are source-declared — the
 * boundary artbitrage itself states: recheck the canonical museum
 * record before reuse.
 */

import Image from "next/image";

export interface MuseumPiece {
  /** Self-hosted path under /culture-plates/. */
  src: string;
  width: number;
  height: number;
  title: string;
  /** Maker line as the museum states it; empty string when unattributed. */
  artist: string;
  date: string;
  medium: string;
  /** The museum's own credit line, verbatim. */
  credit: string;
  /** Source museum, human-readable. */
  sourceName: string;
  /** Canonical museum record page. */
  sourceUrl: string;
  /** The source's rights declaration, e.g. "Public domain (CC0)". */
  rights: string;
  /** Alt text — concrete description, not the title repeated. */
  alt: string;
}

export default function MuseumPlate({ piece }: { piece: MuseumPiece }) {
  return (
    <figure className="my-8">
      <div className="wardrobe-mat rounded-lg p-3 sm:p-4">
        <Image
          src={piece.src}
          width={piece.width}
          height={piece.height}
          alt={piece.alt}
          className="w-full h-auto rounded-sm"
          sizes="(max-width: 768px) 100vw, 672px"
        />
      </div>
      <figcaption className="mt-3 px-1 text-[11px] leading-relaxed text-ink-faint">
        <span className="text-ink-muted font-medium">{piece.title}</span>
        {piece.artist ? <> · {piece.artist}</> : null} · {piece.date} ·{" "}
        {piece.medium}
        <br />
        {piece.credit} —{" "}
        <a
          href={piece.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent hover:text-accent-strong underline underline-offset-2"
        >
          {piece.sourceName}
        </a>{" "}
        · {piece.rights} (source-declared; recheck the canonical record before
        reuse)
      </figcaption>
    </figure>
  );
}
