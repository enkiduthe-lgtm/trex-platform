// Isolated PostgreSQL query and actual UI grouping; no production writes.
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),ts=require(path.join(process.argv[2],'node_modules/typescript')),{PGlite}=require(path.join(process.argv[3],'node_modules/@electric-sql/pglite'));
function load(file){file=path.resolve(file);const box={exports:{},Intl,Date,Map,Set,BigInt,require(name){if(name==='@nestjs/common')return {Injectable:()=>t=>t,BadRequestException:Error};if(name==='./report-totals'||name==='./finance-report')return load(path.resolve(path.dirname(file),name+'.ts'));return {};}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,experimentalDecorators:true}}).outputText,box);return box.exports;}
async function main(){const pg=new PGlite(),db={query:(sql,args)=>pg.query(sql,args)};
 await pg.exec(`CREATE TYPE sales_channel_code AS ENUM('RETAIL');
 CREATE TABLE orders(id text,order_number text,status text,sales_channel sales_channel_code,total_amount numeric,currency text,created_at timestamptz,customer_id text,checkout_id text);
 CREATE TABLE order_items(id text,order_id text,product_name text,sku text,quantity int,unit_amount numeric);
 CREATE TABLE customers(id text,first_name text,last_name text,email text);CREATE TABLE checkout_sessions(id text,contact_name text,contact_email text);CREATE TABLE order_addresses(order_id text,recipient_name text);
 CREATE TABLE shipments(order_id text UNIQUE,provider text,status text);CREATE TABLE payments(id text,checkout_id text,provider text,created_at timestamptz);
 INSERT INTO orders VALUES('a','A','DELIVERED','RETAIL',35,'TRY','2026-10-01T00:00:00+03',null,'checkout'),('b','B','CANCELLED','RETAIL',99,'TRY','2026-10-02',null,null),('c','C','PAID','RETAIL',8,'USD','2026-10-03',null,null),('d','D','PAID','RETAIL',7,'TRY','2026-09-30T20:59:59Z',null,null);
 INSERT INTO order_items VALUES('1','a','Ürün','SKU',2,10),('2','a','İkinci','SKU2',1,10),('3','b','Ürün','SKU',1,99),('4','c','Ürün','SKU',1,8),('5','d','Ürün','SKU',1,7);
 INSERT INTO shipments VALUES('a','aras','DELIVERED'),('b','aras','CANCELLED');
 INSERT INTO payments VALUES('1','checkout','bank_transfer','2026-10-01'),('2','checkout','cash','2026-10-01');`);
 const {OrdersService}=load(path.join(root,'apps/api/src/orders/orders.service.ts')),{groupSales}=load(path.join(root,'apps/admin/app/lib/sales-groups.ts'));
 const rows=await new OrdersService(db).salesReport('2026-10-01','2026-10-31');assert.equal(rows.length,4);assert.equal(rows.find(r=>r.id==='a').payment_method,'cash');
 const groups=groupSales(rows,'carrier');assert.equal(groups.length,3);const delivered=groups.find(g=>g.status==='DELIVERED');assert.equal(delivered.orderCount,1);assert.equal(delivered.quantity,3);assert.equal(delivered.amount,'30.00');assert.equal(delivered.label,'aras');
 assert.equal(groups.find(g=>g.status==='CANCELLED').amount,'99.00');assert.equal(groups.find(g=>g.currency==='USD').label,'Kargo Kaydı Yok');
 await pg.exec(`INSERT INTO customers VALUES('member1','Aynı','İsim','bir@example.test'),('member2','Aynı','İsim','iki@example.test');UPDATE orders SET customer_id='member1' WHERE id='a';UPDATE orders SET customer_id='member2' WHERE id='b';`);
 const members=await new OrdersService(db).salesReport('2026-10-01','2026-10-31');const memberGroups=groupSales(members,'customer');assert.equal(memberGroups.length,2);assert.equal(memberGroups.find(g=>g.status==='DELIVERED').orderCount,1);assert.equal(memberGroups.find(g=>g.status==='DELIVERED').amount,'30.00');assert.ok(memberGroups.some(g=>g.label.includes('bir@example.test')));assert.ok(memberGroups.some(g=>g.label.includes('iki@example.test')));
 const sameName=members.map(r=>({...r,customer_email:null,status:'PAID'}));assert.equal(groupSales(sameName,'customer').length,2);
 await assert.rejects(()=>new OrdersService(db).salesReport('2026-10-31','2026-10-01'));
 const {CustomersService}=load(path.join(root,'apps/api/src/customers/customers.service.ts')),customers=new CustomersService(db);
 const customerReport=await customers.orderReport('member1','2026-10-01','2026-10-31');assert.equal(customerReport.length,2);assert.equal(customerReport[0].payment_method,'cash');assert.equal(customerReport.reduce((sum,r)=>sum+Number(r.line_total),0),30);
 await assert.rejects(()=>customers.orderReport('member1','2026-02-30','2026-10-31'));await assert.rejects(()=>customers.orderReport('member1','2026-10-31','2026-10-01'));
 await pg.exec(`INSERT INTO orders SELECT 'history'||n,'H'||n,'PAID','RETAIL',1,'TRY','2026-10-31T20:59:59Z','member1',null FROM generate_series(1,61) n;INSERT INTO order_items SELECT 'item'||n,'history'||n,'Ürün','SKU',1,1 FROM generate_series(1,61) n;INSERT INTO orders VALUES('outside','OUT','PAID','RETAIL',1,'TRY','2026-10-31T21:00:00Z','member1',null);INSERT INTO order_items VALUES('out-item','outside','Ürün','SKU',1,1);`);
 assert.equal((await customers.orders('member1')).length,63);assert.equal((await customers.orderReport('member1','2026-10-01','2026-10-31')).length,63);await pg.close();console.log('Carrier report: multi-item deduplication, currency/status separation, missing shipment, Istanbul boundary, latest payment and separate registered member identities passed.');}
main().catch(e=>{console.error(e);process.exitCode=1;});
