CREATE TYPE return_status AS ENUM ('REQUESTED', 'APPROVED', 'RECEIVED', 'INSPECTED', 'REFUNDED', 'REJECTED', 'CANCELLED');
CREATE TABLE returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id),
  status return_status NOT NULL DEFAULT 'REQUESTED',
  reason text NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  received_at timestamptz,
  completed_at timestamptz
);
CREATE TABLE return_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id uuid NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
  order_item_id uuid NOT NULL REFERENCES order_items(id),
  quantity integer NOT NULL CHECK (quantity > 0),
  condition_notes text,
  UNIQUE(return_id, order_item_id)
);
CREATE TABLE return_inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id uuid NOT NULL UNIQUE REFERENCES returns(id) ON DELETE CASCADE,
  accepted boolean NOT NULL,
  notes text,
  inspected_by uuid REFERENCES users(id),
  inspected_at timestamptz NOT NULL DEFAULT now()
);
