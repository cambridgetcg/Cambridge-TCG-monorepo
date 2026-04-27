DO $$ BEGIN
  CREATE TYPE quote_status AS ENUM ('pending', 'quoted', 'accepted', 'declined', 'expired', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS quote_requests (
  id SERIAL PRIMARY KEY,
  reference VARCHAR(20) UNIQUE NOT NULL,
  status quote_status NOT NULL DEFAULT 'pending',
  customer_name VARCHAR(200) NOT NULL,
  customer_email VARCHAR(200) NOT NULL,
  customer_phone VARCHAR(30),
  payment_method VARCHAR(10) NOT NULL DEFAULT 'credit',
  delivery_method VARCHAR(10) NOT NULL DEFAULT 'mail',
  notes TEXT,
  admin_notes TEXT,
  quoted_total NUMERIC(10,2),
  offer_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quote_items (
  id SERIAL PRIMARY KEY,
  request_id INT NOT NULL REFERENCES quote_requests(id) ON DELETE CASCADE,
  description VARCHAR(500) NOT NULL,
  game VARCHAR(50),
  set_name VARCHAR(100),
  condition VARCHAR(10) NOT NULL DEFAULT 'NM',
  quantity INT NOT NULL DEFAULT 1,
  customer_notes TEXT,
  offered_price NUMERIC(10,2),
  admin_notes TEXT,
  rejected BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS quote_images (
  id SERIAL PRIMARY KEY,
  item_id INT NOT NULL REFERENCES quote_items(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  s3_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quote_requests_email ON quote_requests(customer_email);
CREATE INDEX IF NOT EXISTS idx_quote_requests_reference ON quote_requests(reference);
CREATE INDEX IF NOT EXISTS idx_quote_requests_status ON quote_requests(status);
CREATE INDEX IF NOT EXISTS idx_quote_items_request ON quote_items(request_id);
CREATE INDEX IF NOT EXISTS idx_quote_images_item ON quote_images(item_id);
