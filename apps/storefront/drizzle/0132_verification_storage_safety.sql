-- Identity-document storage safety.
--
-- The browser upload and database persistence happen in separate requests.
-- Retrying phase 2 must therefore return the one existing document row rather
-- than create duplicates for the same private S3 object.

-- Fail with an aggregate-only message before index creation if a legacy retry
-- produced duplicates. Do not print keys or participant identifiers; an
-- operator must adjudicate any non-zero count through a privacy-reviewed
-- remediation before rerunning the migration.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM verification_documents
     GROUP BY s3_key
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'verification_documents contains duplicate s3_key groups; run the privacy-safe aggregate preflight and adjudicate before migration';
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_verification_documents_s3_key
  ON verification_documents (s3_key);
