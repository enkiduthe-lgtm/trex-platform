const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
async function main() {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE customers(id int PRIMARY KEY,email text,first_name text,last_name text,phone text,is_active boolean,created_at timestamp);
      CREATE TABLE orders(id int PRIMARY KEY,customer_id int,total_amount numeric(12,2),currency text,status text);
      CREATE TABLE customer_notes(id int PRIMARY KEY,customer_id int);
      INSERT INTO customers VALUES(1,'test@example.com','Test','Customer',NULL,true,now()),(2,'empty@example.com','Empty','Customer',NULL,true,now()),(3,'cancelled@example.com','Cancelled','Customer',NULL,true,now());
      INSERT INTO orders VALUES(1,1,10,'TRY','PAID'),(2,1,10,'TRY','PENDING_PAYMENT'),
        (3,1,15,'EUR','PAID'),(4,1,20,'USD','PAID'),(5,1,999,'TRY','CANCELLED'),(6,1,999,'EUR','CANCELLED'),(7,3,100,'USD','CANCELLED');
      INSERT INTO customer_notes VALUES(1,1),(2,1),(3,1);`);
    const source = fs.readFileSync(path.join(__dirname, '../src/customers/customers.service.ts'), 'utf8');
    const sql = source.match(/this\.db\.query\(`([\s\S]*?)`\)/)[1];
    const { rows } = await db.query(sql);
    const customer = rows.find(row => row.id === 1);
    assert.equal(customer.order_count, 4);
    assert.equal(Number(customer.total_spend), 20);
    assert.equal(customer.note_count, 3);
    assert.deepEqual(customer.totals_by_currency, [
      {currency:'EUR',amount:'15.00',order_count:1},
      {currency:'TRY',amount:'20.00',order_count:2},
      {currency:'USD',amount:'20.00',order_count:1},
    ]);
    const empty = rows.find(row => row.id === 2);
    assert.equal(empty.order_count, 0);
    assert.equal(Number(empty.total_spend), 0);
    assert.equal(empty.note_count, 0);
    assert.deepEqual(empty.totals_by_currency, []);
    const cancelledOnly = rows.find(row => row.id === 3);
    assert.equal(cancelledOnly.order_count, 0);
    assert.equal(Number(cancelledOnly.total_spend), 0);
    assert.deepEqual(cancelledOnly.totals_by_currency, []);
    console.log('Customer totals: separate TRY/EUR/USD, cancelled exclusion, pending inclusion, multiple notes and empty customers passed.');
  } finally { await db.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
