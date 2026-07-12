-- Realized P&L ledger — closed investor positions.
--
-- One row per sale event. Cost basis is taken from the share-pooled
-- portfolio_cards row (HMRC s104 / weighted average), which is what
-- portfolio.addCard already maintains via the rolling avg in its
-- upsert path. proceeds_gbp = sale_price * quantity NET of fees the
-- user paid (commission, payout method fee). gain_gbp = proceeds -
-- cost_basis_total. holding_days from acquired_at → sold_at; the
-- per-row holding period matters for tax (long-term vs short-term
-- treatment in some jurisdictions; UK CGT treats all the same but
-- the export is jurisdiction-agnostic).
--
-- exit_kind enumerates which surface closed the position so audits
-- can join back to the originating row (market_trades.id,
-- auctions.id, market_lot_trades.id, customer_orders.id, manual).

CREATE TABLE IF NOT EXISTS realized_positions (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sku           VARCHAR(60) NOT NULL,
  card_name     VARCHAR(300),
  set_code      VARCHAR(20),
  condition     VARCHAR(10) NOT NULL,
  quantity      INT NOT NULL CHECK (quantity > 0),

  cost_basis_per_unit  NUMERIC(10,2) NOT NULL,
  cost_basis_total     NUMERIC(12,2) NOT NULL,
  proceeds_gbp         NUMERIC(12,2) NOT NULL,
  fees_gbp             NUMERIC(10,2) NOT NULL DEFAULT 0,
  gain_gbp             NUMERIC(12,2) NOT NULL,

  acquired_at   DATE,
  sold_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  holding_days  INT,

  exit_kind          VARCHAR(30) NOT NULL,  -- 'market_trade' | 'auction' | 'lot_trade' | 'manual'
  exit_reference_id  TEXT,                   -- text so we can store UUID + numeric ids
  notes              TEXT,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_realized_positions_user
  ON realized_positions(user_id, sold_at DESC);

-- (A per-year expression index was dropped from the original draft: it used
--  date_trunc('year', sold_at) on a timestamptz, which is not IMMUTABLE and
--  aborts the migration. The (user_id, sold_at DESC) index above already
--  serves the tax-export's `user_id = $1 AND sold_at >= $2 AND sold_at < $3`
--  range scan, so nothing is lost. This was why 0085 was held.)

CREATE INDEX IF NOT EXISTS idx_realized_positions_sku
  ON realized_positions(sku, sold_at DESC);

-- Source columns on portfolio_cards so auto-acquisitions backtrack
-- to the originating purchase.
ALTER TABLE portfolio_cards
  ADD COLUMN IF NOT EXISTS acquisition_source VARCHAR(30),
  ADD COLUMN IF NOT EXISTS acquisition_reference_id TEXT;

CREATE INDEX IF NOT EXISTS idx_portfolio_cards_acq_source
  ON portfolio_cards(acquisition_source, acquisition_reference_id);
