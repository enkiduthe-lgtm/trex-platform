// Isolated PostgreSQL verification. No live carrier or database writes.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),ts=require(path.join(process.argv[2],'node_modules/typescript')),{PGlite}=require(path.join(process.argv[3],'node_modules/@electric-sql/pglite'));
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function load(file){file=path.resolve(file);const box={exports:{},Intl,Date,Map,Set,BigInt,process:{env:{SHIPPING_PROVIDER:'aras'}},require(name){if(name==='@nestjs/common')return {Injectable:()=>t=>t,BadRequestException:Error,ConflictException:Error,NotFoundException:Error};if(name==='../orders/report-period'||name==='./report-totals'||name==='./finance-report')return load(path.resolve(path.dirname(file),name+'.ts'));return {};}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,experimentalDecorators:true}}).outputText,box);return box.exports;}

async function main(){
 const pg=new PGlite();const query=async(sql,args=[])=>{const r=await pg.query(sql,args);return {rows:r.rows,rowCount:r.affectedRows??r.rows.length};};
 const db={query,async transaction(work){await pg.exec('BEGIN');try{const r=await work({query});await pg.exec('COMMIT');return r;}catch(e){await pg.exec('ROLLBACK');throw e;}}};
 await pg.exec(`CREATE TABLE orders(id uuid PRIMARY KEY,checkout_id uuid,status text,order_number text,archived_at timestamptz);
 CREATE TABLE checkout_sessions(id uuid PRIMARY KEY,contact_email text);
 CREATE TABLE order_status_history(order_id uuid,status text,actor_user_id uuid);
 CREATE TABLE audit_logs(id uuid DEFAULT gen_random_uuid(),actor_user_id uuid,action text,entity_type text,entity_id text,metadata jsonb,created_at timestamptz DEFAULT now());
 CREATE TABLE dealer_user_accounts(user_id uuid,dealer_id uuid);
 CREATE TABLE test_commissions(order_id uuid);`);
 for(const migration of ['009_shipping.sql','037_aras_shipping_operations.sql','073_aras_tracking.sql']){
   await pg.exec(fs.readFileSync(path.join(root,'apps/api/migrations',migration),'utf8'));
 }
 const {ShippingService}=load(path.join(root,'apps/api/src/shipping/shipping.service.ts'));
 let failAward=false;const commissions={async awardForDeliveredOrder(orderId,actor,client){await client.query('INSERT INTO test_commissions VALUES($1)',[orderId]);if(failAward)throw Error('simulated rollback');}};
 const service=new ShippingService(db,{},{},undefined,commissions);
 const observation={reference:'REF-1',eventId:'aras:6:1',code:'6',direction:'1',trackingNumber:'123'};
 for(let n=1;n<=5;n++){await query('INSERT INTO orders(id,checkout_id,status,order_number) VALUES($1,$1,$2,$3)',[id(n),n===4?'CANCELLED':'PROCESSING','ORDER-'+n]);await query("INSERT INTO shipments(id,order_id,provider,provider_reference,status) VALUES($1,$2,'aras',$3,'CREATED')",[id(n+100),id(n),'REF-'+n]);}
 await service.updateStatus(id(1),{status:'DELIVERED'},null,observation);
 await service.updateStatus(id(1),{status:'DELIVERED'},null,observation);
 assert.equal((await query('SELECT status FROM orders WHERE id=$1',[id(1)])).rows[0].status,'DELIVERED');assert.equal((await query('SELECT count(*)::int n FROM test_commissions')).rows[0].n,1);assert.equal((await query('SELECT count(*)::int n FROM shipment_events')).rows[0].n,1);
 await service.updateStatus(id(2),{status:'FAILED',description:'Aras İade'},null,{...observation,reference:'REF-2',trackingNumber:'124',code:'6',direction:'3',eventId:'aras:6:3'});
 assert.equal((await query('SELECT status FROM orders WHERE id=$1',[id(2)])).rows[0].status,'PROCESSING');assert.equal((await query('SELECT count(*)::int n FROM test_commissions')).rows[0].n,1);
 await assert.rejects(()=>service.updateStatus(id(3),{status:'DELIVERED'},null,{...observation,reference:'WRONG'}));await assert.rejects(()=>service.updateStatus(id(4),{status:'DELIVERED'},null,observation));
 await query('UPDATE orders SET archived_at=now() WHERE id=$1',[id(3)]);
 await assert.rejects(()=>service.updateStatus(id(3),{status:'DELIVERED'},null,{...observation,reference:'REF-3'}),/Gönderi Kaydı Bulunamadı/);
 assert.equal((await query('SELECT status FROM shipments WHERE order_id=$1',[id(3)])).rows[0].status,'CREATED');
 failAward=true;await assert.rejects(()=>service.updateStatus(id(5),{status:'DELIVERED'},null,{...observation,reference:'REF-5',trackingNumber:'125'}),/simulated rollback/);
 assert.equal((await query('SELECT status FROM orders WHERE id=$1',[id(5)])).rows[0].status,'PROCESSING');assert.equal((await query('SELECT status FROM shipments WHERE order_id=$1',[id(5)])).rows[0].status,'CREATED');assert.equal((await query('SELECT count(*)::int n FROM test_commissions')).rows[0].n,1);
 await pg.exec(`
   ALTER TABLE orders ADD COLUMN total_amount numeric(12,2) DEFAULT 120, ADD COLUMN currency char(3) DEFAULT 'TRY';
   CREATE TABLE payments(id uuid,checkout_id uuid,provider text,created_at timestamptz);
   CREATE TABLE order_addresses(order_id uuid,recipient_name text,phone text,city text,district text,address_line text,postal_code text);
   CREATE TABLE picking_sessions(id uuid,order_id uuid);
   CREATE TABLE packing_sessions(picking_session_id uuid,packed_at timestamptz,package_barcode text);
 `);
 await query("INSERT INTO orders(id,checkout_id,status,order_number) VALUES($1,$1,'PROCESSING','ORDER-6')",[id(6)]);
 await query("INSERT INTO order_addresses(order_id,recipient_name,phone,city,district,address_line) VALUES($1,'Test','5000000000','BURSA','Test','Test')",[id(6)]);
 await query('INSERT INTO picking_sessions VALUES($1,$2)',[id(200),id(6)]);
 await query("INSERT INTO packing_sessions VALUES($1,now(),'PACK-6')",[id(200)]);
 let submissions=0;
 const aras={
   async createShipment(input){assert.equal(input.packageBarcode,'PACK-6');if(++submissions===1)throw Error('test carrier outage');return {reference:'REF-6',trackingNumber:null,payload:{registrationVerified:true}};},
   async verifyRegisteredShipment(reference,barcode){return reference==='REF-6'&&barcode==='PACK-6';},
 };
 const registration=new ShippingService(db,{},aras);
 await assert.rejects(()=>registration.create(id(6)),/test carrier outage/);
 assert.equal((await query('SELECT status FROM shipments WHERE order_id=$1',[id(6)])).rows[0].status,'FAILED');
 const created=await registration.create(id(6));
 assert.equal(created.replayed,false);
 assert.equal((await registration.create(id(6))).replayed,true);
 assert.equal(submissions,2);
 assert.equal((await query("SELECT count(*)::int n FROM shipment_events WHERE shipment_id=$1 AND status='CREATED'",[created.shipmentId])).rows[0].n,1);
 await pg.close();console.log('Aras transaction checks passed: real migration, delivery/commission atomicity, repeat delivery, return safety, stale reference and cancellation protection, rollback after commission failure.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
