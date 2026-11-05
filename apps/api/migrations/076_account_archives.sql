ALTER TABLE users ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE dealers ADD COLUMN IF NOT EXISTS archived_at timestamptz;
