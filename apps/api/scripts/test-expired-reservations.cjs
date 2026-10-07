const {PGlite}=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const {readFileSync}=require('node:fs');const {join}=require('node:path');const assert=require('node:assert/strict');
async function main(){const db=new PGlite();try{
 await db.exec(`CREATE TABLE users(id uuid PRIMARY KEY); CREATE TABLE products(id uuid PRIMARY KEY); CREATE TABLE carts(id uuid PRIMARY KEY); CREATE TABLE customers(id uuid PRIMARY KEY); CREATE TABLE audit_logs(action text,entity_type text,entity_id text,metadata jsonb); CREATE TABLE payments(checkout_id uuid,status text);`);
 await db.exec(readFileSync(join(__dirname,'../migrations/005_inventory.sql'),'utf8'));
 await db.exec(readFileSync(join(__dirname,'../migrations/007_checkout_orders.sql'),'utf8'));
 await db.exec(readFileSync(join(__dirname,'../migrations/034_expired_reservations.sql'),'utf8'));
 const product=(await db.query('INSERT INTO products VALUES(gen_random_uuid()) RETURNING id')).rows[0].id;
 const warehouse=(await db.query("INSERT INTO warehouses(code,name) VALUES('TEST','Test') RETURNING id")).rows[0].id;
 const cart=(await db.query('INSERT INTO carts VALUES(gen_random_uuid()) RETURNING id')).rows[0].id;
 await db.query('INSERT INTO inventory(product_id,warehouse_id,physical_quantity,reserved_quantity) VALUES($1,$2,100,6)',[product,warehouse]);
 async function checkout(kind){const id=(await db.query("INSERT INTO checkout_sessions(cart_id,total_amount,expires_at) VALUES($1,10,now()+($2 * interval '1 hour')) RETURNING id",[cart,kind==='fresh'?1:-1])).rows[0].id;
 await db.query("INSERT INTO stock_reservations(product_id,warehouse_id,quantity,reference_type,reference_id,expires_at) VALUES($1,$2,1,'checkout',$3,now()+($4 * interval '1 hour'))",[product,warehouse,id,kind==='fresh'?1:-1]);
 if(['PENDING','SUCCEEDED','FAILED'].includes(kind))await db.query('INSERT INTO payments VALUES($1,$2)',[id,kind]);
 if(kind==='order')await db.query("INSERT INTO orders(order_number,checkout_id,total_amount,currency,status) VALUES('test',$1,10,'TRY','PAID')",[id]);return id;}
 const abandoned=await checkout('abandoned');const failed=await checkout('FAILED');await checkout('PENDING');await checkout('SUCCEEDED');await checkout('order');await checkout('fresh');
 const clean=async()=>(await db.query('SELECT release_expired_checkout_reservations() n')).rows[0].n;
 assert.equal(await clean(),2);assert.equal(await clean(),0);
 assert.equal((await db.query('SELECT reserved_quantity FROM inventory')).rows[0].reserved_quantity,4);
 assert.equal((await db.query('SELECT physical_quantity FROM inventory')).rows[0].physical_quantity,100);
 assert.equal((await db.query('SELECT count(*) n FROM inventory_movements')).rows[0].n,2);
 for(const id of [abandoned,failed])assert.equal((await db.query('SELECT status FROM checkout_sessions WHERE id=$1',[id])).rows[0].status,'EXPIRED');
 console.log('Reservation SQL checks passed: abandoned/failed released; pending, succeeded, ordered and fresh protected; replay safe; physical stock unchanged.');
 }finally{await db.close()}}main().catch(e=>{console.error(e);process.exitCode=1});
