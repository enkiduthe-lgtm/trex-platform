CREATE TABLE staff_access_profiles (
 user_id uuid PRIMARY KEY REFERENCES users(id),
 grants text[] NOT NULL DEFAULT '{}',
 updated_by uuid NOT NULL REFERENCES users(id),
 updated_at timestamptz NOT NULL DEFAULT now()
);
-- Explicitly requested owner account only; preserve passwords, data and other roles.
WITH promoted AS (
 UPDATE users SET role='SUPER_ADMIN',is_active=true,updated_at=now()
 WHERE lower(email)='theenkidu@hotmail.com' AND role IN ('SUPER_ADMIN','ADMIN','FINANCE','WAREHOUSE') AND (role<>'SUPER_ADMIN' OR is_active=false)
 RETURNING id
)
INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata)
SELECT id,'staff.director.assigned','user',id,'{"requestedRole":"Müdür","source":"Explicit Owner Request"}'::jsonb FROM promoted;
