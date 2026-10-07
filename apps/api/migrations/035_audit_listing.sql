-- Stable chronological pagination for the read-only admin audit view.
CREATE INDEX audit_logs_chronological_idx ON audit_logs(created_at DESC, id DESC);
