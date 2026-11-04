ALTER TABLE shipments ADD COLUMN tracking_checked_at timestamptz, ADD COLUMN tracking_error text, ADD COLUMN tracking_status_code text, ADD COLUMN tracking_direction_code text;
CREATE INDEX shipments_aras_tracking_idx ON shipments(tracking_checked_at NULLS FIRST) WHERE provider='aras' AND status IN ('CREATED','IN_TRANSIT','FAILED');
