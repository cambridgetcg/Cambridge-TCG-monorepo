import Image from "next/image";
import Link from "next/link";
import { HOME_ARTWORK, HOME_ARTWORK_REVIEW } from "@/content/art/featured";

const link = "text-accent underline underline-offset-4";

/** A local, credited artwork that opens a reading route without fetching a feed. */
export default function HomeArtwork() {
  return (
    <figure lang="en" className="mx-auto w-full max-w-[420px]">
      <Link href="/lineage" prefetch={false} aria-label="Explore the art behind the cards" className="block rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">
        <Image
          src={HOME_ARTWORK.src}
          width={HOME_ARTWORK.width}
          height={HOME_ARTWORK.height}
          alt={HOME_ARTWORK.alt}
          sizes="(max-width: 640px) calc(100vw - 32px), 420px"
          loading="eager"
          className="h-auto max-h-72 w-full rounded-sm object-contain"
        />
      </Link>
      <figcaption className="mt-3 text-sm leading-6 text-ink-muted">
        <p><span className="text-ink">Utagawa Hiroshige · <cite className="not-italic">Seba</cite></span> · {HOME_ARTWORK.date}</p>
        <p>{HOME_ARTWORK.rights} · <a href={HOME_ARTWORK.sourceUrl} className={link}>Art Institute of Chicago</a></p>
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
