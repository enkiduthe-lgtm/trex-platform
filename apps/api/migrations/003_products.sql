CREATE TYPE product_status AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text NOT NULL UNIQUE,
  barcode text UNIQUE,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  status product_status NOT NULL DEFAULT 'DRAFT',
  version integer NOT NULL DEFAULT 1,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT products_sku_not_blank CHECK (length(trim(sku)) > 0),
  CONSTRAINT products_name_not_blank CHECK (length(trim(name)) > 0),
  CONSTRAINT products_slug_format CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);
CREATE INDEX products_public_idx ON products(status, created_at DESC) WHERE status = 'ACTIVE';
