ALTER TABLE shipments ADD COLUMN IF NOT EXISTS label_url text;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS label_format text;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS provider_payload jsonb;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS dispatched_at timestamptz;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS delivered_at timestamptz;
CREATE INDEX IF NOT EXISTS shipments_provider_status_idx ON shipments(provider,status,created_at DESC);
CREATE INDEX IF NOT EXISTS shipment_events_shipment_occurred_idx ON shipment_events(shipment_id,occurred_at DESC);
