// Isolated PostgreSQL + actual report grouping. No live dealer or order writes.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),ts=require(path.join(process.argv[2],'node_modules/typescript')),{PGlite}=require(path.join(process.argv[3],'node_modules/@electric-sql/pglite'));
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function load(file){file=path.resolve(file);const box={exports:{},Intl,Date,Map,Set,BigInt,require(name){if(name==='@nestjs/common')return {Injectable:()=>t=>t,BadRequestException:Error,ConflictException:Error,NotFoundException:Error};if(name==='../orders/report-period'||name==='./report-totals'||name==='./finance-report')return load(path.resolve(path.dirname(file),name+'.ts'));return {};}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,experimentalDecorators:true}}).outputText,box);return box.exports;}

async function main(){
 const pg=new PGlite();const query=async(sql,args=[])=>{const r=await pg.query(sql,args);return {rows:r.rows,rowCount:r.affectedRows??r.rows.length};};
 const db={query,async transaction(work){await pg.exec('BEGIN');try{const r=await work({query});await pg.exec('COMMIT');return r;}catch(e){await pg.exec('ROLLBACK');throw e;}}};
 await pg.exec(`CREATE TABLE orders(id uuid PRIMARY KEY,checkout_id uuid,status text,order_number text);
 CREATE TABLE checkout_sessions(id uuid PRIMARY KEY,contact_email text);
 CREATE TABLE shipments(id uuid PRIMARY KEY,order_id uuid,provider text,provider_reference text,tracking_number text,status text,failure_reason text,dispatched_at timestamptz,delivered_at timestamptz,updated_at timestamptz);
 CREATE TABLE shipment_events(id uuid DEFAULT gen_random_uuid(),shipment_id uuid,status text,provider_event_id text,description text,occurred_at timestamptz DEFAULT now(),UNIQUE(shipment_id,provider_event_id));
 CREATE TABLE order_status_history(order_id uuid,status text,actor_user_id uuid);
 CREATE TABLE audit_logs(id uuid DEFAULT gen_random_uuid(),actor_user_id uuid,action text,entity_type text,entity_id uuid,metadata jsonb,created_at timestamptz DEFAULT now());
 CREATE TABLE dealer_user_accounts(user_id uuid,dealer_id uuid);
 CREATE TABLE test_commissions(order_id uuid);`);
 await pg.exec(fs.readFileSync(path.join(root,'apps/api/migrations/073_aras_tracking.sql'),'utf8'));
 const {ShippingService}=load(path.join(root,'apps/api/src/shipping/shipping.service.ts'));
 let failAward=false;const commissions={async awardForDeliveredOrder(orderId,actor,client){await client.query('INSERT INTO test_commissions VALUES($1)',[orderId]);if(failAward)throw Error('simulated rollback');}};
 const service=new ShippingService(db,{},{},undefined,commissions);
 const observation={reference:'REF',eventId:'aras:6:1',code:'6',direction:'1',trackingNumber:'123'};
 for(let n=1;n<=5;n++){await query('INSERT INTO orders VALUES($1,$1,$2,$3)',[id(n),n===4?'CANCELLED':'PROCESSING','ORDER-'+n]);await query("INSERT INTO shipments(id,order_id,provider,provider_reference,status) VALUES($1,$2,'aras','REF','CREATED')",[id(n+100),id(n)]);}
 await service.updateStatus(id(1),{status:'DELIVERED'},null,observation);
 await service.updateStatus(id(1),{status:'DELIVERED'},null,observation);
 assert.equal((await query('SELECT status FROM orders WHERE id=$1',[id(1)])).rows[0].status,'DELIVERED');assert.equal((await query('SELECT count(*)::int n FROM test_commissions')).rows[0].n,1);assert.equal((await query('SELECT count(*)::int n FROM shipment_events')).rows[0].n,1);
 await service.updateStatus(id(2),{status:'FAILED',description:'Aras İade'},null,{...observation,code:'6',direction:'3',eventId:'aras:6:3'});
 assert.equal((await query('SELECT status FROM orders WHERE id=$1',[id(2)])).rows[0].status,'PROCESSING');assert.equal((await query('SELECT count(*)::int n FROM test_commissions')).rows[0].n,1);
 await assert.rejects(()=>service.updateStatus(id(3),{status:'DELIVERED'},null,{...observation,reference:'WRONG'}));await assert.rejects(()=>service.updateStatus(id(4),{status:'DELIVERED'},null,observation));
 failAward=true;await assert.rejects(()=>service.updateStatus(id(5),{status:'DELIVERED'},null,observation));
 assert.equal((await query('SELECT status FROM orders WHERE id=$1',[id(5)])).rows[0].status,'PROCESSING');assert.equal((await query('SELECT status FROM shipments WHERE order_id=$1',[id(5)])).rows[0].status,'CREATED');assert.equal((await query('SELECT count(*)::int n FROM test_commissions')).rows[0].n,1);
 await pg.close();console.log('Aras transaction checks passed: real migration, delivery/commission atomicity, repeat delivery, return safety, stale reference and cancellation protection, rollback after commission failure.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
