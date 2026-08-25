/** Shared, pure bounds and immutable notice for the public organisation directory. */
export const DIRECTORY_PUBLICATION_VERSION = "community-directory-v2";

/**
 * This is the text bound to the receipt version above. Keep it shared by the
 * create and manage forms so a receipt cannot point at two different notices.
 * Change the version whenever a material promise changes.
 */
export const DIRECTORY_PUBLICATION_NOTICE = Object.freeze({
  publication:
    "List this profile in Cambridge TCG's searchable organisation directory, public HTML and public JSON API. This publishes its slug, display name, kind, region, languages, description, house rules, and platform-record creation and update times. Names and descriptions are searchable; kind, region and language are filters. The directory selects no structured member data or platform-derived steward identity.",
  exposure:
    "Anyone can view this material. Search engines, AI crawlers and other third parties may index, copy or redistribute it.",
  withdrawal:
    "This choice is separate from the public collective profile. Turning the directory listing off stops future directory responses but leaves the public profile visible; making the profile private also clears the listing. Cambridge TCG cannot recall copies already fetched by third parties.",
  data_discipline:
    "Do not include personal data about another person in the slug, display name, region, languages, description, house rules or any other directory field.",
  correction:
    "For correction or removal, turn the listing off or email support@cambridgetcg.com.",
});
export const DIRECTORY_PAGE_SIZE = 24;
export const DIRECTORY_MAX_LIMIT = 100;
export const DIRECTORY_MAX_OFFSET = 2_400;
export const DIRECTORY_MAX_PAGE =
  Math.floor(DIRECTORY_MAX_OFFSET / DIRECTORY_PAGE_SIZE) + 1;
export const DIRECTORY_MAX_QUERY_LENGTH = 120;
export const DIRECTORY_MAX_REGION_LENGTH = 80;
export const DIRECTORY_MAX_LANGUAGE_LENGTH = 35;
export const DIRECTORY_MAX_PROFILE_REGION_LENGTH = 120;
export const DIRECTORY_MAX_LANGUAGES = 12;
export const DIRECTORY_MAX_LANGUAGES_INPUT_LENGTH =
  DIRECTORY_MAX_LANGUAGES * DIRECTORY_MAX_LANGUAGE_LENGTH +
  (DIRECTORY_MAX_LANGUAGES - 1) * 2;
export const DIRECTORY_MAX_DESCRIPTION_LENGTH = 2_000;
export const DIRECTORY_MAX_HOUSE_RULES_LENGTH = 4_000;
export const DIRECTORY_MAX_FACET_VALUES = 100;

/** PostgreSQL text rejects NUL; other Unicode control characters have no useful place
 * in public directory search or publication filters. */
export const DIRECTORY_CONTROL_CHARACTER_RE = /\p{Cc}/u;
