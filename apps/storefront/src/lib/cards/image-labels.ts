/**
 * Image labels shared by server and client components. Client-safe: type
 * imports only, so no database or server code reaches a bundle.
 *
 * A label says what the picture is and how it relates to the card, plainly,
 * so nobody takes a reference for the card in hand: matched by SKU syntax,
 * never checked against the physical card.
 */
import type { ImageReference } from "./image-reference";
import type { SameLanguageImageReference } from "./same-language-image-reference";

// Names for the language codes the SKU registry knows (GAMES[*].languages in
// @cambridge-tcg/sku); any other code shows as the code alone. A zh SKU does
// not say which script, so it is only "Chinese".
export const LANGUAGE_NAMES: Readonly<Record<string, string>> = {
  en: "English", ja: "Japanese", zh: "Chinese", ko: "Korean", fr: "French",
  de: "German", es: "Spanish", it: "Italian", pt: "Portuguese", ru: "Russian",
};

/** The image fields a market card or identity carries. Older payloads may
 * lack the language fields; absent counts as null. */
export interface MarketImageFields {
  image_reference?: ImageReference | null;
  image_language?: "en" | "ja" | null;
  image_same_language_reference?: SameLanguageImageReference | null;
}

/** The label for /market, the card page and /mekiki. */
export function marketImageLabel(card: MarketImageFields): string {
  const same = card.image_language === "ja" ? card.image_same_language_reference : null;
  if (same) {
    // A requested parallel or variant is shown its base print.
    return same.requested_canonical_sku === same.depicted_canonical_sku
      ? `Official image · this printing (${LANGUAGE_NAMES[same.language]}), matched by SKU, not verified`
      : `Official ${LANGUAGE_NAMES[same.language]} base print · art may differ, not verified`;
  }
  return card.image_reference
    ? "English reference image · printing not verified"
    : "Catalog image · source and printing unverified";
}

/** The language a credit line is written in, for a `lang` attribute: the
 * Japanese credit must not be read out as English. */
export function imageCreditLang(card: Pick<MarketImageFields, "image_language">): "ja" | undefined {
  return card.image_language === "ja" ? "ja" : undefined;
}
