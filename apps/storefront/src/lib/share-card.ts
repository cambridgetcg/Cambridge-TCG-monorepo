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
