import * as argon2 from 'argon2';

interface BootstrapClient {
  query(sql: string, values?: unknown[]): Promise<{ rows: Array<{ id: string; role?: string }>; rowCount?: number | null }>;
}

export async function bootstrapAdminAccount(client: BootstrapClient, email: string, password: string, resetExisting = false) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || password.length < 12) throw new Error('Valid bootstrap email and password of at least 12 characters are required');
  await client.query('BEGIN');
  try {
    // Serialize initial-account attempts even when no user row exists yet.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`bootstrap-admin:${normalizedEmail}`]);
    const existing = (await client.query('SELECT id,role FROM users WHERE email=$1 FOR UPDATE', [normalizedEmail])).rows[0];
    if (existing && existing.role !== 'SUPER_ADMIN') throw new Error('Bootstrap email belongs to a non-super-admin account; no changes made');
    if (existing && !resetExisting) {
      await client.query('COMMIT');
      return { id: existing.id, outcome: 'unchanged' as const };
    }
    const hash = await argon2.hash(password, { type: argon2.argon2id });
    let id: string;
    if (existing) {
      id = existing.id;
      await client.query('UPDATE users SET password_hash=$1,is_active=true,updated_at=now() WHERE id=$2', [hash, id]);
      await client.query('UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL', [id]);
    } else {
      id = (await client.query("INSERT INTO users(email,password_hash,role) VALUES($1,$2,'SUPER_ADMIN') RETURNING id", [normalizedEmail, hash])).rows[0].id;
    }
    await client.query('INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id) VALUES($1,$2,$3,$4)',
      [id, existing ? 'user.bootstrap_password_reset' : 'user.bootstrap_super_admin', 'user', id]);
    await client.query('COMMIT');
    return { id, outcome: existing ? 'reset' as const : 'created' as const };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
