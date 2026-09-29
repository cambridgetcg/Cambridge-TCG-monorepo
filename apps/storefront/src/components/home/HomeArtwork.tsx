import Image from "next/image";
import Link from "next/link";
import { HOME_ARTWORK, HOME_ARTWORK_REVIEW } from "@/content/art/featured";

const link = "text-accent underline underline-offset-4";

/** A local, credited artwork that opens a reading route without fetching a feed. */
export default function HomeArtwork() {
  return (
    <figure lang="en" className="mx-auto w-full max-w-[460px]">
      <div className="relative isolate overflow-hidden rounded-[1.5rem] bg-secondary-wash px-8 pb-7 pt-6 sm:px-10">
        <div aria-hidden="true" className="absolute -right-16 top-10 -z-10 h-56 w-56 rounded-full bg-highlight" />
        <div aria-hidden="true" className="absolute -bottom-10 -left-12 -z-10 h-48 w-48 rounded-full border border-ink/20" />
        <p className="mb-5 flex items-center justify-between gap-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink"><span>Room for art</span><span aria-hidden="true">↗</span></p>
      <Link href={HOME_ARTWORK.contentHref} prefetch={false} aria-label="Explore the art behind the cards" className="mx-auto block max-w-[235px] bg-surface p-2 shadow-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent sm:max-w-[260px]">
        <Image
          src={HOME_ARTWORK.src}
          width={HOME_ARTWORK.width}
          height={HOME_ARTWORK.height}
          alt={HOME_ARTWORK.alt}
          sizes="(max-width: 640px) 235px, 260px"
          loading="eager"
          className="h-auto w-full object-contain"
        />
      </Link>
      </div>
      <figcaption className="mt-4 text-xs leading-6 text-ink-muted">
        <p className="flex flex-wrap justify-between gap-x-4"><span className="font-semibold text-ink">{HOME_ARTWORK.makerShort}</span><span>{HOME_ARTWORK.date}</span></p>
        <p>{HOME_ARTWORK.displayTitle} · <a href={HOME_ARTWORK.sourceUrl} className={link}>Museum record</a></p>
        <details className="mt-1">
          <summary className="min-h-11 cursor-pointer py-2 text-ink underline decoration-border-strong underline-offset-4">Artwork details &amp; credit</summary>
          <dl className="space-y-2 border-l border-border-subtle pl-3 pb-3">
            <div><dt className="font-medium text-ink">Title</dt><dd>{HOME_ARTWORK.title}</dd></div>
            <div><dt className="font-medium text-ink">Maker</dt><dd>{HOME_ARTWORK.artist}</dd></div>
            <div><dt className="font-medium text-ink">Date</dt><dd>{HOME_ARTWORK.date}</dd></div>
            <div><dt className="font-medium text-ink">Medium</dt><dd>{HOME_ARTWORK.medium}</dd></div>
            <div><dt className="font-medium text-ink">Credit</dt><dd>{HOME_ARTWORK.credit}</dd></div>
            <div><dt className="font-medium text-ink">Source and rights</dt><dd><a href={HOME_ARTWORK.sourceUrl} className={link}>{HOME_ARTWORK.sourceName}</a> · {HOME_ARTWORK.rights}, as declared by the museum.</dd></div>
          </dl>
          <p className="pb-3">Source record checked {HOME_ARTWORK_REVIEW.checkedOn}. This record concerns this artwork only.</p>
        </details>
        <nav aria-label="Art and stories" className="flex flex-wrap gap-x-5">
          <Link href="/lineage" prefetch={false} className={`${link} inline-flex min-h-11 items-center`}>Art behind the cards</Link>
          <Link href="/gallery-next-door" prefetch={false} className={`${link} inline-flex min-h-11 items-center`}>Explore Artbitrage</Link>
        </nav>
      </figcaption>
    </figure>
  );
}
