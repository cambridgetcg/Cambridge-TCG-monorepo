-- Quotation workflow for trade-in submissions

-- Per-item admin pricing
ALTER TABLE tradein_items ADD COLUMN IF NOT EXISTS admin_price NUMERIC(10,2);
ALTER TABLE tradein_items ADD COLUMN IF NOT EXISTS admin_condition VARCHAR(10);
ALTER TABLE tradein_items ADD COLUMN IF NOT EXISTS admin_notes TEXT;
ALTER TABLE tradein_items ADD COLUMN IF NOT EXISTS rejected BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE tradein_items ADD COLUMN IF NOT EXISTS payout_type VARCHAR(10);

-- Submission-level quotation fields
ALTER TABLE tradein_submissions ADD COLUMN IF NOT EXISTS payout_type VARCHAR(10);
ALTER TABLE tradein_submissions ADD COLUMN IF NOT EXISTS cash_amount NUMERIC(10,2);
ALTER TABLE tradein_submissions ADD COLUMN IF NOT EXISTS credit_amount NUMERIC(10,2);
ALTER TABLE tradein_submissions ADD COLUMN IF NOT EXISTS admin_message TEXT;
ALTER TABLE tradein_submissions ADD COLUMN IF NOT EXISTS quoted_at TIMESTAMPTZ;
ALTER TABLE tradein_submissions ADD COLUMN IF NOT EXISTS customer_responded_at TIMESTAMPTZ;
ALTER TABLE tradein_submissions ADD COLUMN IF NOT EXISTS mint_bonus_applied BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE tradein_submissions ADD COLUMN IF NOT EXISTS mint_bonus_amount NUMERIC(10,2);
