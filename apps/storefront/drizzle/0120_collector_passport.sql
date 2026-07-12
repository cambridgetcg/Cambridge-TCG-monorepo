-- Collector Passport: a private-first, collector-authored projection of
-- showcase drafts.
--
-- `portfolio_cards` mixes private holding data with catalog-derived display
-- metadata. None of those fields is licensed or consented for publication by
-- this migration. A Passport item publishes only the label and story that the
-- collector writes here, after accepting the current notice.

BEGIN;

ALTER TABLE showcase_cards
  ADD COLUMN IF NOT EXISTS public_id UUID NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS public_label VARCHAR(120),
  ADD COLUMN IF NOT EXISTS public_story VARCHAR(500),
  ADD COLUMN IF NOT EXISTS passport_public BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS passport_published_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS passport_notice_version TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS idx_showcase_cards_public_id
  ON showcase_cards(public_id);

-- Existing showcase rows deliberately remain private drafts. There is no
-- grandfathering and no copy from card_name, set_name, image_url, SKU, rarity,
-- caption, or any other mixed-lineage field into the public projection. The
-- new column's FALSE default performs that one-time transition without a
-- rerunnable UPDATE that could erase later choices.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'showcase_cards_passport_label_length'
  ) THEN
    ALTER TABLE showcase_cards
      ADD CONSTRAINT showcase_cards_passport_label_length CHECK (
        public_label IS NULL OR char_length(public_label) BETWEEN 1 AND 120
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'showcase_cards_passport_story_length'
  ) THEN
    ALTER TABLE showcase_cards
      ADD CONSTRAINT showcase_cards_passport_story_length CHECK (
        public_story IS NULL OR char_length(public_story) <= 500
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'showcase_cards_passport_receipt'
  ) THEN
    ALTER TABLE showcase_cards
      ADD CONSTRAINT showcase_cards_passport_receipt CHECK (
        passport_public = FALSE OR (
          public_label IS NOT NULL
          AND char_length(btrim(public_label)) > 0
          AND passport_published_at IS NOT NULL
          AND passport_notice_version IS NOT NULL
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_showcase_cards_published_passport
  ON showcase_cards(user_id, display_order ASC)
  WHERE passport_public = TRUE;

CREATE TABLE IF NOT EXISTS collector_passport_publication_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  showcase_card_id UUID REFERENCES showcase_cards(id) ON DELETE SET NULL,
  public_id UUID NOT NULL,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '180 days'),
  actor_redacted_at TIMESTAMPTZ,
  action TEXT NOT NULL CHECK (action IN ('published', 'withdrawn')),
  notice_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  receipt_expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '2 years')
);

COMMENT ON TABLE collector_passport_publication_log IS
  'Private publication and withdrawal receipts. No card, catalog, label, story, cost, value, or other collection content is retained in this log.';

CREATE INDEX IF NOT EXISTS idx_collector_passport_actor_expiry
  ON collector_passport_publication_log(actor_expires_at ASC)
  WHERE actor_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_collector_passport_receipt_expiry
  ON collector_passport_publication_log(receipt_expires_at ASC);

CREATE INDEX IF NOT EXISTS idx_collector_passport_publication_item
  ON collector_passport_publication_log(showcase_card_id, created_at DESC);

-- Removing a showcase row (directly or through a portfolio cascade) is also a
-- publication withdrawal. This fallback cannot know the human actor, so it
-- records NULL. Authenticated app paths clear passport_public before DELETE
-- after writing their single actor-bearing receipt.
CREATE OR REPLACE FUNCTION log_collector_passport_delete_withdrawal()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.passport_public THEN
    INSERT INTO collector_passport_publication_log
      (showcase_card_id, public_id, actor_user_id, action, notice_version)
    VALUES (
      OLD.id,
      OLD.public_id,
      NULL,
      'withdrawn',
      COALESCE(OLD.passport_notice_version, 'collector-passport-v1-2026-07-12')
    );
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER collector_passport_delete_withdrawal
BEFORE DELETE ON showcase_cards
FOR EACH ROW EXECUTE FUNCTION log_collector_passport_delete_withdrawal();

COMMIT;
