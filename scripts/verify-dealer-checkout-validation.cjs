const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),ts=require(path.join(root,'node_modules/typescript'));
const transpile=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const validation={exports:{}};
vm.runInNewContext(transpile(fs.readFileSync(path.join(root,'apps/admin/app/lib/dealer-order-validation.ts'),'utf8')),validation);
const source=fs.readFileSync(path.join(root,'apps/admin/app/bayi-portal/page.tsx'),'utf8');
function extract(startText,endText){const start=source.indexOf(startText),end=source.indexOf(endText,start);assert(start>=0&&end>start);return source.slice(start,end);}
const valid={recipientName:' Deneme Alıcı ',contactEmail:' TEST@EXAMPLE.COM ',phone:' 05320000000 ',city:' Bursa ',district:' Nilüfer ',addressLine:' Deneme adresi ',postalCode:'',paymentMethod:'TRANSFER',currency:'TRY',productId:'',quantity:1};
class ApiError extends Error{constructor(message,status){super(message);this.status=status;}}
async function main(){
 const state={errors:{},fee:'',message:'',focus:'',busy:false,created:null,tab:'Yeni Sipariş'},requests=[];
 const event={preventDefault(){},currentTarget:{reportValidity:()=>true}};
 const context=vm.createContext({...validation.exports,Error,ApiError,
  ready:true,unconfirmedOrder:false,creationError:'',cartNeedsReview:false,currencyChange:null,editingItemId:null,priceOverride:'',packSize:1,insufficientCommission:false,form:{...valid,recipientName:'   '},codServiceFee:'75',
  items:[{productId:'tea',quantity:2,unitAmount:'500.00',currency:'TRY'}],options:{products:[{id:'tea',available_quantity:10}],warehouses:[{id:'warehouse'}]},
  totals:[{currency:'TRY',amount:'1000.00'}],
  actionLock:{current:false},pendingOrder:{current:null},crypto:{randomUUID:()=>`request-${requests.length}`},
  portalAlive:{current:true},accountRefreshQueued:{current:false},refreshAccountSummary:async()=>{},
  orderViewGate:{current:{begin:()=>1,isCurrent:()=>context.viewUnchanged!==false}},viewUnchanged:true,
  setDeliveryErrors:value=>state.errors=value,setFeeError:value=>state.fee=value,setMessage:value=>state.message=value,setBusy:value=>state.busy=value,
  setUnconfirmedOrder:value=>{state.unconfirmed=value;context.unconfirmedOrder=value;},
  requestAnimationFrame:callback=>callback(),document:{getElementById:id=>({focus:()=>state.focus=id})},
  api:(url,options)=>new Promise((resolve,reject)=>requests.push({url,options,resolve,reject})),
  setCreatedOrder:value=>state.created=value,setEditingItemId(){},setItems(){},setForm:value=>state.resetForm=value,setCodServiceFee(){},setTab:value=>state.tab=value,initial:valid,email:'dealer@example.com',refreshAfterAction:async()=>{},
 });
 vm.runInContext(transpile(extract('  async function action(','  function updateQuantity(')+extract('  async function sendOrderRequest(','  return <main')),context);
 context.creationError='Fiyatlar alınamadı';await context.create(event);assert.equal(requests.length,0,'Unavailable pricing must block new orders');context.creationError='';
 context.cartNeedsReview=true;await context.create(event);assert.equal(requests.length,0,'Changed prices or stock must be reviewed before posting');context.cartNeedsReview=false;
 context.form.productId='unfinished-product';await context.create(event);assert.equal(requests.length,0);assert.equal(state.focus,'bayi-urun-secimi');context.form.productId='';
 context.priceOverride='150.00';await context.create(event);assert.equal(requests.length,0,'Unsubmitted price drafts must not be silently omitted');context.priceOverride='';
 await context.create(event);
 assert(state.errors.recipientName);assert.equal(state.focus,'bayi-recipientName');assert.equal(requests.length,0);
 context.form={...valid,paymentMethod:'COD_CARD'};context.codServiceFee='75.005';
 await context.create(event);assert(state.fee);assert.equal(state.focus,'bayi-cod-service-fee');assert.equal(requests.length,0);
 context.form={...valid};event.currentTarget.reportValidity=()=>false;
 await context.create(event);assert.equal(requests.length,0,'Native e-mail and input validity still blocks submission');
 event.currentTarget.reportValidity=()=>true;
 context.totals=[{currency:'TRY',amount:'10000000000.00'}];await context.create(event);assert.equal(requests.length,0);assert(state.message.includes('kayıt sınırını'));
 context.totals=[{currency:'TRY',amount:'0.00'}];await context.create(event);assert.equal(requests.length,0);assert(state.message.includes('sıfırdan büyük'));
 context.totals=[{currency:'TRY',amount:'1000.00'}];
 const pending=context.create(event);await context.create(event);
 assert.equal(requests.length,1,'Double clicks must not create two orders');
 requests[0].reject(new Error('connection lost'));await pending;
 assert.equal(state.created,null);assert(context.pendingOrder.current,'A lost response retains the retry key');
 assert.equal(state.unconfirmed,true);
 await context.create(event);assert.equal(requests.length,1,'An unresolved intent blocks a second edited checkout');
 context.form={...valid,currency:'USD',paymentMethod:'HAND_CASH'};
 const retry=context.retryUnconfirmedOrder();assert.equal(requests.length,2);
 context.viewUnchanged=false;state.tab='Primlerim';
 assert.equal(requests[0].options.body,requests[1].options.body,'Recovery must resend the original request, never reconstruct an edited draft');
 assert.equal(requests[0].options.headers['Idempotency-Key'],requests[1].options.headers['Idempotency-Key']);
 const body=JSON.parse(requests[1].options.body);assert.equal(body.phone,'05320000000');assert.equal(body.paymentMethod,'TRANSFER');assert.equal(body.items[0].quantity,2);
 requests[1].resolve({id:'order',order_number:'TEST-1',status:'PENDING_PAYMENT',total_amount:'1000.00',currency:'TRY'});await retry;
 assert.equal(state.created.order_number,'TEST-1');assert.equal(context.pendingOrder.current,null);assert.equal(state.busy,false);
 assert.equal(state.tab,'Primlerim','A completed order still confirms success without hijacking the section the user chose while waiting');
 assert.equal(state.unconfirmed,false);assert.equal(state.resetForm.currency,'TRY');assert.equal(state.resetForm.paymentMethod,'TRANSFER');
 context.pendingOrder.current={body:requests[0].options.body,key:'known-error'};
 const known=context.action(()=>context.sendOrderRequest(requests[0].options.body,'known-error'));requests[2].reject(new ApiError('Price rejected',409));await known;
 assert.equal(context.pendingOrder.current,null);assert.equal(state.unconfirmed,false);
 context.pendingOrder.current={body:requests[0].options.body,key:'incomplete-response'};
 const malformed=context.action(()=>context.sendOrderRequest(requests[0].options.body,'incomplete-response'));requests[3].resolve({});await malformed;
 assert.equal(state.unconfirmed,true);assert(context.pendingOrder.current,'An incomplete successful response must not erase the original intent');
 for(const status of [408,429,499]){
  context.pendingOrder.current={body:requests[0].options.body,key:'transient-'+status};
  const attempt=context.action(()=>context.sendOrderRequest(requests[0].options.body,'transient-'+status));
  requests.at(-1).reject(new ApiError('Temporary response',status));await attempt;
  assert.equal(context.pendingOrder.current.key,'transient-'+status);assert.equal(state.unconfirmed,true);
 }
 console.log('Dealer checkout passed: delivery errors, fee precision, native input validity, duplicate clicks, normalized retries, and successful confirmation.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
