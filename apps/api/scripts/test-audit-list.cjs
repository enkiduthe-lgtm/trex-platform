const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
async function main() {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE users(id uuid PRIMARY KEY,role text);
      CREATE TABLE audit_logs(id uuid PRIMARY KEY,actor_user_id uuid REFERENCES users(id),action text,entity_type text,entity_id text,metadata jsonb,created_at timestamptz);
      INSERT INTO users VALUES('00000000-0000-0000-0000-000000000001','ADMIN');
      INSERT INTO audit_logs SELECT md5(n::text)::uuid,CASE WHEN n%2=0 THEN NULL ELSE '00000000-0000-0000-0000-000000000001'::uuid END,
        'order.admin.updated','order','test-order','{"secret":"private-contact"}', '2026-10-07T12:00:00Z' FROM generate_series(1,55) n;`);
    await db.exec(fs.readFileSync(path.join(__dirname, '../migrations/035_audit_listing.sql'), 'utf8'));
    const source = fs.readFileSync(path.join(__dirname, '../src/auth/audit.controller.ts'), 'utf8');
    const sql = source.match(/this\.db\.query\(`([\s\S]*?)`/)[1];
    const first = (await db.query(sql, [null, null, null, 0])).rows;
    const second = (await db.query(sql, [null, null, null, 50])).rows;
    assert.equal(first.length, 51);
    assert.equal(second.length, 5);
    assert.equal(new Set([...first.slice(0,50), ...second].map(row => row.id)).size, 55);
    assert(first.some(row => row.actor_role === 'SYSTEM'));
    assert(first.some(row => row.actor_role === 'ADMIN'));
    assert(first.every(row => !('metadata' in row) && !('email' in row)));
    assert.equal((await db.query(sql, ["' OR true --", null, null, 0])).rows.length, 0);
    assert.equal((await db.query(sql, ['order.admin.updated', 'order', 'missing', 0])).rows.length, 0);
    assert.equal((await db.query(sql, ['order.admin.updated', 'order', 'test-order', 50])).rows.length, 5);
    console.log('Audit listing: migration, stable pagination, exact filters and private metadata exclusion passed.');
  } finally { await db.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
