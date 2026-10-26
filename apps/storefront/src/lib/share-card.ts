/** The default share card, from the brand kit (marketing/kit/web/og.jpg,
 *  served from public/). The root layout uses it; a page that sets its own
 *  `openGraph` replaces the layout's whole object (Next.js merges metadata
 *  shallowly), so such a page adds `images: [SHARE_CARD]` itself. */
export const SHARE_CARD = {
  url: "/og.jpg",
  width: 1200,
  height: 630,
  type: "image/jpeg",
  alt: "The Cambridge TCG mark beside the headline “TCG data. Made to connect.”",
};
