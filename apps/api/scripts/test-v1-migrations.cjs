const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const modulePath = process.env.PGLITE_MODULE || '@electric-sql/pglite';
const { PGlite } = require(modulePath);
const { citext } = require(path.isAbsolute(modulePath)
  ? path.join(modulePath, 'dist/contrib/citext.cjs') : '@electric-sql/pglite/contrib/citext');

async function main() {
  const db = new PGlite({ extensions: { citext } });
  try {
    const directory = path.join(__dirname, '../migrations');
    const files = fs.readdirSync(directory).filter(name => name.endsWith('.sql')).sort();
    for (const name of files) {
      const original = fs.readFileSync(path.join(directory, name), 'utf8');
      // PGlite lacks pgcrypto; UUID generation is available in PostgreSQL core.
      // This smoke test does NOT certify extension installation on hosted PostgreSQL.
      const sql = original.replace(/^CREATE EXTENSION IF NOT EXISTS pgcrypto;\s*/m, '');
      if (/ALTER\s+TYPE\s+[^;]+\s+ADD\s+VALUE/i.test(sql)) {
        for (const statement of sql.split(';').map(value => value.trim()).filter(Boolean)) await db.exec(statement);
      } else await db.exec(sql);
      await db.query('INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)',
        [name, createHash('sha256').update(original).digest('hex')]);
    }
    assert.equal(Number((await db.query('SELECT count(*) AS count FROM schema_migrations')).rows[0].count), files.length);
    for (const name of ['users', 'sessions', 'products', 'customers', 'dealers', 'orders', 'order_items', 'payments', 'warehouses', 'inventory', 'inventory_movements', 'audit_logs']) {
      assert.equal((await db.query('SELECT to_regclass($1) IS NOT NULL AS present', [name])).rows[0].present, true, name);
    }
    assert.deepEqual((await db.query('SELECT code FROM sales_channels ORDER BY code::text')).rows.map(row => row.code), ['ADMIN_ORDER', 'DEALER_PORTAL', 'MARKETPLACE', 'PUBLIC_WEB', 'WHOLESALE']);
    assert.equal(Number((await db.query('SELECT count(*) AS count FROM users')).rows[0].count), 0, 'No default password or user may be seeded');
    const product = (await db.query("INSERT INTO products(sku,slug,name,status) VALUES ('TEST','test','Test','ACTIVE') RETURNING id")).rows[0].id;
    const inactive = (await db.query("INSERT INTO products(sku,slug,name,status) VALUES ('DRAFT','draft','Draft','DRAFT') RETURNING id")).rows[0].id;
    const cart = (await db.query("INSERT INTO carts(session_key_hash,expires_at) VALUES ('isolated-test',now()+interval '1 hour') RETURNING id")).rows[0].id;
    await db.query('INSERT INTO cart_items(cart_id,product_id,quantity) VALUES($1,$2,2),($1,$3,1)', [cart,product,inactive]);
    const source = fs.readFileSync(path.join(__dirname, '../src/checkout/checkout.service.ts'), 'utf8');
    const itemSql = source.match(/client\.query<CartItem>\("([^"]+)"/)[1];
    const items = (await db.query(itemSql,[cart])).rows;
    assert.equal(items.length,2,'Inactive cart items must remain visible to checkout validation');
    assert(items.some(item=>item.status==='DRAFT'));
    const warehouse = (await db.query("INSERT INTO warehouses(code,name) VALUES ('TEST','Isolated test') RETURNING id")).rows[0].id;
    const warehouseSql = source.match(/client\.query\('(SELECT id FROM warehouses[^']+)'/)[1];
    assert.equal((await db.query(warehouseSql,[warehouse])).rows.length,1);
    await db.query('UPDATE warehouses SET is_active=false WHERE id=$1',[warehouse]);
    assert.equal((await db.query(warehouseSql,[warehouse])).rows.length,0);
    console.log('Checkout SQL: inactive products retained for validation and inactive warehouses rejected.');
    console.log(`V1 schema smoke test passed: ${files.length} migrations and sales-channel seed. Hosted PostgreSQL extension/runner rehearsal remains required.`);
  } finally { await db.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
