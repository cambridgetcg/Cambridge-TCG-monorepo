import Image from "next/image";
import Link from "next/link";
import { HOME_ARTWORK, HOME_ARTWORK_REVIEW } from "@/content/art/featured";

const link = "text-accent underline underline-offset-4 hover:text-accent-strong";
const quiet = "text-ink-muted underline decoration-border-strong underline-offset-4 hover:text-ink";

/** A local, credited artwork hung in a plain mount with a wall label; it opens a reading route without fetching a feed. */
export default function HomeArtwork() {
  return (
    <figure lang="en" className="w-full max-w-[340px] lg:ml-auto">
      <p className="mb-3 font-mono text-xs uppercase tracking-[0.16em] text-ink-muted">Room for art <span aria-hidden="true">↗</span></p>
      <Link href={HOME_ARTWORK.contentHref} prefetch={false} aria-label="Explore the art behind the cards" className="block border border-border-subtle bg-surface p-3 shadow-mat focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent sm:p-4">
        <Image
          src={HOME_ARTWORK.src}
          width={HOME_ARTWORK.width}
          height={HOME_ARTWORK.height}
          alt={HOME_ARTWORK.alt}
          sizes="(max-width: 640px) 314px, 306px"
          loading="eager"
          className="h-auto w-full object-contain"
        />
      </Link>
      <figcaption className="mt-5 text-sm leading-6 text-ink-muted">
        <p className="font-display text-base font-medium leading-snug text-ink">{HOME_ARTWORK.makerShort}</p>
        <p className="mt-1">{HOME_ARTWORK.displayTitle} · {HOME_ARTWORK.date} · <a href={HOME_ARTWORK.sourceUrl} className={quiet}>Museum record</a></p>
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
          <Link href="/lineage" prefetch={false} className={`${quiet} inline-flex min-h-11 items-center`}>Art behind the cards</Link>
          <Link href="/gallery-next-door" prefetch={false} className={`${quiet} inline-flex min-h-11 items-center`}>Explore Artbitrage</Link>
        </nav>
      </figcaption>
    </figure>
  );
}
