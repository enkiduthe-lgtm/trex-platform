const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
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

    await db.exec(`
      ALTER TABLE packing_sessions ADD COLUMN id int, ADD COLUMN package_barcode text UNIQUE,
        ADD COLUMN verification_code text, ADD COLUMN packed_by int;
      ALTER TABLE picking_sessions ADD COLUMN warehouse_id int;
      ALTER TABLE order_items ADD COLUMN product_id int;
      ALTER TABLE stock_reservations ADD COLUMN id int, ADD COLUMN product_id int, ADD COLUMN quantity int;
      ALTER TABLE inventory ADD COLUMN updated_at timestamptz;
      CREATE TABLE inventory_lots(id int,product_id int,warehouse_id int,available_quantity int,expiry_date date,created_at timestamptz);
      CREATE TABLE inventory_movements(product_id int,warehouse_id int,movement_type text,quantity_delta int,reference_type text,reference_id int,created_by int);
      CREATE TABLE audit_logs(actor_user_id int,action text,entity_type text,entity_id int,metadata jsonb);
      INSERT INTO packing_sessions(picking_session_id,id,package_barcode) VALUES (999,999,'TRX-PKG-2000000000000');
      INSERT INTO orders(id,order_number,checkout_id,status) VALUES (5,'PACK-A',5,'PAID'),(6,'PACK-B',6,'PROCESSING'),(7,'MISSING',7,'PAID');
      INSERT INTO picking_sessions VALUES (5,5,'COMPLETED',1),(6,6,'COMPLETED',1),(7,7,'COMPLETED',1);
      INSERT INTO packing_sessions(picking_session_id,id) VALUES (5,5),(6,6),(7,7);
      INSERT INTO order_items VALUES (5,1,1),(5,1,1),(6,2,1),(7,2,1);
      INSERT INTO stock_reservations VALUES ('checkout',5,'ACTIVE',1,5,1,2),('checkout',6,'ACTIVE',1,6,1,2),('checkout',7,'ACTIVE',1,7,1,1);
      INSERT INTO inventory VALUES (1,1,8,5,NULL);
      INSERT INTO inventory_lots VALUES (1,1,1,8,NULL,now());
    `);
    await db.exec(fs.readFileSync(path.join(__dirname,'../apps/api/migrations/079_packing_barcode_sequence.sql'),'utf8'));
    const box = { exports:{}, require(name) {
      if (name === '@nestjs/common') return {Injectable:()=>type=>type,ConflictException:Error,NotFoundException:Error};
      return {};
    }};
    vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,experimentalDecorators:true}}).outputText,box);
    const warehouse = new box.exports.WarehouseService({
      transaction: work => db.transaction(async tx => work({
        query: async (statement,params) => {
          const result = await tx.query(statement,params);
          return {...result,rowCount:result.rows.length || result.affectedRows};
        },
      })),
    });
    const first = await warehouse.completePacking(5,1);
    const second = await warehouse.completePacking(6,1);
    assert.equal(first.packageBarcode,'TRX-PKG-2000000000001');
    assert.equal(second.packageBarcode,'TRX-PKG-2000000000002');
    assert.equal((await warehouse.completePacking(5,1)).packageBarcode,first.packageBarcode);
    await assert.rejects(()=>warehouse.completePacking(7,1),/sipariş ürünleriyle eşleşmiyor/);
    assert.deepEqual((await db.query('SELECT physical_quantity,reserved_quantity FROM inventory')).rows,[{physical_quantity:4,reserved_quantity:1}]);
    assert.deepEqual((await db.query('SELECT count(*)::int AS packages FROM packing_sessions WHERE packed_at IS NOT NULL AND package_barcode=verification_code')).rows,[{packages:2}]);
    console.log('Packing passed: existing barcode preserved, unique new barcodes, correct stock deductions, safe retry and partial reservation rejected.');
  } finally {
    await db.close();
  }
}

main().catch(error=>{console.error(error);process.exitCode=1;});
