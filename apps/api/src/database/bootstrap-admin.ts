import { Client } from 'pg';
import { bootstrapAdminAccount } from './bootstrap-admin-account';

const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
const resetExisting = process.env.BOOTSTRAP_ADMIN_RESET_PASSWORD === 'true';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
if (!email || !password) throw new Error('BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD are required');
const bootstrapPassword: string = password;
if (bootstrapPassword.length < 12) throw new Error('BOOTSTRAP_ADMIN_PASSWORD must contain at least 12 characters');

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL }); await client.connect();
  try {
    const result = await bootstrapAdminAccount(client, email!, bootstrapPassword, resetExisting);
    console.log(`SUPER_ADMIN bootstrap: ${result.outcome} (${result.id})`);
  } finally { await client.end(); }
}
void main().catch(() => { console.error('SUPER_ADMIN bootstrap failed; account changes were not applied.'); process.exitCode=1; });
