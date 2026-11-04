// Isolated PostgreSQL + actual report grouping. No live dealer or order writes.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),ts=require(path.join(process.argv[2],'node_modules/typescript')),{PGlite}=require(path.join(process.argv[3],'node_modules/@electric-sql/pglite'));
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function load(file){file=path.resolve(file);const box={exports:{},Intl,Date,Map,Set,BigInt,require(name){if(name==='@nestjs/common')return {Injectable:()=>t=>t,BadRequestException:Error,ConflictException:Error,NotFoundException:Error};if(name==='../orders/report-period'||name==='./report-totals'||name==='./finance-report')return load(path.resolve(path.dirname(file),name+'.ts'));return {};}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,experimentalDecorators:true}}).outputText,box);return box.exports;}
async function main(){
 const pg=new PGlite(),db={async query(sql,args=[]){const r=await pg.query(sql,args);return {rows:r.rows,rowCount:Math.max(r.affectedRows??0,r.rows.length)};}};
 const {DealersService}=load(path.join(root,'apps/api/src/dealers/dealers.service.ts')),service=new DealersService(db,{}),{groupDealerSales}=load(path.join(root,'apps/admin/app/lib/dealer-sales-report.ts'));
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),at=today+'T12:00:00+03:00';
 await pg.exec(`CREATE TABLE dealer_levels(id uuid PRIMARY KEY,name text);CREATE TABLE dealers(id uuid PRIMARY KEY,code text,company_name text,dealer_level_id uuid,status text);
 CREATE TABLE orders(id uuid PRIMARY KEY,order_number text,checkout_id uuid,status text,total_amount numeric(12,2),currency text,created_at timestamptz);
 CREATE TABLE order_items(id uuid PRIMARY KEY,order_id uuid,product_name text,sku text,quantity int,unit_amount numeric(12,2));
 CREATE TABLE audit_logs(id uuid PRIMARY KEY,entity_id uuid,entity_type text,action text,metadata jsonb,created_at timestamptz DEFAULT now());
 CREATE TABLE payments(id uuid PRIMARY KEY,checkout_id uuid,status text,created_at timestamptz);`);
 await db.query("INSERT INTO dealer_levels VALUES($1,'Eski Seviye'),($2,'Yeni Seviye')",[id(1),id(2)]);await db.query("INSERT INTO dealers VALUES($1,'D1','Bayi Bir',$2,'ACTIVE'),($3,'D2','Pasif Bayi',$2,'SUSPENDED')",[id(10),id(2),id(11)]);
 for(const [n,currency,total,status,dealer,level] of [[20,'TRY',35,'PAID',10,1],[21,'USD',50,'PAID',10,1],[22,'TRY',100,'CANCELLED',10,1],[23,'TRY',10,'PAID',11,null]]){
  await db.query('INSERT INTO orders VALUES($1,$2,$1,$3,$4,$5,$6)',[id(n),'ORDER-'+n,status,total,currency,at]);
  await db.query("INSERT INTO audit_logs(id,entity_id,entity_type,action,metadata) VALUES($1,$2,'order','order.dealer.created',$3)",[id(n+100),id(n),JSON.stringify({dealerId:id(dealer),...(level?{dealerLevelId:id(level)}:{})})]);
  await db.query('INSERT INTO order_items VALUES($1,$2,$3,$4,$5,$6)',[id(n+200),id(n),'Ürün','SKU-A',n===20?2:1,n===20?10:total]);
 }
 await db.query("INSERT INTO order_items VALUES($1,$2,'Ürün %100','SKU-B',1,10)",[id(250),id(20)]);
 await db.query("INSERT INTO audit_logs SELECT $1,entity_id,entity_type,action,metadata,created_at FROM audit_logs WHERE entity_id=$2",[id(300),id(20)]);
 await db.query('INSERT INTO payments VALUES($1,$2,\'PENDING\',$3),($4,$2,\'SUCCEEDED\',$3)',[id(400),id(20),at,id(401)]);
 const summary=await service.salesReport(30);assert.equal(summary.totals.revenue,'45.00');assert.equal(summary.totals.order_count,3);assert.equal(summary.totalsByCurrency.find(x=>x.currency==='USD').revenue,'50.00');const d1=summary.dealers.find(x=>x.id===id(10)&&x.currency==='TRY');assert.equal(d1.revenue,'35.00');assert.equal(d1.item_count,3);assert.equal(d1.dealer_level_name,'Eski Seviye');
 const rows=await service.salesReportDetail(today,today);assert.equal(rows.length,5);assert.equal(new Set(rows.map(x=>x.item_id)).size,5);assert.equal(rows.find(x=>x.order_id===id(20)).payment_status,'SUCCEEDED');assert.equal(rows.find(x=>x.dealer_id===id(11)).dealer_level_name,null);
 const dealerGroups=groupDealerSales(rows,'dealer'),paidTry=dealerGroups.find(x=>x.label.includes('D1')&&x.currency==='TRY'&&x.status==='PAID');assert.equal(paidTry.amount,'30.00');assert.equal(paidTry.orderCount,1);assert.equal(paidTry.quantity,3);assert(dealerGroups.some(x=>x.currency==='USD'&&x.amount==='50.00'));assert(dealerGroups.some(x=>x.status==='CANCELLED'));
 assert.equal((await service.salesReportDetail(today,today,undefined,'SKU-B')).length,1);assert.equal((await service.salesReportDetail(today,today,undefined,'%')).length,1);assert.equal((await service.salesReportDetail(today,today,id(11))).length,1);
 const before=new Date(Date.parse(today+'T00:00:00+03:00')-1000).toISOString();await db.query('UPDATE orders SET created_at=$1 WHERE id=$2',[before,id(23)]);assert.equal((await service.salesReportDetail(today,today)).length,4);
 await assert.rejects(()=>service.salesReportDetail(today,today,'not-a-uuid'));await assert.rejects(()=>service.salesReportDetail('2026-02-30',today));await assert.rejects(()=>service.salesReportDetail(today,today,undefined,undefined,'INVALID'));
 await pg.exec(`ALTER TABLE dealers ADD COLUMN contact_name text,ADD COLUMN contact_email text,ADD COLUMN contact_phone text,ADD COLUMN city text,ADD COLUMN region text,ADD COLUMN company_address text,ADD COLUMN tax_number text,ADD COLUMN tax_office text,ADD COLUMN monthly_sales_target numeric,ADD COLUMN created_at timestamptz DEFAULT now(),ADD COLUMN price_group_id uuid;
 CREATE TABLE dealer_price_groups(id uuid,name text);
 CREATE TABLE dealer_bank_accounts(id uuid,dealer_id uuid,account_holder text,iban text,is_verified boolean,is_primary boolean,created_at timestamptz);
 CREATE TABLE dealer_ledger_entries(dealer_id uuid,currency text,direction text,amount numeric);
 CREATE TABLE returns(id uuid,order_id uuid,status text,reason text,requested_at timestamptz,completed_at timestamptz);
 CREATE TABLE commission_entries(id uuid,dealer_id uuid,order_id uuid,order_item_id uuid,recipient_user_id uuid,amount numeric,currency text,status text,entry_kind text,created_at timestamptz,paid_at timestamptz,reversed_at timestamptz,note text);`);
 await db.query("INSERT INTO returns VALUES($1,$2,'REQUESTED','İade',now(),NULL),($3,$4,'REQUESTED','Diğer Bayi',now(),NULL)",[id(600),id(20),id(601),id(23)]);
 await db.query("INSERT INTO commission_entries(id,dealer_id,order_id,order_item_id,recipient_user_id,amount,currency,status,entry_kind,created_at) VALUES($1,$2,$3,$4,NULL,10,'TRY','CONFIRMED','EARN',now()),($5,$2,$3,$4,$6,999,'TRY','CONFIRMED','EARN',now()),($7,$8,$9,$10,NULL,20,'TRY','CONFIRMED','EARN',now())",[id(700),id(10),id(20),id(220),id(701),id(900),id(702),id(11),id(23),id(223)]);
 await pg.exec(`CREATE TABLE dealer_prim_requests(id uuid,dealer_id uuid,amount numeric,currency text,status text,due_date date,created_at timestamptz,paid_at timestamptz,reference_number text,note text);
 CREATE TABLE dealer_prim_deductions(id uuid,dealer_id uuid,return_id uuid,amount numeric,currency text,note text,created_at timestamptz);
 CREATE TABLE dealer_commission_spends(id uuid,dealer_id uuid,order_id uuid,amount numeric,created_at timestamptz);
 CREATE TABLE dealer_prim_refunds(id uuid,dealer_id uuid,order_id uuid,amount numeric,created_at timestamptz);`);
 for(const dealer of [10,11]){
  await db.query("INSERT INTO dealer_prim_requests VALUES($1,$2,5,'TRY','PAID',CURRENT_DATE,now(),now(),'REF','Not')",[id(800+dealer),id(dealer)]);
  await db.query("INSERT INTO dealer_prim_deductions VALUES($1,$2,$3,2,'TRY','Gerçek Kargo',now())",[id(820+dealer),id(dealer),id(dealer===10?600:601)]);
  await db.query('INSERT INTO dealer_commission_spends VALUES($1,$2,$3,8,now())',[id(840+dealer),id(dealer),id(dealer===10?20:23)]);
  await db.query('INSERT INTO dealer_prim_refunds VALUES($1,$2,$3,3,now())',[id(860+dealer),id(dealer),id(dealer===10?20:23)]);
 }
 const detail=await service.detail(id(10));assert.equal(detail.orders.length,3);assert.equal(detail.returns.length,1);assert.equal(detail.commissions.length,1);assert.equal(Number(detail.commissions[0].amount),10);assert.equal(detail.dealer.code,'D1');assert.equal(detail.requests.length,1);assert.equal(detail.requests[0].reference_number,'REF');assert.equal(detail.deductions.length,1);assert.equal(detail.spends.length,2);assert.equal(detail.spends.filter(x=>x.kind==='REFUND').length,1);await assert.rejects(()=>service.detail(id(999)));
 await pg.close();console.log('Dealer sales report checks passed: duplicate-audit and multi-line order totals, currency/status grouping, historical level snapshot, missing level disclosure, passive dealers, real payment state, SKU/literal search, Istanbul dates and invalid filters.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
