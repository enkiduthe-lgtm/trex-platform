CREATE TABLE dealer_user_accounts (
  dealer_id uuid NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (dealer_id, user_id)
);

CREATE INDEX dealer_user_accounts_dealer_idx ON dealer_user_accounts(dealer_id);
