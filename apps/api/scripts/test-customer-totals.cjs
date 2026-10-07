const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
async function main() {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE customers(id int PRIMARY KEY,email text,first_name text,last_name text,phone text,is_active boolean,created_at timestamp);
      CREATE TABLE orders(id int PRIMARY KEY,customer_id int,total_amount numeric(12,2));
      CREATE TABLE customer_notes(id int PRIMARY KEY,customer_id int);
      INSERT INTO customers VALUES(1,'test@example.com','Test','Customer',NULL,true,now()),(2,'empty@example.com','Empty','Customer',NULL,true,now());
      INSERT INTO orders VALUES(1,1,10),(2,1,10);
      INSERT INTO customer_notes VALUES(1,1),(2,1),(3,1);`);
    const source = fs.readFileSync(path.join(__dirname, '../src/customers/customers.service.ts'), 'utf8');
    const sql = source.match(/this\.db\.query\(`([\s\S]*?)`\)/)[1];
    const { rows } = await db.query(sql);
    const customer = rows.find(row => row.id === 1);
    assert.equal(customer.order_count, 2);
    assert.equal(Number(customer.total_spend), 20);
    assert.equal(customer.note_count, 3);
    const empty = rows.find(row => row.id === 2);
    assert.equal(empty.order_count, 0);
    assert.equal(Number(empty.total_spend), 0);
    assert.equal(empty.note_count, 0);
    console.log('Customer totals: multiple notes, equal-price orders and empty customers passed.');
  } finally { await db.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
