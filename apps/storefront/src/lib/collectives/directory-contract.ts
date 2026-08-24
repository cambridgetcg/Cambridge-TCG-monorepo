/** Shared, pure bounds for the public organisation directory. */
export const DIRECTORY_PUBLICATION_VERSION = "community-directory-v1";
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
