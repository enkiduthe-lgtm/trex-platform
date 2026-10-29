// Actual PostgreSQL checks in an isolated in-memory database; no production access.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),ts=require(path.join(process.argv[2],'node_modules/typescript')),{PGlite}=require(path.join(process.argv[3],'node_modules/@electric-sql/pglite'));
const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
async function main(){
 const pg=new PGlite(),db={async query(sql,args=[]){const r=await pg.query(sql,args);return {rows:r.rows,rowCount:Math.max(r.affectedRows??0,r.rows.length)};},async transaction(work){await pg.exec('BEGIN');try{const r=await work(db);await pg.exec('COMMIT');return r;}catch(e){await pg.exec('ROLLBACK');throw e;}}};
 const code=ts.transpileModule(fs.readFileSync(path.join(root,'apps/api/src/current-accounts/current-accounts.service.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,experimentalDecorators:true}}).outputText;
 const box={exports:{},require(name){if(name==='@nestjs/common')return {Injectable:()=>t=>t,BadRequestException:Error,ConflictException:Error,NotFoundException:Error};throw Error(name);}};vm.runInNewContext(code,box);const service=new box.exports.CurrentAccountsService(db);
 await pg.exec(`CREATE TABLE dealers(id uuid PRIMARY KEY);CREATE TABLE customers(id uuid PRIMARY KEY);
 CREATE TABLE current_account_entries(id uuid PRIMARY KEY,party_type text,dealer_id uuid,customer_id uuid,direction text,entry_type text,amount numeric(12,2),currency text,source_type text,source_id uuid,description text,due_at date,created_at timestamptz);`);
 const dealer=uuid(1),customer=uuid(2);await db.query('INSERT INTO dealers VALUES($1)',[dealer]);await db.query('INSERT INTO customers VALUES($1)',[customer]);
 async function add(n,amount,direction,currency,time,person=dealer){await db.query("INSERT INTO current_account_entries VALUES($1,$2,$3,$4,$5,'ADJUSTMENT',$6,$7,'TEST',NULL,'Test Entry',NULL,$8)",[uuid(n),person===dealer?'DEALER':'CUSTOMER',person===dealer?dealer:null,person===customer?customer:null,direction,amount,currency,time]);}
 await add(10,100,'DEBIT','TRY','2026-09-30T20:59:59Z');
 await add(11,10,'DEBIT','TRY','2026-09-30T21:00:00Z');
 await add(12,5,'CREDIT','TRY','2026-10-31T20:59:59Z');
 await add(13,999,'DEBIT','TRY','2026-10-31T21:00:00Z');
 await add(14,50,'DEBIT','EUR','2026-09-01T00:00:00Z');
 await add(15,20,'CREDIT','EUR','2026-10-15T00:00:00Z');
 for(let n=0;n<250;n++)await add(100+n,1,'DEBIT','TRY','2026-10-15T10:00:00Z');
 await add(500,9,'DEBIT','USD','2026-10-15T00:00:00Z',customer);
 const month=await service.detail('DEALER',dealer,'2026-10-01','2026-10-31'),tryBalance=month.balances.find(b=>b.currency==='TRY'),eur=month.balances.find(b=>b.currency==='EUR');
 assert.equal(month.entries.length,253);assert.equal(tryBalance.opening_balance,'100.00');assert.equal(tryBalance.period_debit,'260.00');assert.equal(tryBalance.period_credit,'5.00');assert.equal(tryBalance.closing_balance,'355.00');assert.equal(tryBalance.balance,'1354.00');
 assert.equal(eur.opening_balance,'50.00');assert.equal(eur.period_credit,'20.00');assert.equal(eur.closing_balance,'30.00');assert(!month.balances.some(b=>b.currency==='USD'));
 const tryRows=month.entries.filter(e=>e.currency==='TRY');assert.equal(tryRows[0].running_balance,'110.00');assert.equal(tryRows.at(-1).running_balance,'355.00');
 const all=await service.detail('DEALER',dealer);assert.equal(all.entries.length,256);assert(all.balances.every(b=>b.opening_balance==='0'));
 const empty=await service.detail('DEALER',dealer,'2027-01-01','2027-01-02');assert.equal(empty.entries.length,0);assert.equal(empty.balances.find(b=>b.currency==='TRY').opening_balance,'1354.00');
 const own=await service.detail('CUSTOMER',customer);assert.equal(own.entries.length,1);assert.equal(own.balances[0].balance,'9.00');
 await assert.rejects(()=>service.detail('INVALID',dealer));await assert.rejects(()=>service.detail('DEALER',uuid(999)));await assert.rejects(()=>service.detail('DEALER',dealer,'2026-02-30'));await assert.rejects(()=>service.detail('DEALER',dealer,'2026-11-01','2026-10-01'));
 await pg.close();console.log('Current-account PostgreSQL checks passed: full history over 200 entries, Istanbul date boundaries, opening/closing/current balances, exact running balances, currency separation, account isolation and invalid dates.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
