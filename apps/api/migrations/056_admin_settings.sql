CREATE TABLE admin_settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users(id)
);
INSERT INTO admin_settings(singleton) VALUES (true) ON CONFLICT DO NOTHING;
