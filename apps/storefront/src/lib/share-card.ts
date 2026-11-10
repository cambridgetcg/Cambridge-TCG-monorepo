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

/** Catalogue image hosts: the retired CardRush-scan buckets (`jp-*-photos`,
 *  docs/infra/aws-resources.md) under either S3 endpoint form, and CardRush's
 *  own shop hosts (next.config.ts lists both kinds). */
function isCatalogueImageHost(imageUrl: string): boolean {
  let host: string;
  try {
    host = new URL(imageUrl).hostname.toLowerCase();
  } catch {
    return false;
  }
  return /^jp-[a-z]+-photos\.s3(\.[a-z0-9-]+)?\.amazonaws\.com$/.test(host)
    || /^(www\.)?cardrush-[a-z]+\.jp$/.test(host);
}

/** The page's own image, if it may be offered as og:image; else null, and the
 *  page falls back to SHARE_CARD as it does when it has no image. An image on
 *  a catalogue host is never offered: such a host answers 403 to a crawler
 *  for a missing object, the image has no verified source or printing, and a
 *  platform's cached copy outlives any takedown. Any other image is offered
 *  as before; the English official image's og:image is a recorded gap
 *  (docs/decisions/2026-10-30-japanese-official-images.md). */
export function shareableImageUrl(imageUrl: string | null | undefined): string | null {
  return imageUrl && !isCatalogueImageHost(imageUrl) ? imageUrl : null;
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
