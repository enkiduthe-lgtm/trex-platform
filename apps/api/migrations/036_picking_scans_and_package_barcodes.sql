CREATE TABLE IF NOT EXISTS picking_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  picking_session_id uuid NOT NULL REFERENCES picking_sessions(id) ON DELETE CASCADE,
  picking_item_id uuid NOT NULL REFERENCES picking_items(id) ON DELETE CASCADE,
  barcode text NOT NULL,
  scanned_by uuid REFERENCES users(id),
  scanned_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS picking_scans_session_idx ON picking_scans(picking_session_id, scanned_at DESC);

ALTER TABLE packing_sessions ADD COLUMN IF NOT EXISTS package_barcode text;
CREATE UNIQUE INDEX IF NOT EXISTS packing_sessions_package_barcode_unique
  ON packing_sessions(package_barcode) WHERE package_barcode IS NOT NULL;
