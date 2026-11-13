const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require(path.resolve(process.argv[2], 'node_modules/@electric-sql/pglite'));

async function main() {
  const pg = new PGlite();
  try {
    await pg.exec(`
      CREATE TABLE products(id int PRIMARY KEY, name text);
      CREATE TABLE product_prices(id int PRIMARY KEY,product_id int,amount numeric(12,2),currency text,
        pack_size int,scope text,channel text,starts_at timestamptz,ends_at timestamptz,created_at timestamptz DEFAULT now());
      CREATE TABLE product_costs(id int PRIMARY KEY,product_id int,amount numeric(12,2),currency text,
        starts_at timestamptz,ends_at timestamptz,created_at timestamptz DEFAULT now());
      INSERT INTO products VALUES(1,'Tea'),(2,'Cap'),(3,'Gel');
      INSERT INTO product_prices(id,product_id,amount,currency,pack_size,scope,channel,starts_at,ends_at) VALUES
        (1,1,100,'TRY',1,'GLOBAL',NULL,now()-interval '1 day',NULL),
        (2,1,80,'TRY',1,'CHANNEL','PUBLIC_WEB',now()-interval '2 days',NULL),
        (3,1,999,'TRY',1,'CHANNEL','PUBLIC_WEB',now()+interval '1 day',NULL),
        (4,1,700,'TRY',5,'CHANNEL','PUBLIC_WEB',now(),NULL),
        (5,2,30,'USD',1,'GLOBAL',NULL,now(),NULL),
        (6,3,20,'TRY',1,'GLOBAL',NULL,now()-interval '2 days',now()-interval '1 day');
      INSERT INTO product_costs(id,product_id,amount,currency,starts_at,ends_at) VALUES
        (1,1,40,'TRY',now()-interval '2 days',NULL),
        (2,1,15,'TRY',now()-interval '1 day',now()-interval '1 hour'),
        (3,2,200,'TRY',now(),NULL);
    `);
    const source = fs.readFileSync(path.join(__dirname, '../apps/api/src/products/products.service.ts'), 'utf8');
    const sql = source.match(/async profitability\(\)[\s\S]*?this\.db\.query\(`([^`]+)`/)[1];
    const { rows } = await pg.query(sql);
    const tea = rows.find(row => row.id === 1);
    assert.equal(tea.sale_price, '80.00');
    assert.equal(tea.unit_cost, '40.00');
    assert.equal(tea.gross_profit, '40.00');
    assert.equal(tea.gross_margin_percent, '50.00');
    const cap = rows.find(row => row.id === 2);
    assert.equal(cap.sale_currency, 'USD');
    assert.equal(cap.cost_currency, 'TRY');
    assert.equal(cap.gross_profit, null);
    assert.equal(cap.gross_margin_percent, null);
    assert.equal(rows.find(row => row.id === 3).sale_price, null);
    console.log('Product profitability passed: site price, effective windows, single units and matching currency');
  } finally {
    await pg.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
