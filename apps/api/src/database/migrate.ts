import { createHash } from 'crypto';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { Client } from 'pg';

const migrationsDirectory = join(process.cwd(), 'migrations');
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required');

async function main() {
  console.log('Connecting to PostgreSQL for migrations...');
  const client = new Client({ connectionString, connectionTimeoutMillis: 15_000 });
  await client.connect();
  try {
    const files = (await readdir(migrationsDirectory)).filter((name) => name.endsWith('.sql')).sort();
    const tableExists = await client.query("SELECT to_regclass('public.schema_migrations') IS NOT NULL AS exists");
    const applied = new Map<string, string>();
    if (tableExists.rows[0].exists) {
      for (const row of (await client.query<{ name: string; checksum: string }>('SELECT name, checksum FROM schema_migrations')).rows) applied.set(row.name, row.checksum);
    }
    const pending: Array<{ name: string; sql: string; checksum: string }> = [];
    for (const name of files) {
      const sql = await readFile(join(migrationsDirectory, name), 'utf8'); const checksum = createHash('sha256').update(sql).digest('hex');
      if (applied.has(name) && applied.get(name) !== checksum) throw new Error(`Checksum mismatch for applied migration ${name}`);
      if (!applied.has(name)) pending.push({ name, sql, checksum });
    }
    if (process.argv[2] === 'status') { console.log(JSON.stringify({ applied: applied.size, pending: pending.map((m) => m.name) }, null, 2)); return; }
    for (const migration of pending) {
      const hasEnumValueAddition = /ALTER\s+TYPE\s+[^;]+\s+ADD\s+VALUE/i.test(migration.sql);
      if (hasEnumValueAddition) {
        // PostgreSQL makes a newly-added enum value usable only after commit.
        // Run the simple statements separately so a later INSERT can reference it.
        const statements = migration.sql.split(';').map((statement) => statement.trim()).filter(Boolean);
        for (const statement of statements) await client.query(statement);
        await client.query('INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)', [migration.name, migration.checksum]);
        console.log(`Applied ${migration.name}`);
        continue;
      }
      await client.query('BEGIN');
      try { await client.query(migration.sql); await client.query('INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)', [migration.name, migration.checksum]); await client.query('COMMIT'); console.log(`Applied ${migration.name}`); }
      catch (error) { await client.query('ROLLBACK'); throw error; }
    }
  } finally {
    await client.end();
    console.log('PostgreSQL migration check completed.');
  }
}
void main().catch((error: unknown) => {
  console.error('PostgreSQL migration failed.', error);
  process.exitCode = 1;
});
