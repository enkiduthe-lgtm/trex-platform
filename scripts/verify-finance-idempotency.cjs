// Actual finance service and isolated PostgreSQL-compatible transactions; no live writes.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),ts=require(path.join(root,'node_modules/typescript')),{PGlite}=require(path.join(process.argv[2],'node_modules/@electric-sql/pglite'));
const cache=new Map();
function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file);const box={exports:{},require(name){if(name==='@nestjs/common')return {Injectable:()=>type=>type,BadRequestException:Error,ConflictException:Error};if(name==='node:crypto')return require(name);if(name.startsWith('.'))return load(path.resolve(path.dirname(file),name+'.ts'));throw Error(name);}};cache.set(file,box.exports);vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,experimentalDecorators:true}}).outputText,box);return box.exports;}
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
async function main(){
 const pg=new PGlite();let auditFailure=false,tail=Promise.resolve();const queries=[];
 const client={async query(sql,args=[]){queries.push(sql);if(auditFailure&&sql.startsWith('INSERT INTO audit_logs'))throw Error('Audit unavailable');const result=await pg.query(sql,args);return {rows:result.rows,rowCount:Math.max(result.affectedRows??0,result.rows.length)};}};
 const db={...client,transaction(work){const run=tail.then(async()=>{await pg.exec('BEGIN');try{const result=await work(client);await pg.exec('COMMIT');return result;}catch(error){await pg.exec('ROLLBACK');throw error;}});tail=run.catch(()=>{});return run;}};
 await pg.exec(`CREATE TABLE finance_accounts(id uuid PRIMARY KEY,is_active boolean,currency text DEFAULT 'TRY');CREATE TABLE finance_transactions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),account_id uuid REFERENCES finance_accounts,kind text,amount numeric(12,2),payment_status text,counterparty_name text,reference_number text,expense_category text,cost_center text,document_url text,description text,occurred_at timestamptz,created_by uuid,transfer_group_id uuid);CREATE TABLE audit_logs(actor_user_id uuid,action text,entity_type text,entity_id uuid,metadata jsonb);`);
 const migration=fs.readFileSync(path.join(root,'apps/api/migrations/007_checkout_orders.sql'),'utf8');await pg.exec(migration.match(/CREATE TABLE idempotency_records \([\s\S]*?\n\);/)[0]);
 await client.query('INSERT INTO finance_accounts(id,is_active) VALUES($1,true)',[id(1)]);
 const {FinanceService}=load(path.join(root,'apps/api/src/finance/finance.service.ts')),service=new FinanceService(db),actor={id:id(2),role:'SUPER_ADMIN'};
 const dto={accountId:id(1),kind:'COLLECTION',amount:1499.98,paymentStatus:'PENDING',counterpartyName:' Alıcı ',referenceNumber:' REF-TEST ',description:' Test havalesi '};
 const first=await service.createTransaction(dto,actor,id(10));
 const retry=await service.createTransaction({...dto,description:'Test havalesi',counterpartyName:'Alıcı',referenceNumber:'REF-TEST'},actor,id(10));
 assert.equal(retry.id,first.id);assert.equal(retry.replayed,true);assert.equal((await client.query('SELECT count(*)::int AS n FROM finance_transactions')).rows[0].n,1);assert.equal((await client.query('SELECT count(*)::int AS n FROM audit_logs')).rows[0].n,1);
 await assert.rejects(service.createTransaction({...dto,amount:1500},actor,id(10)),/farklı para hareketinde/);
 const isolated=await service.createTransaction(dto,{...actor,id:id(3)},id(10));assert.notEqual(isolated.id,first.id,'Keys are scoped to the actor');
 await client.query('UPDATE finance_accounts SET is_active=false WHERE id=$1',[id(1)]);assert.equal((await service.createTransaction(dto,actor,id(10))).id,first.id,'Known successful retries do not create a new write when an account is later inactive');
 await assert.rejects(service.createTransaction(dto,actor,id(11)),/Aktif finans hesabı/);await client.query('UPDATE finance_accounts SET is_active=true WHERE id=$1',[id(1)]);
 const parallel=await Promise.all([service.createTransaction(dto,actor,id(12)),service.createTransaction(dto,actor,id(12))]);assert.equal(parallel[0].id,parallel[1].id);assert(queries.some(sql=>sql.includes('pg_advisory_xact_lock')));
 auditFailure=true;await assert.rejects(service.createTransaction(dto,actor,id(13)),/Audit unavailable/);auditFailure=false;
 assert.equal((await client.query("SELECT count(*)::int AS n FROM idempotency_records WHERE key=$1",[`finance-transaction:${actor.id}:${id(13)}`])).rows[0].n,0,'Failed audit rolls back the recovery key');
 const recovered=await service.createTransaction(dto,actor,id(13));assert(recovered.id);
 await client.query('DELETE FROM finance_transactions WHERE id=$1',[first.id]);await assert.rejects(service.createTransaction(dto,actor,id(10)),/kaydı kaldırılmış/);
 for(const amount of [0,-1,0.001,10000000000])await assert.rejects(service.createTransaction({...dto,amount},actor,id(20)),/Tutar|tutar|sıfırdan/);
 await assert.rejects(service.createTransaction(dto,actor,'bad-key'),/işlem anahtarı/);
 const legacy=await service.createTransaction(dto,actor);assert(legacy.id,'Existing clients without a key remain compatible');
 await client.query("INSERT INTO finance_accounts VALUES($1,true,'TRY'),($2,true,'EUR')",[id(30),id(31)]);
 const transfer={fromAccountId:id(1),toAccountId:id(30),amount:10.01,description:' Hesaplar arası '};
 const moved=await service.createTransfer(transfer,actor,id(40)),movedAgain=await service.createTransfer({...transfer,description:'Hesaplar arası'},actor,id(40));
 assert.equal(movedAgain.transferGroupId,moved.transferGroupId);assert.equal(movedAgain.replayed,true);
 const pair=await client.query("SELECT count(*)::int AS n,sum(CASE WHEN kind='TRANSFER_IN' THEN amount ELSE -amount END)::text AS net FROM finance_transactions WHERE transfer_group_id=$1",[moved.transferGroupId]);assert.equal(pair.rows[0].n,2);assert.equal(pair.rows[0].net,'0.00');
 await assert.rejects(service.createTransfer({...transfer,amount:11},actor,id(40)),/farklı transferde/);
 await assert.rejects(service.createTransfer({...transfer,toAccountId:id(31)},actor,id(41)),/aynı para biriminde/);
 for(const amount of [0,-1,0.001,10000000000])await assert.rejects(service.createTransfer({...transfer,amount},actor,id(42)));
 await assert.rejects(service.createTransfer({...transfer,toAccountId:id(1)},actor,id(42)),/farklı çıkış/);await assert.rejects(service.createTransfer({...transfer,description:' '},actor,id(42)),/açıklaması/);
 const beforeRollback=(await client.query('SELECT count(*)::int AS n FROM finance_transactions')).rows[0].n;auditFailure=true;await assert.rejects(service.createTransfer(transfer,actor,id(43)),/Audit unavailable/);auditFailure=false;
 assert.equal((await client.query('SELECT count(*)::int AS n FROM finance_transactions')).rows[0].n,beforeRollback,'An audit error rolls back both transfer directions');
 await client.query("DELETE FROM finance_transactions WHERE transfer_group_id=$1 AND kind='TRANSFER_IN'",[moved.transferGroupId]);await assert.rejects(service.createTransfer(transfer,actor,id(40)),/iki yönlü kaydı doğrulanamadı/);
 await pg.close();console.log('Finance idempotency passed: normalized replay, actor isolation, payload conflict, inactive-account replay, repeated requests, audit rollback, removed-record protection, amount bounds and legacy clients. Test adapter serializes transactions; production concurrency uses the asserted PostgreSQL advisory lock.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
