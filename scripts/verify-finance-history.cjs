// Actual service queries against isolated PostgreSQL; no live financial writes.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),ts=require(path.join(process.argv[2],'node_modules/typescript')),{PGlite}=require(path.join(process.argv[3],'node_modules/@electric-sql/pglite'));
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function compile(file,requireImpl){const box={exports:{},require:requireImpl,Intl,Date,Map};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,experimentalDecorators:true}}).outputText,box);return box.exports;}
async function main(){
 const pg=new PGlite(),db={async query(sql,args=[]){const r=await pg.query(sql,args);return {rows:r.rows,rowCount:Math.max(r.affectedRows??0,r.rows.length)};}};
 const {FinanceService}=compile('apps/api/src/finance/finance.service.ts',name=>{if(name==='@nestjs/common')return {Injectable:()=>t=>t,BadRequestException:Error};if(name.includes('staff-channel.service'))return {StaffChannelService:class{async access(actor){return {canSeeAll:actor.role==='SUPER_ADMIN'};}}};throw Error(name);});
 const report=compile('apps/admin/app/lib/finance-report.ts',()=>{throw Error('Unexpected dependency');}),service=new FinanceService(db);
 await pg.exec(`CREATE TABLE users(id uuid PRIMARY KEY,email text); CREATE TABLE orders(id uuid PRIMARY KEY,order_number text);
 CREATE TABLE finance_accounts(id uuid PRIMARY KEY,name text,currency text,is_active boolean);
 CREATE TABLE finance_transactions(id uuid PRIMARY KEY,account_id uuid,kind text,amount numeric(12,2),payment_status text,occurred_at timestamptz,created_at timestamptz,order_id uuid,approved_by uuid,approved_at timestamptz);
 CREATE TABLE commission_entries(finance_transaction_id uuid,staff_role text,recipient_user_id uuid);`);
 await db.query("INSERT INTO finance_accounts VALUES($1,'Arşiv Hesap','TRY',false),($2,'Euro Hesap','EUR',true)",[id(1),id(2)]);
 await db.query("INSERT INTO users VALUES($1,'Müdür'),($2,'Yönetici')",[id(3),id(4)]);await db.query("INSERT INTO orders VALUES($1,'TRX-TEST')",[id(5)]);
 for(let n=0;n<205;n++)await db.query("INSERT INTO finance_transactions VALUES($1,$2,'COLLECTION',1.10,'PENDING','2026-10-15T12:00:00Z','2026-10-15T12:00:00Z',NULL,NULL,NULL)",[id(100+n),id(1)]);
 for(let n=0;n<205;n++)await db.query("INSERT INTO finance_transactions VALUES($1,$2,'EXPENSE',1.10,'PAID','2026-10-15T12:00:00Z','2026-10-15T12:00:00Z',NULL,NULL,NULL)",[id(500+n),id(1)]);
 await db.query("INSERT INTO finance_transactions VALUES($1,$2,'COLLECTION',3.20,'PAID','2026-10-31T20:59:59Z',now(),$3,$4,now())",[id(400),id(2),id(5),id(3)]);
 await db.query("INSERT INTO finance_transactions VALUES($1,$2,'PRIME_EXPENSE',7,'PAID',now(),now(),NULL,$3,now())",[id(401),id(1),id(3)]);
 await db.query("INSERT INTO commission_entries VALUES($1,'DIRECTOR',$2)",[id(401),id(3)]);
 const owner=await service.listTransactions({id:id(3),role:'SUPER_ADMIN'});assert.equal(owner.length,412);assert.equal(owner.find(x=>x.id===id(400)).order_number,'TRX-TEST');assert.equal(owner.filter(x=>x.account_name==='Arşiv Hesap').length,411);
 const manager=await service.listTransactions({id:id(4),role:'ADMIN'});assert.equal(manager.length,411);assert(!manager.some(x=>x.id===id(401)));
 const expenses=owner.filter(x=>x.kind==='EXPENSE');assert.equal(expenses.length,205);assert.equal(report.financeTotals(expenses)[0].amount,225.5);
 const pending=await service.pendingCollections();assert.equal(pending.length,205);assert(!pending.some(x=>x.id===id(400)));
 const collections=owner.filter(x=>x.kind==='COLLECTION');assert.equal(collections.length,206);
 const totals=report.financeTotals(collections);assert.equal(totals.find(x=>x.currency==='TRY').amount,225.5);assert.equal(totals.find(x=>x.currency==='EUR').amount,3.2);
 assert.equal(report.financeDate('2026-10-31T21:00:00Z'),'2026-11-01');assert(report.inFinancePeriod('2026-09-30T21:00:00Z','2026-10-01','2026-10-31'));assert(!report.inFinancePeriod('2026-10-31T21:00:00Z','2026-10-01','2026-10-31'));assert(!report.inFinancePeriod('2026-10-15T12:00:00Z','2026-11-01','2026-10-01'));
 await pg.close();console.log('Finance history checks passed: >100 pending and approved collections, recorded order links, archived accounts preserved, director privacy, exact currency totals and Istanbul date boundaries.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
