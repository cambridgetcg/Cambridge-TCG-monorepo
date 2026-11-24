/**
 * Why a card's official image or rules text is in a response, or is not: the
 * values of the universal card's publication_boundary.image and .text, and
 * what each one means. Pure, so the reader, the contract, OpenAPI and the
 * standards page share one table.
 *
 * Only withheld_pending_field_level_source_rights speaks of rights. A failed
 * read, or a stored record that fails our own checks, is could_not_be_read:
 * a fault of ours must never be published as a rights decision.
 */
export type OfficialMediaState = "shown" | "no_lane" | "switched_off" | "none" | "unreadable";

export const IMAGE_REASON = {
  shown: "cleared_official_sample_self_hosted_attributed",
  no_lane: "withheld_pending_field_level_source_rights",
  switched_off: "japanese_images_switched_off",
  none: "no_official_image_available",
  unreadable: "could_not_be_read",
} as const satisfies Record<OfficialMediaState, string>;

export const TEXT_REASON = {
  shown: "cleared_official_text_attributed",
  no_lane: "withheld_pending_field_level_source_rights",
  none: "no_official_text_available",
  unreadable: "could_not_be_read",
} as const satisfies Record<Exclude<OfficialMediaState, "switched_off">, string>;

export const MEDIA_REASON_MEANINGS = {
  cleared_official_sample_self_hosted_attributed: "An official sample image is included, with its credit line.",
  cleared_official_text_attributed: "Official English rules text is included, with its credit line.",
  withheld_pending_field_level_source_rights: "Cambridge has recorded no source rights that cover this field for this card, so it publishes none.",
  japanese_images_switched_off: "No official English image is available for this card, and Cambridge has switched official Japanese images off.",
  no_official_image_available: "Cambridge shows official images for this card's game, but has none it can show for this card.",
  no_official_text_available: "Cambridge shows official rules text for this card's game, but has none it can show for this card. Some cards have no rules text.",
  could_not_be_read: "Cambridge could not read its own record for this field. This is a fault, not a rights decision.",
} as const satisfies Record<(typeof IMAGE_REASON)[keyof typeof IMAGE_REASON] | (typeof TEXT_REASON)[keyof typeof TEXT_REASON], string>;
