const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require(path.resolve(process.argv[2], 'node_modules/@electric-sql/pglite'));

async function main() {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE TABLE orders(id int PRIMARY KEY,order_number text,checkout_id int,status text,archived_at timestamptz,created_at timestamptz DEFAULT now());
      CREATE TABLE warehouses(id int PRIMARY KEY,name text);
      CREATE TABLE stock_reservations(reference_type text,reference_id int,status text,warehouse_id int);
      CREATE TABLE order_items(order_id int,quantity int);
      CREATE TABLE picking_sessions(id int,order_id int,status text);
      CREATE TABLE packing_sessions(picking_session_id int,packed_at timestamptz);
      CREATE TABLE returns(status text);
      CREATE TABLE inventory(product_id int,warehouse_id int,physical_quantity int,reserved_quantity int);
      CREATE TABLE inventory_reorder_levels(product_id int,warehouse_id int,minimum_quantity int);
      INSERT INTO orders(id,order_number,checkout_id,status,archived_at) VALUES
        (1,'ACTIVE',1,'PAID',NULL),(2,'ARCHIVED',2,'PAID',now()),(3,'PICKING',3,'PAID',NULL),(4,'ARCHIVED-PICK',4,'PAID',now());
      INSERT INTO warehouses VALUES (1,'Ana Depo');
      INSERT INTO stock_reservations VALUES ('checkout',1,'ACTIVE',1),('checkout',1,'ACTIVE',1),('checkout',2,'ACTIVE',1);
      INSERT INTO order_items VALUES (1,3),(1,2),(2,99);
      INSERT INTO picking_sessions VALUES (1,3,'OPEN'),(2,4,'IN_PROGRESS');
    `);
    const source = fs.readFileSync(path.join(__dirname,'../apps/api/src/warehouse/warehouse.service.ts'),'utf8');
    function sql(method) {
      return source.slice(source.indexOf('async '+method+'(')).match(/this\.db\.query[^\x60]*\x60([^\x60]+)\x60/)[1];
    }
    const queue = (await db.query(sql('listPickQueue'))).rows;
    assert.deepEqual(queue,[{id:1,order_number:'ACTIVE',warehouse_name:'Ana Depo',item_count:5}]);
    const dashboard = (await db.query(sql('dashboard'))).rows[0];
    assert.equal(dashboard.waiting,'2');
    assert.equal(dashboard.picking,'1');
    await db.exec('UPDATE orders SET archived_at=NULL WHERE id=2');
    assert.equal((await db.query(sql('listPickQueue'))).rows.length,2);
    console.log('Warehouse queue passed: no duplicated quantities, archived orders excluded, restored orders visible.');
  } finally {
    await db.close();
  }
}

main().catch(error=>{console.error(error);process.exitCode=1;});
