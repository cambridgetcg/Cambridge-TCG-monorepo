import type { MuseumPiece } from "@/components/culture/MuseumPlate";

/** One source record shared by the home entrance and the existing lineage essay. */
export const HOME_ARTWORK: MuseumPiece = {
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
export const HOME_ARTWORK_REVIEW = {
  checkedOn: "2026-09-29",
  apiUrl: "https://api.artic.edu/api/v1/artworks/11054",
  sourcePublicDomain: true,
  imageId: "f7a5cc17-a592-2068-49db-fbc068e9491c",
  localSha256: "c0bf35c299223cf13eea78f1c64158f80828c157d78f3dae99dd498a3f850eea",
  method: "Official API title, maker, date, medium, credit and public-domain flag checked; existing local image closely matches the API's 8×5 thumbnail.",
  limit: "Full-resolution museum IIIF retrieval returned HTTP 403. Thumbnail comparison is not a byte-identical source-image verification.",
} as const;
