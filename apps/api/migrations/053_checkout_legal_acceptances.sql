CREATE TABLE checkout_legal_acceptances (
  checkout_id uuid NOT NULL REFERENCES checkout_sessions(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES legal_documents(id),
  document_code text NOT NULL,
  document_version text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (checkout_id, document_id)
);
CREATE INDEX checkout_legal_acceptances_checkout_idx ON checkout_legal_acceptances(checkout_id);
