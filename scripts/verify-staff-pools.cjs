// Isolated PostgreSQL regression checks; never connects to production.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),ts=require(path.join(process.argv[2],'node_modules/typescript')),{PGlite}=require(path.join(process.argv[3],'node_modules/@electric-sql/pglite'));
const cache=new Map();
function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file);const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,experimentalDecorators:true}}).outputText;const box={exports:{},require(name){if(name==='@nestjs/common')return {Injectable:()=>t=>t,BadRequestException:Error,ConflictException:Error,NotFoundException:Error,ForbiddenException:Error};if(name.startsWith('.'))return load(path.resolve(path.dirname(file),name+'.ts'));return require(name);}};cache.set(file,box.exports);vm.runInNewContext(code,box,{filename:file});return box.exports;}
const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
async function main(){
 const pg=new PGlite(),db={async query(sql,args=[]){const r=await pg.query(sql,args);return {rows:r.rows,rowCount:Math.max(r.affectedRows??0,r.rows.length)};},async transaction(work){await pg.exec('BEGIN');try{const r=await work(db);await pg.exec('COMMIT');return r;}catch(e){await pg.exec('ROLLBACK');throw e;}}};
 await pg.exec(`CREATE TABLE users(id uuid PRIMARY KEY,email text,role text,is_active boolean DEFAULT true);
 CREATE TABLE products(id uuid PRIMARY KEY,name text,sku text,is_active boolean DEFAULT true);
 CREATE TABLE orders(id uuid PRIMARY KEY,order_number text,sales_channel text,status text,currency text,created_at timestamptz);
 CREATE TABLE order_items(id uuid PRIMARY KEY,order_id uuid REFERENCES orders(id),product_id uuid REFERENCES products(id),product_name text,sku text,quantity integer,currency text);
 CREATE TABLE finance_accounts(id uuid PRIMARY KEY,is_active boolean,currency text,name text DEFAULT 'Test Bank');
 CREATE TABLE finance_transactions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),account_id uuid,order_id uuid,kind text,amount numeric(12,2),payment_status text,counterparty_name text,reference_number text,description text,created_by uuid,approved_by uuid,occurred_at timestamptz DEFAULT now(),created_at timestamptz DEFAULT now());
 CREATE TABLE audit_logs(actor_user_id uuid,action text,entity_type text,entity_id uuid,metadata jsonb);
 CREATE TABLE commission_entries(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),recipient_user_id uuid REFERENCES users(id),recipient_kind text,dealer_id uuid,order_id uuid,order_item_id uuid,rule_id uuid,amount numeric(12,2),currency text,status text,entry_kind text,available_at timestamptz,finalized_at timestamptz,created_at timestamptz DEFAULT now(),paid_at timestamptz,paid_by uuid,finance_transaction_id uuid,calculation_source text,note text,source_entry_id uuid,reversed_at timestamptz,return_id uuid);
 CREATE UNIQUE INDEX reversal_once ON commission_entries(source_entry_id,return_id) WHERE entry_kind='REVERSAL';
 CREATE TABLE return_items(return_id uuid,order_item_id uuid,quantity integer);
 `);
 await pg.exec(fs.readFileSync(path.join(root,'apps/api/migrations/069_staff_channel_pools.sql'),'utf8'));
 const {StaffChannelService}=load(path.join(root,'apps/api/src/commissions/staff-channel.service.ts')),{CommissionsService}=load(path.join(root,'apps/api/src/commissions/commissions.service.ts'));
 const service=new StaffChannelService(db),commissions=new CommissionsService(db),master={id:uuid(1),role:'SUPER_ADMIN'},executives=[uuid(2),uuid(3),uuid(4)],director=uuid(5),product=uuid(10),cap=uuid(11),account=uuid(12);
 for(let n=1;n<=5;n++)await db.query('INSERT INTO users(id,email,role) VALUES($1,$2,$3)',[uuid(n),n===5?'private-director@test.invalid':`user${n}@test.invalid`,n===1?'SUPER_ADMIN':'ADMIN']);
 await db.query("INSERT INTO products(id,name,sku) VALUES($1,'Tea','TEA'),($2,'Cap','CAP')",[product,cap]);
 await db.query("INSERT INTO finance_accounts(id,is_active,currency) VALUES($1,true,'TRY')",[account]);
 await assert.rejects(()=>service.settings({executiveCount:3,executiveIds:[executives[0]],directorId:director},master));
 await assert.rejects(()=>service.settings({executiveCount:3,executiveIds:executives,directorId:executives[0]},master));
 await service.settings({executiveCount:3,executiveIds:executives,directorId:director},master);
 for(const [group,tea,capAmount]of [['RETAIL',7,8],['WHOLESALE',6,8],['DEALER',6,5]])for(const [pid,amount]of [[product,tea],[cap,capAmount]])await service.rate({productId:pid,channelGroup:group,executiveAmount:amount,directorAmount:amount},master);
 await db.query("UPDATE staff_prim_settings SET created_at='2026-01-01'");await db.query("UPDATE staff_prim_rates SET created_at='2026-01-01'");
 const examples=[['PUBLIC_WEB',product,481,3367],['WHOLESALE',product,7570,45420],['DEALER_PORTAL',product,278,1668],['INSTAGRAM',cap,217,1736],['WHOLESALE',cap,1793,14344],['DEALER_PORTAL',cap,112,560]];
 for(let n=0;n<examples.length;n++){
  const [channel,pid,qty,total]=examples[n],oid=uuid(20+n),iid=uuid(30+n);
  await db.query("INSERT INTO orders VALUES($1,$2,$3,'DELIVERED','TRY','2026-01-15')",[oid,`TEST-${n}`,channel]);await db.query("INSERT INTO order_items VALUES($1,$2,$3,$4,$5,$6,'TRY')",[iid,oid,pid,pid===product?'Tea':'Cap',pid===product?'TEA':'CAP',qty]);
  assert.equal((await commissions.awardForDeliveredOrder(oid,master.id)).created,4);assert.equal((await commissions.awardForDeliveredOrder(oid,master.id)).created,0);
  const sums=(await db.query("SELECT staff_role,SUM(amount)::text AS total FROM commission_entries WHERE order_id=$1 GROUP BY staff_role",[oid])).rows;
  for(const r of sums)assert.equal(Number(r.total),total);
 }
 // 3-way division distributes the rounding cent once, preserving the exact pool.
 const first=(await db.query("SELECT amount FROM commission_entries WHERE order_id=$1 AND staff_role='EXECUTIVE' ORDER BY recipient_user_id",[uuid(20)])).rows;
 assert.equal(first[0].amount,'1122.34');assert.equal(first[1].amount,'1122.33');assert.equal(first[2].amount,'1122.33');
 const executive={id:executives[0],role:'ADMIN'},own=await service.view(executive);
 assert.equal(own.entries.length,6);assert.equal(own.rates.length,0);assert.equal(own.settings,null);assert(!JSON.stringify(own).includes('private-director'));assert(own.entries.every(e=>e.recipient_user_id===executive.id));
 const privilegedExecutive=await service.view({...executive,role:'SUPER_ADMIN'});assert.equal(privilegedExecutive.canSeeAll,false);assert.equal(privilegedExecutive.canManage,false);assert(privilegedExecutive.entries.every(e=>e.recipient_user_id===executive.id));
 const ownDirector=await service.view({id:director,role:'ADMIN'});assert(ownDirector.entries.every(e=>e.staff_role==='DIRECTOR'));
 await assert.rejects(()=>service.rate({productId:product,channelGroup:'RETAIL',executiveAmount:100,directorAmount:100},executive));
 await assert.rejects(()=>service.settings({executiveCount:3,executiveIds:executives,directorId:director},executive));
 const directorEntry=(await db.query("SELECT id FROM commission_entries WHERE order_id=$1 AND staff_role='DIRECTOR'",[uuid(20)])).rows[0];
 await assert.rejects(()=>commissions.pay(directorEntry.id,{accountId:account},executive));
 // Later edits cannot change the earlier order, even if its delivery is retried.
 await service.rate({productId:product,channelGroup:'RETAIL',executiveAmount:100,directorAmount:200},master);
 assert.equal((await commissions.awardForDeliveredOrder(uuid(20),master.id)).created,0);
 await service.settings({executiveCount:2,executiveIds:executives.slice(0,2),directorId:director},master);
 const newOrder=uuid(50),newItem=uuid(51);await db.query("INSERT INTO orders VALUES($1,'NEW','RETAIL','DELIVERED','TRY',now()+interval '1 minute')",[newOrder]);await db.query("INSERT INTO order_items VALUES($1,$2,$3,'Tea','TEA',2,'TRY')",[newItem,newOrder,product]);
 assert.equal((await commissions.awardForDeliveredOrder(newOrder,master.id)).created,3);
 assert.equal((await db.query("SELECT amount FROM commission_entries WHERE order_id=$1 AND staff_role='DIRECTOR'",[newOrder])).rows[0].amount,'400.00');
 // Proportional returns and payment use the net amount, once only.
 const returned=uuid(60);await db.query('INSERT INTO return_items VALUES($1,$2,1)',[returned,newItem]);await commissions.reverseForOrder(newOrder,master.id,'Partial Return',undefined,returned);
 assert.equal((await commissions.reverseForOrder(newOrder,master.id,'Retry',undefined,returned)).reversed,0);
 const newDirector=(await db.query("SELECT id FROM commission_entries WHERE order_id=$1 AND staff_role='DIRECTOR' AND entry_kind='EARN'",[newOrder])).rows[0];
 await commissions.pay(newDirector.id,{accountId:account},master);await commissions.pay(newDirector.id,{accountId:account},master);
 assert.equal((await db.query('SELECT count(*)::int AS n,SUM(amount)::text AS amount FROM finance_transactions')).rows[0].n,1);assert.equal((await db.query('SELECT amount FROM finance_transactions')).rows[0].amount,'200.00');
 assert.equal((await db.query('SELECT staff_paid_amount FROM commission_entries WHERE id=$1',[newDirector.id])).rows[0].staff_paid_amount,'200.00');
 const foreignOrder=uuid(70),foreignItem=uuid(71);await db.query("INSERT INTO orders VALUES($1,'USD-TEST','RETAIL','DELIVERED','USD',now()+interval '1 minute')",[foreignOrder]);await db.query("INSERT INTO order_items VALUES($1,$2,$3,'Tea','TEA',1,'USD')",[foreignItem,foreignOrder,product]);await commissions.awardForDeliveredOrder(foreignOrder,master.id);
 const foreignPrim=(await db.query("SELECT amount,currency FROM commission_entries WHERE order_id=$1 AND staff_role='DIRECTOR'",[foreignOrder])).rows[0];assert.equal(foreignPrim.amount,'200.00');assert.equal(foreignPrim.currency,'TRY');
 const {FinanceService}=load(path.join(root,'apps/api/src/finance/finance.service.ts')),finance=new FinanceService(db);
 assert.equal((await finance.listTransactions({...executive,role:'SUPER_ADMIN'})).length,0);
 assert.equal((await finance.listTransactions(master)).length,1);
 assert.equal((await finance.listTransactions({id:director,role:'ADMIN'})).length,1);
 await pg.close();console.log('Staff pool PostgreSQL checks passed: all six examples, exact 3-way split, unsplit director, versioned rates and recipients, idempotency, private participant views, forbidden settings/payments, partial returns and net payment.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
