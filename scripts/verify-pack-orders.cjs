const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict'),{randomUUID}=require('crypto'),{createRequire}=require('module');
const root=path.resolve(__dirname,'..'),runtime=path.resolve(process.argv[2]),rr=createRequire(path.join(runtime,'package.json')),ts=rr('typescript'),{PGlite}=require(path.join(process.argv[3],'node_modules/@electric-sql/pglite'));
const cache=new Map();function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file);const box={exports:{},require(name){if(name==='@nestjs/common')return {Injectable:()=>t=>t,BadRequestException:Error,ConflictException:Error,ForbiddenException:Error,NotFoundException:Error};return name.startsWith('.')?load(path.resolve(path.dirname(file),name+'.ts')):rr(name);}};cache.set(file,box.exports);vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,experimentalDecorators:true}}).outputText,box);return box.exports;}
async function main(){const pg=new PGlite();try{
 await pg.exec(`CREATE DOMAIN citext AS text;CREATE TABLE users(id uuid PRIMARY KEY);CREATE TABLE products(id uuid PRIMARY KEY,name text,sku text,status text);CREATE TABLE audit_logs(id uuid DEFAULT gen_random_uuid(),actor_user_id uuid,action text,entity_type text,entity_id uuid,metadata jsonb,created_at timestamptz DEFAULT now());`);
 for(const name of ['004_pricing.sql','005_inventory.sql','006_customers_carts.sql','007_checkout_orders.sql','008_payments.sql','028_sales_channel_orders.sql','031_checkout_contact.sql']){const sql=fs.readFileSync(path.join(root,'apps/api/migrations',name),'utf8');if(name==='028_sales_channel_orders.sql'){for(const part of sql.split(';').filter(s=>s.trim()))await pg.exec(part);}else await pg.exec(sql);}
 await pg.exec("ALTER TYPE sales_channel_code ADD VALUE IF NOT EXISTS 'RETAIL'; ALTER TYPE sales_channel_code ADD VALUE IF NOT EXISTS 'INSTAGRAM'");
 await pg.exec("ALTER TYPE price_scope ADD VALUE IF NOT EXISTS 'DEALER_PRICE_GROUP'");
 await pg.exec(`ALTER TABLE product_prices ADD COLUMN dealer_price_group_id uuid;
 CREATE TABLE dealers(id uuid PRIMARY KEY,status text,dealer_level_id uuid,price_group_id uuid);
 CREATE TABLE picking_sessions(id uuid DEFAULT gen_random_uuid(),order_id uuid,warehouse_id uuid,status text);
 CREATE TABLE picking_items(picking_session_id uuid,order_item_id uuid,expected_quantity integer);
 CREATE TABLE packing_sessions(id uuid,picking_session_id uuid,packed_at timestamptz);
 CREATE TABLE finance_transactions(id uuid,order_id uuid,approved_at timestamptz);`);
 const query=async(sql,args=[])=>{const r=await pg.query(sql,args);return {rows:r.rows,rowCount:r.affectedRows||r.rows.length}};
 const db={query,async transaction(work){await pg.exec('BEGIN');try{const r=await work({query});await pg.exec('COMMIT');return r}catch(e){await pg.exec('ROLLBACK');throw e}}};
 const {AdminOrderService}=load(path.join(root,'apps/api/src/orders/admin-order.service.ts')),{dealerMarginAmount}=load(path.join(root,'apps/api/src/commissions/dealer-margin.ts'));
 const service=new AdminOrderService(db),actor={id:randomUUID(),role:'DEALER'},pid=randomUUID(),other=randomUUID(),did=randomUUID(),level=randomUUID();
 await query('INSERT INTO users VALUES($1)',[actor.id]);await query("INSERT INTO products VALUES($1,'Trex Tea','TEA','ACTIVE'),($2,'Trex Cap','CAP','ACTIVE')",[pid,other]);
 await query("INSERT INTO dealer_levels(id,code,name,sort_order) VALUES($1,'L1','Birinci Seviye',1)",[level]);await query("INSERT INTO dealers VALUES($1,'ACTIVE',$2,NULL)",[did,level]);
 const wid=(await query("INSERT INTO warehouses(code,name) VALUES('GENEL_STOK','Genel Stok') RETURNING id")).rows[0].id;
 await query('INSERT INTO inventory(product_id,warehouse_id,physical_quantity) VALUES($1,$3,100),($2,$3,100)',[pid,other,wid]);
 await query("INSERT INTO product_prices(product_id,scope,dealer_level_id,amount) VALUES($1,'DEALER_LEVEL',$3,600),($2,'DEALER_LEVEL',$3,400)",[pid,other,level]);
 // Existing orders/prices acquire a zero fee and a single-unit size, without rewriting their history.
 await pg.exec(fs.readFileSync(path.join(root,'apps/api/migrations/074_cod_fee_and_dealer_packs.sql'),'utf8'));
 await query("INSERT INTO product_prices(product_id,scope,dealer_level_id,amount,pack_size) VALUES($1,'DEALER_LEVEL',$2,1059.99,2),($1,'DEALER_LEVEL',$2,1000,3),($1,'DEALER_LEVEL',$2,2000,5)",[pid,level]);
 const input={warehouseId:wid,recipientName:'Test',contactEmail:'test@example.com',phone:'05000000000',city:'Test',district:'Test',addressLine:'Test',paymentMethod:'COD_CASH',items:[{productId:pid,quantity:2,packSize:2,packAmount:1499.98}]};
 const key=randomUUID(),order=await service.create(input,key,actor,did);
 assert.equal(order.total_amount,'1574.98');assert.equal((await service.create(input,key,actor,did)).id,order.id);
 assert.equal((await query('SELECT count(*)::int n FROM orders')).rows[0].n,1);
 const first=(await query('SELECT * FROM order_items WHERE order_id=$1',[order.id])).rows;
 assert.equal(first.reduce((s,r)=>s+r.quantity,0),2);
 const snapshot=(await query("SELECT metadata FROM audit_logs WHERE action='order.dealer.created' AND entity_id=$1",[order.id])).rows[0].metadata;
 const prim=first.reduce((s,row)=>s+Number(dealerMarginAmount(snapshot.prices.find(p=>p.orderItemId===row.id).originalAmount,row.unit_amount,row.quantity)),0);
 assert.equal(prim.toFixed(2),'439.99');
 assert.equal((await query('SELECT reserved_quantity FROM inventory WHERE product_id=$1',[pid])).rows[0].reserved_quantity,2);
 assert.equal((await query('SELECT amount FROM payments WHERE checkout_id=$1',[order.checkout_id??(await query('SELECT checkout_id FROM orders WHERE id=$1',[order.id])).rows[0].checkout_id])).rows[0].amount,'1574.98');
 const before=(await query('SELECT count(*)::int n FROM orders')).rows[0].n;
 await assert.rejects(()=>service.create({...input,items:[{...input.items[0],packAmount:1059.98}]},randomUUID(),actor,did));
 await assert.rejects(()=>service.create({...input,items:[{...input.items[0],quantity:3}]},randomUUID(),actor,did));
 assert.equal((await query('SELECT count(*)::int n FROM orders')).rows[0].n,before);
 await query("INSERT INTO product_prices(product_id,scope,amount) VALUES($1,'GLOBAL',100)",[other]);
 const adminInput={...input,salesChannel:'WHOLESALE',items:[{productId:other,quantity:1}]};
 const admin=await service.create(adminInput,randomUUID(),{...actor,role:'SUPER_ADMIN'});
 assert.equal(admin.total_amount,'175.00');
 const adminLine=(await query('SELECT id FROM order_items WHERE order_id=$1',[admin.id])).rows[0];
 await service.updatePrices(admin.id,{reason:'Test Price Change',items:[{itemId:adminLine.id,unitAmount:90}]},{...actor,role:'SUPER_ADMIN'});
 assert.equal((await query('SELECT total_amount FROM orders WHERE id=$1',[admin.id])).rows[0].total_amount,'165.00');
 await assert.rejects(()=>service.create({...adminInput,paymentMethod:'TRANSFER',codServiceFee:75},randomUUID(),actor));
 const multi=await service.create({...input,codServiceFee:40,items:[{productId:pid,quantity:5,packSize:5},{productId:other,quantity:3}]},randomUUID(),actor,did);
 assert.equal(multi.total_amount,'3240.00');const multiLines=(await query('SELECT product_id,SUM(quantity)::int qty FROM order_items WHERE order_id=$1 GROUP BY product_id',[multi.id])).rows;
 assert.equal(multiLines.find(r=>r.product_id===pid).qty,5);assert.equal(multiLines.find(r=>r.product_id===other).qty,3);
 const triple=await service.create({...input,paymentMethod:'TRANSFER',items:[{productId:pid,quantity:3,packSize:3}]},randomUUID(),actor,did);
 assert.equal(triple.total_amount,'1000.00');assert.equal((await query('SELECT SUM(quantity*unit_amount)::text total,SUM(quantity)::int qty FROM order_items WHERE order_id=$1',[triple.id])).rows[0].total,'1000.00');
 const options=await service.options(did);assert.equal(options.products.find(p=>p.id===pid).amount,'600.00');assert.equal(options.products.find(p=>p.id===pid).packs.length,3);
 // Manager/director rates remain based on actual units, not the number of packs or allocated price rows.
 const staff=load(path.join(root,'apps/api/src/commissions/staff-channel.service.ts')).StaffChannelService;
 await pg.exec(`CREATE TABLE commission_entries(id uuid DEFAULT gen_random_uuid(),recipient_user_id uuid,recipient_kind text,order_id uuid,order_item_id uuid,amount numeric(12,2),currency text,status text,entry_kind text,available_at timestamptz,finalized_at timestamptz,calculation_source text,staff_settings_id uuid,staff_rate_id uuid,staff_role text,staff_channel_group text,staff_unit_amount numeric,staff_pool_amount numeric,staff_share_count int,note text,UNIQUE(recipient_user_id,order_item_id));`);
 await query("UPDATE orders SET status='DELIVERED' WHERE id=$1",[multi.id]);
 const executives=[randomUUID(),randomUUID(),randomUUID()],director=randomUUID();
 const staffClient={query:async(sql,args)=>{if(sql.includes('FROM staff_prim_settings'))return {rows:[{id:randomUUID(),executive_count:3,executive_ids:executives,director_id:director}],rowCount:1};if(sql.includes('FROM staff_prim_rates'))return {rows:args[0]===pid?[{id:randomUUID(),executive_amount:'6.00',director_amount:'6.00'}]:[],rowCount:args[0]===pid?1:0};return query(sql,args)}};
 await new staff(db).award(staffClient,multi.id,'DEALER');
 const awards=(await query('SELECT staff_role,SUM(amount)::text total FROM commission_entries WHERE order_id=$1 GROUP BY staff_role',[multi.id])).rows;
 assert.equal(awards.length,2);for(const row of awards)assert.equal(row.total,'30.00');
 console.log('PASS: one order for five units + another product; exact 2/3/5 totals; 439.99 dealer margin; fee default/manual/no transfer charge; stock quantity; retry; under-floor/invalid quantity rollback; unchanged single-price options.');
 }finally{await pg.close()}}
main().catch(e=>{console.error(e);process.exitCode=1});
