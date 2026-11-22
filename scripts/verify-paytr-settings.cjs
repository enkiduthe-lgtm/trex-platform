// Actual finance service and PayTR table definitions; all money records are synthetic.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),ts=require(path.join(root,'node_modules/typescript')),{PGlite}=require(path.join(process.argv[2],'node_modules/@electric-sql/pglite'));
const box={exports:{},Date,Intl,require(name){if(name==='@nestjs/common')return {Injectable:()=>type=>type,BadRequestException:Error,ConflictException:Error};if(name==='node:crypto')return require(name);return {};}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,'apps/api/src/finance/finance.service.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,experimentalDecorators:true}}).outputText,box);
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
async function main(){
 const pg=new PGlite();let auditFailure=false,tail=Promise.resolve();const calls=[];
 const client={async query(sql,args=[]){calls.push(sql);if(auditFailure&&sql.startsWith('INSERT INTO audit_logs'))throw Error('Audit unavailable');const result=await pg.query(sql,args);return {rows:result.rows,rowCount:Math.max(result.affectedRows??0,result.rows.length)};}};
 const db={...client,transaction(work){const run=tail.then(async()=>{await pg.exec('BEGIN');try{const result=await work(client);await pg.exec('COMMIT');return result;}catch(error){await pg.exec('ROLLBACK');throw error;}});tail=run.catch(()=>{});return run;}};
 await pg.exec('CREATE TABLE finance_accounts(id uuid PRIMARY KEY);CREATE TABLE orders(id uuid PRIMARY KEY,order_number text);CREATE TABLE payments(id uuid PRIMARY KEY);CREATE TABLE audit_logs(actor_user_id uuid,action text,entity_type text,metadata jsonb);');
 const schema=fs.readFileSync(path.join(root,'apps/api/migrations/033_paytr_cash.sql'),'utf8');await pg.exec(schema.slice(schema.indexOf('CREATE TABLE paytr_finance_settings'),schema.indexOf('INSERT INTO finance_accounts')));await pg.exec(schema.slice(schema.indexOf('CREATE TABLE paytr_receipts'),schema.indexOf('CREATE FUNCTION')));
 await client.query('INSERT INTO finance_accounts VALUES($1)',[id(1)]);await client.query("INSERT INTO orders VALUES($1,'TEST-PAYTR')",[id(2)]);await client.query('INSERT INTO payments VALUES($1),($2)',[id(3),id(4)]);
 await client.query("INSERT INTO paytr_receipts(payment_id,order_id,account_id,is_test,gross_amount,commission_rate,commission_amount,net_amount,currency) VALUES($1,$2,$3,false,100,3.69,3.69,96.31,'TRY'),($4,$2,$3,true,200,3.69,7.38,192.62,'TRY')",[id(3),id(2),id(1),id(4)]);
 const service=new box.exports.FinanceService(db),actor={id:id(900),role:'SUPER_ADMIN'},snapshot=JSON.stringify((await client.query('SELECT * FROM paytr_receipts ORDER BY payment_id')).rows);
 assert.equal((await service.paytrCash()).receipts.length,2);const saved=await service.updatePaytrRate(4,actor,3.69);assert.equal(saved.changed,true);assert.equal((await service.updatePaytrRate(4,actor,3.69)).changed,false);assert.equal((await client.query('SELECT * FROM audit_logs')).rows.length,1);
 await assert.rejects(service.updatePaytrRate(5,actor,3.69),/başka bir işlemde/);await service.updatePaytrRate(5,actor,4);assert.equal((await service.paytrCash()).commissionRate,'5.00');
 auditFailure=true;await assert.rejects(service.updatePaytrRate(6,actor,5),/Audit unavailable/);auditFailure=false;assert.equal((await service.paytrCash()).commissionRate,'5.00');
 const queryCount=calls.length;for(const rate of [-1,101,3.699,NaN,Infinity])await assert.rejects(service.updatePaytrRate(rate,actor));await assert.rejects(service.updatePaytrRate(6,actor,3.699));assert.equal(calls.length,queryCount,'Invalid rates must be rejected before any SQL access');
 const same=await Promise.all([service.updatePaytrRate(7,actor,5),service.updatePaytrRate(7,actor,5)]);assert.equal(same.filter(row=>row.changed).length,1);
 const conflicting=await Promise.allSettled([service.updatePaytrRate(8,actor,7),service.updatePaytrRate(9,actor,7)]);assert.equal(conflicting.filter(row=>row.status==='fulfilled').length,1);assert.equal(conflicting.filter(row=>row.status==='rejected').length,1);
 assert.equal(JSON.stringify((await client.query('SELECT * FROM paytr_receipts ORDER BY payment_id')).rows),snapshot,'Changing the current setting must never rewrite historical gross, rate, commission or net receipts');
 await client.query('DELETE FROM paytr_finance_settings');await assert.rejects(service.paytrCash(),/bulunamadı/);await assert.rejects(service.updatePaytrRate(5,actor),/bulunamadı/);assert(calls.some(sql=>sql.includes('FOR UPDATE')));
 await pg.close();console.log('PayTR SQL checks passed: guarded atomic settings, same-value replay, concurrent baseline conflicts, audit rollback, validated rates, missing-setting errors and unchanged historical real/test receipts. No payment or provider call occurred.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
