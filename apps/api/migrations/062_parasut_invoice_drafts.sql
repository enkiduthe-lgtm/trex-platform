CREATE TYPE invoice_customer_type AS ENUM ('INDIVIDUAL', 'CORPORATE');
CREATE TYPE invoice_provider_status AS ENUM ('DRAFT', 'PENDING_PROVIDER', 'ISSUED', 'FAILED', 'CANCELLED');

CREATE TABLE order_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES orders(id),
  customer_type invoice_customer_type NOT NULL,
  recipient_name text NOT NULL,
  identity_number varchar(11),
  company_name text,
  tax_number varchar(10),
  tax_office text,
  billing_address text NOT NULL,
  billing_city text,
  billing_district text,
  provider varchar(32) NOT NULL DEFAULT 'PARASUT',
  provider_status invoice_provider_status NOT NULL DEFAULT 'DRAFT',
  provider_invoice_id text,
  invoice_number text,
  pdf_url text,
  provider_payload jsonb,
  failure_reason text,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((customer_type='INDIVIDUAL' AND identity_number IS NOT NULL AND company_name IS NULL AND tax_number IS NULL) OR (customer_type='CORPORATE' AND company_name IS NOT NULL AND tax_number IS NOT NULL))
);
CREATE INDEX order_invoices_status_idx ON order_invoices(provider_status, created_at DESC);
