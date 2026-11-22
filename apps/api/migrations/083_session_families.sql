-- Keep rotations from one login together so logout can revoke an in-flight replacement.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS family_id uuid NOT NULL DEFAULT gen_random_uuid();
CREATE INDEX IF NOT EXISTS sessions_user_family_idx ON sessions(user_id,family_id);
