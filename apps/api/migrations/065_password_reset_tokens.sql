CREATE TABLE password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  requested_ip inet,
  requested_user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX password_reset_tokens_active_user_idx
  ON password_reset_tokens(user_id, expires_at DESC)
  WHERE used_at IS NULL;
