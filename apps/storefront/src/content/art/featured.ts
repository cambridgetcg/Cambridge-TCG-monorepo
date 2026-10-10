import type { MuseumPiece } from "@/components/culture/MuseumPlate";

interface FeaturedArtwork extends MuseumPiece {
  /** Editorial caption; the museum's full title remains in title. */
  displayTitle: string;
  makerShort: string;
  contentHref: string;
}

/** Stable illustration for the lineage essay, independent of the home selection. */
export const SEBA_ARTWORK: MuseumPiece = {
  src: "/culture-plates/artic-11054.jpg",
  width: 843,
  height: 536,
  title: 'No. 32: Seba, from the series "Sixty-nine Stations of the Kisokaido (Kisokaido rokujukyu tsugi no uchi)"',
  artist: "Utagawa Hiroshige 歌川 広重 (Japanese, 1797–1858)",
  date: "c. 1835/38",
  medium: "Color woodblock print; oban",
  credit: "Gift of H. R. Warner",
  sourceName: "The Art Institute of Chicago",
  sourceUrl: "https://www.artic.edu/artworks/11054",
  rights: "Public domain",
  alt: "Two boats on a blue river beneath a full moon, with willow branches crossing the pale sky.",
};

/** Dated source evidence, not a live request or a blanket artwork licence. */
export const SEBA_ARTWORK_REVIEW = {
  checkedOn: "2026-09-29",
  apiUrl: "https://api.artic.edu/api/v1/artworks/11054",
  sourcePublicDomain: true,
  imageId: "f7a5cc17-a592-2068-49db-fbc068e9491c",
  localSha256: "c0bf35c299223cf13eea78f1c64158f80828c157d78f3dae99dd498a3f850eea",
  method: "Official API title, maker, date, medium, credit and public-domain flag checked; existing local image closely matches the API's 8×5 thumbnail.",
  limit: "Full-resolution museum IIIF retrieval returned HTTP 403. Thumbnail comparison is not a byte-identical source-image verification.",
} as const;

/** Source metadata shared by the home entrance and the making essay. */
export const SHARAKU_ARTWORK: FeaturedArtwork = {
  src: "/culture-plates/met-37359.jpg",
  width: 422,
  height: 625,
  title: 'Bandō Hikosaburō III as Sagisaka Sanai in the Play "Koinyōbō Somewake Tazuna"',
  artist: "Tōshūsai Sharaku",
  date: "1794",
  medium: "Woodblock print; ink, color, white mica on paper",
  credit: "Henry L. Phillips Collection, Bequest of Henry L. Phillips, 1939",
  sourceName: "The Metropolitan Museum of Art",
  sourceUrl: "https://www.metmuseum.org/art/collection/search/37359",
  rights: "Public domain (Met Open Access)",
  alt: "A kabuki actor holding a lantern, wearing a maroon robe over a yellow under-robe, against a pale mica ground.",
  displayTitle: "The actor & the lantern",
  makerShort: "Tōshūsai Sharaku",
  contentHref: "/making",
};

/** A dated check of this object and this local image, not a blanket art licence. */
export const SHARAKU_ARTWORK_REVIEW = {
  checkedOn: "2026-09-29",
  apiUrl: "https://collectionapi.metmuseum.org/public/collection/v1/objects/37359",
  sourcePublicDomain: true,
  objectId: 37359,
  sourceImageUrl: "https://images.metmuseum.org/CRDImages/as/web-large/DP130229.jpg",
  sourceImageSha256: "5ce64c9cd499bf87db7379a7879dcc18bc862343510f1ac31aed2ff0e37eaea6",
  localSha256: "b30c6a99acd57890119fb9e8c0155136745cc082191274772b7e7c31c8c4d2a7",
  method: "Official object page and API title, maker, date, medium, credit and public-domain flag checked. The local 422×625 image has identical decoded RGB pixels to the API-linked web-large image.",
  limit: "The source and local image files have different byte hashes. This check establishes matching decoded pixels, not identical file encoding or a licence for other works.",
} as const;

export const HOME_ARTWORK = SHARAKU_ARTWORK;
export const HOME_ARTWORK_REVIEW = SHARAKU_ARTWORK_REVIEW;
