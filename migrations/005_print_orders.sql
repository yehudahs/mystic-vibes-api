CREATE TABLE IF NOT EXISTS print_orders (
  id                  SERIAL PRIMARY KEY,
  user_id             UUID REFERENCES users(id) ON DELETE SET NULL,
  stripe_session_id   VARCHAR(255) UNIQUE,
  printful_file_id    VARCHAR(255),
  printful_file_url   TEXT,
  product_id          INTEGER NOT NULL,
  variant_id          INTEGER NOT NULL,
  tagline             TEXT,
  retail_price_cents  INTEGER NOT NULL,
  currency            VARCHAR(10) NOT NULL DEFAULT 'usd',
  printful_order_id   VARCHAR(255),
  status              VARCHAR(50) NOT NULL DEFAULT 'pending_payment',
  created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_print_orders_stripe_session ON print_orders(stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_print_orders_user_id ON print_orders(user_id);
