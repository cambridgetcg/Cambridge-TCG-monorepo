CREATE TABLE IF NOT EXISTS tradein_submissions (
  id SERIAL PRIMARY KEY,
  reference VARCHAR(20) UNIQUE NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'submitted',
  customer_name VARCHAR(200) NOT NULL,
  customer_email VARCHAR(200) NOT NULL,
  customer_phone VARCHAR(30),
  payment_method VARCHAR(10) NOT NULL,
  bank_sort_code VARCHAR(10),
  bank_account_number VARCHAR(10),
  delivery_method VARCHAR(10) NOT NULL,
  is_over_18 BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  quoted_cash_total NUMERIC(10,2),
  quoted_credit_total NUMERIC(10,2),
  final_total NUMERIC(10,2),
  tracking_number VARCHAR(100),
  payment_reference VARCHAR(100),
  quote_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tradein_items (
  id SERIAL PRIMARY KEY,
  submission_id INTEGER NOT NULL REFERENCES tradein_submissions(id),
  sku VARCHAR(30) NOT NULL,
  card_number VARCHAR(30),
  name TEXT,
  set_code VARCHAR(20),
  quantity INTEGER NOT NULL,
  quoted_cash_price NUMERIC(10,2),
  quoted_credit_price NUMERIC(10,2),
  accepted_qty INTEGER,
  condition_grade VARCHAR(5),
  final_unit_price NUMERIC(10,2)
);

CREATE INDEX IF NOT EXISTS tradein_submissions_email_idx ON tradein_submissions(customer_email);
CREATE INDEX IF NOT EXISTS tradein_submissions_reference_idx ON tradein_submissions(reference);
CREATE INDEX IF NOT EXISTS tradein_items_submission_idx ON tradein_items(submission_id);
