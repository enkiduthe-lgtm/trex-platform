const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),ts=require(path.join(root,'node_modules/typescript'));
function load(file){const box={exports:{},require:specifier=>load(path.resolve(path.dirname(file),specifier+'.ts'))};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,box);return box.exports;}
const helper=load(path.join(root,'apps/admin/app/lib/dealer-delivery-reuse.ts'));
const source=fs.readFileSync(path.join(root,'apps/admin/app/bayi-portal/page.tsx'),'utf8');
const start=source.indexOf('  function useOrderDelivery('),end=source.indexOf('  function openTracking(',start);assert(start>=0&&end>start);
const state={form:{recipientName:'Previous Customer',contactEmail:'old@example.com',paymentMethod:'COD_CARD',currency:'TRY',productId:'selected-product',quantity:3},candidate:null,tab:'Siparişlerim',created:{id:'previous-order'},focus:'',errors:{recipientName:'Required'}};
const items=[{productId:'tea',quantity:5,packAmount:'2490.00'}],beforeItems=JSON.stringify(items);
const box=vm.createContext({...helper,ready:true,unconfirmedOrder:false,actionLock:{current:false},email:'dealer@example.com',deliveryCandidate:null,
 setDeliveryCandidate:value=>{state.candidate=value;box.deliveryCandidate=value;},setCurrencyChange:value=>state.currencyChange=value,setCancelCandidate:value=>state.cancelCandidate=value,
 setMessage:value=>state.message=value,setForm:update=>state.form=update(state.form),setDeliveryErrors:value=>state.errors=value,setCreatedOrder:value=>state.created=value,setTab:value=>state.tab=value,
 requestAnimationFrame:callback=>callback(),document:{getElementById:id=>({focus:()=>state.focus=id})},
});
vm.runInContext(ts.transpileModule(source.slice(start,end),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,box);
const latest={order_number:'TEST-REFRESHED',address:{recipient_name:'Latest Customer',phone:'05320000000',city:'Bursa',district:'Nilüfer',address_line:'Latest Address',postal_code:'16000'}};
box.useOrderDelivery(latest);
assert.equal(state.form.recipientName,'Previous Customer','Selecting reuse only opens a review; it must not overwrite the draft yet');
assert.equal(state.candidate.sourceOrderNumber,'TEST-REFRESHED');assert.equal(state.candidate.delivery.addressLine,'Latest Address');assert.equal(state.focus,'bayi-alici-kullan');
box.confirmOrderDelivery();assert.equal(state.form.recipientName,'Latest Customer');assert.equal(state.form.contactEmail,'dealer@example.com');
assert.equal(state.form.paymentMethod,'COD_CARD');assert.equal(state.form.currency,'TRY');assert.equal(state.form.productId,'selected-product');assert.equal(state.form.quantity,3);
assert.equal(JSON.stringify(items),beforeItems,'Delivery reuse must not copy historical prices or alter the cart');
assert.equal(state.candidate,null);assert.equal(state.created,null);assert.equal(state.tab,'Yeni Sipariş');assert.equal(state.focus,'bayi-recipientName');
box.useOrderDelivery({...latest,address:null});assert.equal(state.candidate,null);assert(state.message.includes('bulunamadı'));
box.actionLock.current=true;box.useOrderDelivery(latest);assert.equal(state.candidate,null);
console.log('Dealer delivery reuse passed: explicit review, current delivery snapshot, dealer email, preserved cart and payment, missing address and busy guards.');
