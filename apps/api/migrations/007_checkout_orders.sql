CREATE TYPE checkout_status AS ENUM ('OPEN', 'COMPLETED', 'EXPIRED');
CREATE TABLE checkout_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id uuid NOT NULL REFERENCES carts(id),
  status checkout_status NOT NULL DEFAULT 'OPEN',
  total_amount numeric(12,2) NOT NULL CHECK (total_amount >= 0),
  currency char(3) NOT NULL DEFAULT 'TRY',
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE TABLE checkout_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_id uuid NOT NULL REFERENCES checkout_sessions(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id),
  product_name text NOT NULL,
  sku text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_amount numeric(12,2) NOT NULL CHECK (unit_amount >= 0),
  currency char(3) NOT NULL
);
CREATE TABLE checkout_addresses (
  checkout_id uuid PRIMARY KEY REFERENCES checkout_sessions(id) ON DELETE CASCADE,
  recipient_name text NOT NULL,
  phone text NOT NULL,
  city text NOT NULL,
  district text NOT NULL,
  address_line text NOT NULL,
  postal_code text
);
CREATE TABLE idempotency_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  request_hash text NOT NULL,
  resource_type text NOT NULL,
  resource_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE TYPE order_status AS ENUM ('PENDING_PAYMENT', 'PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED');
CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL UNIQUE,
  checkout_id uuid NOT NULL UNIQUE REFERENCES checkout_sessions(id),
  customer_id uuid REFERENCES customers(id),
  status order_status NOT NULL DEFAULT 'PENDING_PAYMENT',
  total_amount numeric(12,2) NOT NULL CHECK (total_amount >= 0),
  currency char(3) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id),
  product_name text NOT NULL,
  sku text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_amount numeric(12,2) NOT NULL,
  currency char(3) NOT NULL
);
CREATE TABLE order_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  recipient_name text NOT NULL,
  phone text NOT NULL,
  city text NOT NULL,
  district text NOT NULL,
  address_line text NOT NULL,
  postal_code text
);
CREATE TABLE order_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status order_status NOT NULL,
  actor_user_id uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
