// Actual PostgreSQL queries with isolated data, no production access.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),ts=require(path.join(process.argv[2],'node_modules/typescript')),{PGlite}=require(path.join(process.argv[3],'node_modules/@electric-sql/pglite'));
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function load(file){file=path.resolve(file);const box={exports:{},Intl,Date,require(name){if(name==='@nestjs/common')return {Injectable:()=>t=>t,BadRequestException:Error,ConflictException:Error,NotFoundException:Error,ForbiddenException:Error,ServiceUnavailableException:Error};if(name==='./report-period')return load(path.join(path.dirname(file),'report-period.ts'));return {};}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,experimentalDecorators:true}}).outputText,box);return box.exports;}
async function main(){
 const pg=new PGlite(),db={async query(sql,args=[]){const r=await pg.query(sql,args);return {rows:r.rows,rowCount:Math.max(r.affectedRows??0,r.rows.length)};}};
 const {OrdersService}=load(path.join(root,'apps/api/src/orders/orders.service.ts')),service=new OrdersService(db);
 await pg.exec(`CREATE TABLE orders(id uuid PRIMARY KEY,status text,total_amount numeric(12,2),currency text,created_at timestamptz,sales_channel text);
 CREATE TABLE order_items(id uuid PRIMARY KEY,order_id uuid,product_name text,sku text,quantity int,unit_amount numeric(12,2));
 CREATE TABLE finance_accounts(id uuid PRIMARY KEY,currency text);
 CREATE TABLE finance_transactions(id uuid PRIMARY KEY,account_id uuid,kind text,amount numeric(12,2),occurred_at timestamptz,payment_status text);
 CREATE TABLE commission_entries(finance_transaction_id uuid,staff_role text,recipient_user_id uuid);
 CREATE TABLE returns(status text,requested_at timestamptz,completed_at timestamptz);CREATE TABLE shipments(status text,created_at timestamptz,updated_at timestamptz);CREATE TABLE support_tickets(status text,due_at timestamptz);`);
 async function order(n,currency,amount,time,status='PAID'){await db.query('INSERT INTO orders VALUES($1,$2,$3,$4,$5,\'RETAIL\')',[id(n),status,amount,currency,time]);await db.query("INSERT INTO order_items VALUES($1,$2,'Aynı Ürün','SKU-A',1,$3)",[id(n+100),id(n),amount]);}
 await order(1,'TRY',10,'2026-09-30T21:00:00Z');await order(2,'TRY',20,'2026-10-31T20:59:59Z');await order(3,'TRY',999,'2026-10-31T21:00:00Z');await order(4,'USD',500,'2026-10-15T12:00:00Z');await order(5,'TRY',100,'2026-10-15T12:00:00Z','CANCELLED');
 await pg.exec(`INSERT INTO finance_accounts VALUES('${id(10)}','TRY'),('${id(11)}','USD');
 INSERT INTO finance_transactions VALUES('${id(20)}','${id(10)}','COLLECTION',12.10,'2026-10-15T12:00:00Z','PAID'),('${id(21)}','${id(10)}','COLLECTION',999,'2026-10-15T12:00:00Z','PENDING'),('${id(22)}','${id(11)}','COLLECTION',500,'2026-10-15T12:00:00Z','PAID'),('${id(23)}','${id(10)}','EXPENSE',2.10,'2026-10-15T12:00:00Z','PAID'),('${id(24)}','${id(10)}','PRIME_EXPENSE',5,'2026-10-15T12:00:00Z','PAID');
 INSERT INTO commission_entries VALUES('${id(24)}','DIRECTOR','${id(90)}');
 INSERT INTO shipments VALUES('IN_TRANSIT','2026-09-30T21:00:00Z',now()),('IN_TRANSIT','2026-10-31T21:00:00Z',now());`);
 const data=await service.reportSummary(30,'2026-10-01','2026-10-31','TRY',{id:id(90),role:'SUPER_ADMIN'});
 assert.equal(data.totals.order_count,3);assert.equal(data.totals.revenue,'30.00');assert.equal(Number(data.totals.average_order),15);assert.equal(data.daily.length,31);assert.equal(data.daily[0].amount,'10.00');assert.equal(data.daily[30].amount,'20.00');assert.equal(data.financial.income,'12.10');assert.equal(data.financial.expense,'7.10');assert.equal(data.financial.net,'5.00');assert.equal(data.topProducts[0].amount,'30.00');assert.equal(data.topProducts[0].count,2);
 const usd=await service.reportSummary(30,'2026-10-01','2026-10-31','USD');assert.equal(usd.totals.revenue,'500.00');assert.equal(usd.financial.income,'500.00');
 const manager=await service.reportSummary(30,'2026-10-01','2026-10-31','TRY',{id:id(91),role:'ADMIN'});assert.equal(manager.financial.expense,'2.10');assert.equal(manager.financial.net,'10.00');
 const operations=await service.operationalSummary(30,'2026-10-01','2026-10-31');assert.equal(operations.shipments_active,1);
 for(const [from,to,currency] of [['2026-02-30','2026-03-01','TRY'],['2026-11-01','2026-10-01','TRY'],['2000-01-01','2026-10-01','TRY'],['2026-10-01','2026-10-31','BAD'],['2026-10-01','bad','TRY']])await assert.rejects(()=>service.reportSummary(30,from,to,currency));
 await pg.close();console.log('Management report checks passed: Istanbul inclusive calendar dates, cancelled-order separation, TRY/USD isolation, pending-cash exclusion, exact cash totals, director privacy, operational dates and invalid filter rejection.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
