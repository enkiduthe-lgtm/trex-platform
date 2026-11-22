CREATE TABLE IF NOT EXISTS background_job_leases (
  name text PRIMARY KEY,
  owner_token uuid NOT NULL,
  lease_until timestamptz NOT NULL
);
