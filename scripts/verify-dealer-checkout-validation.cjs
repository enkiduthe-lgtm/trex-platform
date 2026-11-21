const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),ts=require(path.join(root,'node_modules/typescript'));
const transpile=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const validation={exports:{}};
vm.runInNewContext(transpile(fs.readFileSync(path.join(root,'apps/admin/app/lib/dealer-order-validation.ts'),'utf8')),validation);
const source=fs.readFileSync(path.join(root,'apps/admin/app/bayi-portal/page.tsx'),'utf8');
function extract(startText,endText){const start=source.indexOf(startText),end=source.indexOf(endText,start);assert(start>=0&&end>start);return source.slice(start,end);}
const valid={recipientName:' Deneme Alıcı ',contactEmail:' TEST@EXAMPLE.COM ',phone:' 05320000000 ',city:' Bursa ',district:' Nilüfer ',addressLine:' Deneme adresi ',postalCode:'',paymentMethod:'TRANSFER',currency:'TRY',productId:'',quantity:1};
async function main(){
 const state={errors:{},fee:'',message:'',focus:'',busy:false,created:null},requests=[];
 const event={preventDefault(){},currentTarget:{reportValidity:()=>true}};
 const context=vm.createContext({...validation.exports,Error,
  ready:true,currencyChange:null,editingItemId:null,insufficientCommission:false,form:{...valid,recipientName:'   '},codServiceFee:'75',
  items:[{productId:'tea',quantity:2,unitAmount:'500.00',currency:'TRY'}],options:{products:[{id:'tea',available_quantity:10}],warehouses:[{id:'warehouse'}]},
  actionLock:{current:false},pendingOrder:{current:null},crypto:{randomUUID:()=>`request-${requests.length}`},
  setDeliveryErrors:value=>state.errors=value,setFeeError:value=>state.fee=value,setMessage:value=>state.message=value,setBusy:value=>state.busy=value,
  requestAnimationFrame:callback=>callback(),document:{getElementById:id=>({focus:()=>state.focus=id})},
  api:(url,options)=>new Promise((resolve,reject)=>requests.push({url,options,resolve,reject})),
  setCreatedOrder:value=>state.created=value,setEditingItemId(){},setItems(){},setForm(){},setCodServiceFee(){},setTab(){},initial:valid,email:'dealer@example.com',refreshAfterAction:async()=>{},
 });
 vm.runInContext(transpile(extract('  async function action(','  function updateQuantity(')+extract('  async function create(','  return <main')),context);
 await context.create(event);
 assert(state.errors.recipientName);assert.equal(state.focus,'bayi-recipientName');assert.equal(requests.length,0);
 context.form={...valid,paymentMethod:'COD_CARD'};context.codServiceFee='75.005';
 await context.create(event);assert(state.fee);assert.equal(state.focus,'bayi-cod-service-fee');assert.equal(requests.length,0);
 context.form={...valid};event.currentTarget.reportValidity=()=>false;
 await context.create(event);assert.equal(requests.length,0,'Native e-mail and input validity still blocks submission');
 event.currentTarget.reportValidity=()=>true;
 const pending=context.create(event);await context.create(event);
 assert.equal(requests.length,1,'Double clicks must not create two orders');
 requests[0].reject(new Error('connection lost'));await pending;
 assert.equal(state.created,null);assert(context.pendingOrder.current,'A lost response retains the retry key');
 context.form={...valid,recipientName:'Deneme Alıcı',phone:'05320000000',contactEmail:'test@example.com',city:'Bursa',district:'Nilüfer',addressLine:'Deneme adresi'};
 const retry=context.create(event);assert.equal(requests.length,2);
 assert.equal(requests[0].options.body,requests[1].options.body,'Whitespace-only changes must not create another logical order on retry');
 assert.equal(requests[0].options.headers['Idempotency-Key'],requests[1].options.headers['Idempotency-Key']);
 const body=JSON.parse(requests[1].options.body);assert.equal(body.phone,'05320000000');assert.equal(body.paymentMethod,'TRANSFER');assert.equal(body.items[0].quantity,2);
 requests[1].resolve({id:'order',order_number:'TEST-1',status:'PENDING_PAYMENT',total_amount:'1000.00',currency:'TRY'});await retry;
 assert.equal(state.created.order_number,'TEST-1');assert.equal(context.pendingOrder.current,null);assert.equal(state.busy,false);
 console.log('Dealer checkout passed: delivery errors, fee precision, native input validity, duplicate clicks, normalized retries, and successful confirmation.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
