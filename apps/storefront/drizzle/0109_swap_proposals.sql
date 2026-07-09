-- 0109_swap_proposals.sql — the collector trade (card-for-card swaps).
--
-- A swap is a structured proposal between two collectors: each side
-- lists catalog cards (sku + condition + quantity), plus an optional
-- recorded cash delta and a note. v1 settles OFF-PLATFORM: the platform
-- records, guides, and witnesses; money and cards move between the
-- parties directly. No market_trades row is created and trust scores do
-- not move — see /methodology/swaps for the customer-facing boundary.
--
-- Lifecycle: draft → proposed → (countered: a new linked proposal
-- supersedes this one via counter_of) → accepted → shipping (both sides
-- enter a ship-to address after acceptance, then mark shipped with
-- carrier + tracking) → both sides confirm receipt → completed.
-- Terminal branches: declined, cancelled, expired.
--
-- expires_at is stamped at propose-time from the proposer's chosen
-- window, defaulting to the RECIPIENT's users.response_window_hours
-- (migration 0092, the Asynchronous's column) — the sweep reads this
-- row's own expires_at, never a constant.
--
-- Sign convention: cash_delta_pence > 0 means the PROPOSER pays the
-- recipient; < 0 means the recipient pays the proposer.
--
-- swap_lifecycle_log mirrors trade_lifecycle_log (0078) so the Scribe's
-- aggregators can join uniformly. Slot factory: createSwapSlot in
-- packages/lifecycle/src/slots.ts.

BEGIN;

CREATE TABLE IF NOT EXISTS swap_proposals (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposer_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status                VARCHAR(20) NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','proposed','countered','accepted',
                                          'shipping','completed','declined','cancelled','expired')),
  -- +ve = proposer pays recipient; -ve = recipient pays proposer.
  -- Recorded only — v1 cash settles off-platform between the parties.
  cash_delta_pence      INTEGER NOT NULL DEFAULT 0,
  note                  TEXT,
  -- The proposal this one supersedes (counter chain). The superseded row
  -- moves to status 'countered'.
  counter_of            UUID REFERENCES swap_proposals(id) ON DELETE SET NULL,
  -- NULL while draft; stamped at propose-time.
  expires_at            TIMESTAMPTZ,

  -- Ship-to addresses, entered by each party AFTER acceptance. Flat JSONB
  -- mirroring market_trades.shipping_address (0105): { name, line1, line2,
  -- city, state, postal_code, country }, all keys optional. Participant-only
  -- — never on public surfaces.
  proposer_address      JSONB,
  recipient_address     JSONB,

  proposer_shipped_at   TIMESTAMPTZ,
  proposer_carrier      VARCHAR(100),
  proposer_tracking     VARCHAR(200),
  recipient_shipped_at  TIMESTAMPTZ,
  recipient_carrier     VARCHAR(100),
  recipient_tracking    VARCHAR(200),

  -- Each side confirms receipt of the OTHER side's cards. Both set →
  -- status 'completed'.
  proposer_confirmed_at  TIMESTAMPTZ,
  recipient_confirmed_at TIMESTAMPTZ,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CHECK (proposer_id <> recipient_id)
);

CREATE INDEX IF NOT EXISTS idx_swap_proposals_proposer
  ON swap_proposals(proposer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_swap_proposals_recipient
  ON swap_proposals(recipient_id, created_at DESC);

-- The expiry sweep's index: only live proposals with a deadline.
CREATE INDEX IF NOT EXISTS idx_swap_proposals_expiry
  ON swap_proposals(expires_at)
  WHERE status = 'proposed' AND expires_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS swap_proposal_items (
  id                              BIGSERIAL PRIMARY KEY,
  swap_id                         UUID NOT NULL REFERENCES swap_proposals(id) ON DELETE CASCADE,
  side                            VARCHAR(9) NOT NULL CHECK (side IN ('proposer','recipient')),
  sku                             VARCHAR(60) NOT NULL,
  condition                       VARCHAR(10) NOT NULL DEFAULT 'NM',
  quantity                        INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1),
  -- Snapshots taken at creation so the record stays legible after the
  -- catalog moves on. Indicative price is guidance-at-proposal-time
  -- (recent trades / CTCG spot), never an enforced value.
  snapshot_name                   VARCHAR(300),
  snapshot_image_url              TEXT,
  snapshot_indicative_price_pence INTEGER,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_swap_proposal_items_swap
  ON swap_proposal_items(swap_id, side);

-- Append-only audit log for swap transitions. Same shape as
-- trade_lifecycle_log (0078) so journey/admin aggregators join uniformly.
CREATE TABLE IF NOT EXISTS swap_lifecycle_log (
  id            BIGSERIAL PRIMARY KEY,
  swap_id       UUID NOT NULL REFERENCES swap_proposals(id) ON DELETE CASCADE,
  action        VARCHAR(40) NOT NULL,
  actor_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_label   TEXT,
  reason        TEXT,
  metadata      JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_swap_log_subject
  ON swap_lifecycle_log(swap_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_swap_log_action
  ON swap_lifecycle_log(action, created_at DESC);

COMMENT ON TABLE swap_proposals IS
  'Collector card-for-card swap proposals. v1 records and witnesses only: cash difference and shipping settle off-platform between the parties. No market_trades coupling, no trust-score movement (see /methodology/swaps).';

COMMENT ON COLUMN swap_proposals.cash_delta_pence IS
  'Recorded cash difference in pence. Positive = proposer pays recipient; negative = recipient pays proposer. Settled off-platform in v1.';

COMMENT ON COLUMN swap_proposals.expires_at IS
  'Proposal response deadline, stamped at propose-time. Defaults to the recipient''s users.response_window_hours (0092); the expiry sweep reads this column, never a constant.';

COMMIT;
