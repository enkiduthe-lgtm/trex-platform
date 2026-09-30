import * as argon2 from 'argon2';
import { Client } from 'pg';

const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
if (!email || !password) throw new Error('BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD are required');
const bootstrapPassword: string = password;
if (bootstrapPassword.length < 12) throw new Error('BOOTSTRAP_ADMIN_PASSWORD must contain at least 12 characters');

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL }); await client.connect();
  try {
    const existing = await client.query('SELECT id FROM users WHERE email=$1', [email]);
    if (existing.rowCount) { console.log('Admin already exists; no change made.'); return; }
    const passwordHash = await argon2.hash(bootstrapPassword, { type: argon2.argon2id });
    const created = await client.query<{ id: string }>("INSERT INTO users (email,password_hash,role) VALUES ($1,$2,'SUPER_ADMIN') RETURNING id", [email, passwordHash]);
    await client.query('INSERT INTO audit_logs (actor_user_id,action,entity_type,entity_id) VALUES ($1,$2,$3,$4)', [created.rows[0].id, 'user.bootstrap_super_admin', 'user', created.rows[0].id]);
    console.log(`Created SUPER_ADMIN ${created.rows[0].id}`);
  } finally { await client.end(); }
}
void main();
