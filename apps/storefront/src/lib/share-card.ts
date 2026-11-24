import type { Metadata } from "next";

/** The default share card, from the brand kit (marketing/kit/web/og.jpg,
 *  served from public/). The root layout uses it; a page that sets its own
 *  `openGraph` replaces the layout's whole object (Next.js merges metadata
 *  shallowly), so such a page adds `images: [SHARE_CARD]` itself. Platforms
 *  cache og:image by URL, so `v` changes whenever the card is rebuilt. */
export const SHARE_CARD = {
  url: "/og.jpg?v=2026-10-27",
  width: 1200,
  height: 630,
  type: "image/jpeg",
  alt: "The Cambridge TCG mark beside the headline “TCG data. Made to connect.”",
};

/** The auction photo bucket that lot photos are uploaded to (lib/auction/s3.ts
 *  builds the same origin from the same two variables). Read per call, like
 *  s3.ts. */
function lotPhotoHost(): string {
  const bucket = (process.env.AUCTION_S3_BUCKET || "cambridgetcg-auction-images").trim();
  const region = (process.env.AWS_REGION || "us-east-1").trim();
  return `${bucket}.s3.${region}.amazonaws.com`;
}

/** The page's own image, if it may be offered as og:image (and so
 *  twitter:image) or as a JSON-LD image; else null, and the page falls back
 *  to SHARE_CARD as it does when it has no image. Only an https lot photo on
 *  the site's own auction bucket is offered. Anything else is not: an official
 *  image would be shown and cached by a social platform without its credit,
 *  beyond any takedown; a catalogue host (the jp-*-photos buckets) answers 403
 *  to a crawler for a missing object; and a lot photo's URL on any other host
 *  was supplied by the client and never checked. */
export function shareableImageUrl(imageUrl: string | null | undefined): string | null {
  if (!imageUrl) return null;
  let url: URL;
  try {
    url = new URL(imageUrl);
  } catch {
    return null;
  }
  return url.protocol === "https:" && url.hostname === lotPhotoHost() ? imageUrl : null;
}

/** A fixed share card for a page whose title or description echoes the URL
 *  (a search query, an unchecked slug, a not-found or outage branch). Without
 *  it, og:title and twitter:title follow the page title (see layout.tsx), so a
 *  shared link could put anyone's text on a cambridgetcg.com card. Keeps the
 *  layout's siteName and type, which a page's own openGraph replaces. */
export function fixedShareCard(title: string, description?: string): NonNullable<Metadata["openGraph"]> {
  return {
    title,
    ...(description ? { description } : {}),
    images: [SHARE_CARD],
    siteName: "Cambridge TCG",
    type: "website",
  };
}
