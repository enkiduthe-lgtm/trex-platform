// No live credentials, invoices, customer data, or external requests.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),ts=require(path.join(process.argv[2],'node_modules/typescript'));
let responses=[],calls=[];
const modules=new Map();
function load(file){if(modules.has(file))return modules.get(file);const box={exports:{},URL,Error,fetch:async(url,init)=>{calls.push({url,method:init.method??'GET'});const body=responses.shift();if(body===undefined)throw Error('Unexpected network request');return {ok:true,status:body===null?204:200,text:async()=>body===null?'':JSON.stringify(body)};},require(name){if(name==='@nestjs/common')return {Injectable:()=>t=>t,ServiceUnavailableException:Error,NotFoundException:Error,ConflictException:Error,BadRequestException:Error,ForbiddenException:Error};if(name==='./parasut-invoice.provider')return load('apps/api/src/orders/parasut-invoice.provider.ts');return {};}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,experimentalDecorators:true}}).outputText,box);modules.set(file,box.exports);return box.exports;}
async function main(){
 const {ParasutInvoiceProvider,ParasutInvoiceOutcomeUnknown}=load('apps/api/src/orders/parasut-invoice.provider.ts'),provider=new ParasutInvoiceProvider();provider.configuration=()=>({companyId:'123'});provider.accessToken=async()=> 'isolated-test-token';
 const document=type=>({data:{relationships:{active_e_document:{data:{id:'88',type}}}}});
 for(const type of ['e_archives','e_invoices']){calls=[];responses=[document(type),{data:{attributes:{url:'https://example.test/fatura.pdf?test=1'}}}];const result=await provider.pdf('42');assert(result.ready);assert.equal(result.url,'https://example.test/fatura.pdf?test=1');assert(calls[0].url.endsWith('/sales_invoices/42?include=active_e_document'));assert(calls[1].url.endsWith(`/${type}/88/pdf`));assert(calls.every(x=>x.method==='GET'));}
 responses=[document('e_archives'),null];assert.equal((await provider.pdf('42')).ready,false);
 responses=[{data:{relationships:{active_e_document:{data:null}}}}];await assert.rejects(()=>provider.pdf('42'),/Henüz Oluşmamış/);
 responses=[document('products')];await assert.rejects(()=>provider.pdf('42'),/Desteklenmiyor/);
 for(const url of ['javascript:alert(1)','http://example.test/a.pdf','https://user:pass@example.test/a.pdf']){responses=[document('e_archives'),{data:{attributes:{url}}}];await assert.rejects(()=>provider.pdf('42'),/Güvenli/);}
 calls=[];await assert.rejects(()=>provider.pdf('../secrets'));assert.equal(calls.length,0);
 const {OrdersService}=load('apps/api/src/orders/orders.service.ts');let invoice=null,pdfCalls=0;
 const db={query:async sql=>{assert(sql.startsWith('SELECT * FROM order_invoices'));return {rows:invoice?[invoice]:[]};}};
 const service=new OrdersService(db,undefined,{pdf:async id=>{pdfCalls++;assert.equal(id,'42');return {ready:true,url:'https://example.test/real.pdf'};}});
 await assert.rejects(()=>service.invoicePdf('order'),/Henüz Fatura/);
 invoice={provider_status:'DRAFT',provider_invoice_id:'42'};await assert.rejects(()=>service.invoicePdf('order'),/Gönderilmemiş/);assert.equal(pdfCalls,0);
 invoice={provider_status:'ISSUED',provider_invoice_id:'42'};assert.equal((await service.invoicePdf('order')).ready,true);assert.equal(pdfCalls,1);
 let attempts=0,discountAmount='10.00';
 invoice={id:'draft',provider_status:'DRAFT'};
 const invoiceDb={async query(sql,args){
  if(sql.includes('FROM orders o'))return {rows:[{status:'PROCESSING',currency:'TRY',cod_service_fee:'75.00',discount_amount:discountAmount,order_number:'TEST-1',created_at:'2026-11-05T21:01:00Z'}]};
  if(sql.includes('SELECT * FROM order_invoices'))return {rows:[invoice]};
  if(sql.includes('SELECT product_name'))return {rows:[{product_name:'Tea',quantity:1,unit_amount:'100.00'}]};
  if(sql.includes("SET provider_status='PENDING_PROVIDER'"))invoice.provider_status='PENDING_PROVIDER';
  if(sql.includes('SET provider_status=$2'))invoice.provider_status=args[1];
  return {rows:[]};
 },transaction(work){return work(this);}};
 const issueService=new OrdersService(invoiceDb,undefined,{issue:async input=>{
   attempts++;assert.equal(input.issueDate,'2026-11-06');assert.equal(input.lines[1].unitPrice,75);
   throw new ParasutInvoiceOutcomeUnknown();
 }});
 await assert.rejects(()=>issueService.issueInvoice('order',{id:'director'}),/Kuponlu sipariş/);
 assert.equal(attempts,0);discountAmount='0.00';
 await assert.rejects(()=>issueService.issueInvoice('order',{id:'director'}),ParasutInvoiceOutcomeUnknown);
 assert.equal(invoice.provider_status,'PENDING_PROVIDER');
 await assert.rejects(()=>issueService.issueInvoice('order',{id:'director'}),/sonucu bekleniyor/);
 assert.equal(attempts,1);
 console.log('Invoice PDF checks passed: actual issued-document lookup, e-invoice/archive URLs, pending PDF, absent/draft invoices, unsupported documents, unsafe URL rejection, and no invoice creation or database writes.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
