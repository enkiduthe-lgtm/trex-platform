CREATE TYPE shipment_status AS ENUM ('PENDING', 'CREATED', 'IN_TRANSIT', 'DELIVERED', 'FAILED', 'CANCELLED');
CREATE TABLE shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES orders(id),
  provider text NOT NULL,
  tracking_number text UNIQUE,
  status shipment_status NOT NULL DEFAULT 'PENDING',
  provider_reference text UNIQUE,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE shipment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id uuid NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  status shipment_status NOT NULL,
  provider_event_id text,
  description text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(shipment_id, provider_event_id)
);
