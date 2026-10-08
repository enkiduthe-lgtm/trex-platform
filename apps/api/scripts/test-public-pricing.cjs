const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
async function main() {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE products(id text PRIMARY KEY,slug text,status text,created_at timestamptz DEFAULT now());
      CREATE TABLE product_prices(id int PRIMARY KEY,product_id text,scope text,channel text,dealer_id text,dealer_level_id text,amount numeric(12,2),currency text,starts_at timestamptz,ends_at timestamptz,created_at timestamptz DEFAULT now());
      INSERT INTO products(id,slug,status) VALUES('product','tea','ACTIVE'),('draft','draft','DRAFT');
      INSERT INTO product_prices(id,product_id,scope,channel,amount,currency,starts_at,ends_at) VALUES
        (1,'product','GLOBAL',NULL,200,'TRY',now()-interval '1 hour',NULL),
        (2,'product','CHANNEL','PUBLIC_WEB',150,'TRY','2026-01-01',NULL),
        (3,'product','CHANNEL','DEALER_PORTAL',50,'TRY','2026-01-01',NULL),
        (4,'product','CHANNEL','ADMIN_ORDER',60,'TRY','2026-01-01',NULL),
        (5,'product','CHANNEL','PUBLIC_WEB',1,'TRY','2026-01-01',now()-interval '1 minute'),
        (6,'product','CHANNEL','PUBLIC_WEB',2,'TRY',now()+interval '1 hour',NULL),
        (7,'product','CHANNEL','PUBLIC_WEB',140,'TRY','2026-01-01',NULL);`);
    const products = fs.readFileSync(path.join(__dirname,'../src/products/products.service.ts'),'utf8');
    const prices = fs.readFileSync(path.join(__dirname,'../src/pricing/pricing.service.ts'),'utf8');
    const sql = text => text.match(/\.query(?:<[^>]+>)?\(`([\s\S]*?)`/)[1];
    const listSQL = sql(products.split('async listPublic()')[1]);
    const detailSQL = sql(products.split('async getPublic(')[1]);
    const resolveSQL = sql(prices.split('async resolve(')[1]);
    async function check(expected) {
      const list = (await db.query(listSQL)).rows;
      const detail = (await db.query(detailSQL,['tea'])).rows[0];
      const resolved = (await db.query(resolveSQL,['product',null,null,'PUBLIC_WEB'])).rows[0];
      assert.equal(list.length,1);
      assert.equal(list[0].sale_price,expected);
      assert.equal(detail.sale_price,expected);
      assert.equal(detail.sale_currency,'TRY');
      assert.equal(resolved.amount,expected);
    }
    await check('140.00');
    await db.exec("DELETE FROM product_prices WHERE channel='PUBLIC_WEB'");
    await check('200.00');
    assert.equal((await db.query(detailSQL,['draft'])).rows.length,0);
    console.log('Public pricing: product/list/cart rule consistency, private channels, expired/future rules, deterministic ties and global fallback passed.');
  } finally { await db.close(); }
}
main().catch(error => { console.error(error); process.exitCode=1; });
