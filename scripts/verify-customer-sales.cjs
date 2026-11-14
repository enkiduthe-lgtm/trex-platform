const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require(path.resolve(process.argv[2], 'node_modules/@electric-sql/pglite'));

async function main() {
  const pg = new PGlite();
  try {
    await pg.exec(`
      CREATE TABLE customers(id int PRIMARY KEY,email text,first_name text,last_name text,phone text,is_active boolean,created_at timestamptz DEFAULT now());
      CREATE TABLE customer_notes(customer_id int);
      CREATE TABLE customer_loyalty_accounts(customer_id int,points_balance int,tier text);
      CREATE TABLE customer_tags(id int,name text,color text);
      CREATE TABLE customer_tag_assignments(customer_id int,tag_id int);
      CREATE TABLE orders(id int PRIMARY KEY,customer_id int,order_number text,status text,total_amount numeric(12,2),currency text,
        created_at timestamptz DEFAULT now(),archived_at timestamptz,checkout_id int,sales_channel text);
      CREATE TABLE order_items(id int PRIMARY KEY,order_id int,quantity int,product_name text,sku text,unit_amount numeric(12,2));
      CREATE TABLE returns(id int PRIMARY KEY,order_id int,status text);
      CREATE TABLE return_items(return_id int,order_item_id int,quantity int);
      CREATE TABLE payments(id int,checkout_id int,provider text,created_at timestamptz);
      INSERT INTO customers(id,email) VALUES(1,'one@example.test'),(2,'two@example.test');
      INSERT INTO orders(id,customer_id,order_number,status,total_amount,currency,archived_at) VALUES
        (1,1,'ACTIVE','DELIVERED',120,'TRY',NULL),
        (2,1,'FULL-RETURN','DELIVERED',50,'TRY',NULL),
        (3,1,'ARCHIVED','PAID',99,'TRY',now()),
        (4,1,'EURO','PAID',10,'EUR',NULL),
        (5,2,'OTHER','PAID',25,'TRY',NULL);
      INSERT INTO order_items VALUES(1,1,2,'Tea','T',60),(2,2,1,'Cap','C',50),(3,3,1,'Gel','G',99),(4,4,1,'Tea','T',10);
      INSERT INTO returns VALUES(1,1,'REFUNDED'),(2,2,'REFUNDED');
      INSERT INTO return_items VALUES(1,1,1),(2,2,1);
    `);
    const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    const reportSql = read('apps/api/src/orders/report-order-status.ts');
    const sql = name => reportSql.match(new RegExp(`export const ${name} = \x60([^\x60]+)\x60`))[1];
    const status = sql('reportOrderStatus').replace('${netItemQuantity}', sql('netItemQuantity'));
    const source = read('apps/api/src/customers/customers.service.ts');
    const query = method => source.slice(source.indexOf('async '+method+'(')).match(/this\.db\.query\(`([^`]+)`/)[1]
      .replaceAll('${reportOrderStatus}',status);
    const customers = (await pg.query(query('list'))).rows;
    const one = customers.find(row => row.id === 1);
    assert.equal(one.total_spend,'120.00');
    assert.equal(one.order_count,2);
    assert.equal(one.totals_by_currency.find(row=>row.currency==='EUR').amount,'10.00');
    const orders = (await pg.query(query('orders'),[1])).rows;
    assert.equal(orders.length,3);
    assert.equal(orders.find(row=>row.id===2).status,'REFUNDED');
    assert.equal(orders.find(row=>row.id===1).status,'DELIVERED');
    const lines = (await pg.query(query('orderReport'),[1,null,null])).rows;
    assert.equal(lines.length,3);
    assert.equal(lines.find(row=>row.order_number==='FULL-RETURN').status,'REFUNDED');
    assert(!lines.some(row=>['ARCHIVED','OTHER'].includes(row.order_number)));
    console.log('Customer sales passed: full/partial returns, archived orders, currency separation and customer isolation.');
  } finally {
    await pg.close();
  }
}

main().catch(error=>{console.error(error);process.exitCode=1;});
