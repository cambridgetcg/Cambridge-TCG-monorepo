-- 0131_collective_directory_publication.sql
--
-- A public collective profile is not, by itself, consent to searchable
-- directory and public-JSON distribution. Keep a separate, versioned current
-- receipt. Existing collectives deliberately remain unlisted until a steward
-- makes the new choice from the management surface.

ALTER TABLE collectives
  ADD COLUMN IF NOT EXISTS directory_publication_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS directory_publication_version TEXT;

ALTER TABLE collectives
  DROP CONSTRAINT IF EXISTS collectives_directory_publication_receipt;

ALTER TABLE collectives
  ADD CONSTRAINT collectives_directory_publication_receipt CHECK (
    (
      directory_publication_at IS NULL
      AND directory_publication_version IS NULL
    )
    OR (
      is_public = TRUE
      AND directory_publication_at IS NOT NULL
      AND directory_publication_version IS NOT NULL
    )
  );

CREATE OR REPLACE FUNCTION ct_collective_directory_languages_bounded(
  values_to_check TEXT[]
) RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
RETURNS NULL ON NULL INPUT
SET search_path = pg_catalog
AS $function$
  SELECT cardinality(values_to_check) <= 12
     AND NOT EXISTS (
       SELECT 1
         FROM unnest(values_to_check) AS language
        WHERE language IS NULL
           OR char_length(language) NOT BETWEEN 1 AND 35
     );
$function$;

-- Public response size remains bounded even if a caller bypasses HTML
-- maxLength attributes or invokes SQL/application helpers directly. NOT VALID
-- avoids making legacy private/public-profile data a migration blocker; every
-- newly listed or subsequently edited directory row is still checked.
ALTER TABLE collectives
  DROP CONSTRAINT IF EXISTS collectives_directory_publication_field_bounds;

ALTER TABLE collectives
  ADD CONSTRAINT collectives_directory_publication_field_bounds CHECK (
    directory_publication_at IS NULL
    OR (
      COALESCE(char_length(region), 0) <= 120
      AND COALESCE(octet_length(region), 0) <= 480
      AND ct_collective_directory_languages_bounded(languages)
      AND COALESCE(char_length(array_to_string(languages, '')), 0) <= 420
      AND COALESCE(octet_length(array_to_string(languages, '')), 0) <= 1680
      AND COALESCE(char_length(description), 0) <= 2000
      AND COALESCE(octet_length(description), 0) <= 8000
      AND COALESCE(char_length(house_rules), 0) <= 4000
      AND COALESCE(octet_length(house_rules), 0) <= 16000
    )
  ) NOT VALID;

CREATE INDEX IF NOT EXISTS idx_collectives_directory_publication
  ON collectives (display_name, slug)
  WHERE is_public = TRUE AND directory_publication_at IS NOT NULL;

COMMENT ON COLUMN collectives.directory_publication_at IS
  'Current steward receipt for searchable HTML and public JSON directory publication; NULL means unlisted.';

COMMENT ON COLUMN collectives.directory_publication_version IS
  'Terms version accepted with the current directory-publication receipt; NULL means unlisted.';
