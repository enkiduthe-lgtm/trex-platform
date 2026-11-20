const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const ts=require(path.join(root,'node_modules/typescript'));
const React=require(path.join(root,'node_modules/react'));
const {renderToStaticMarkup}=require(path.join(root,'node_modules/react-dom/server'));
function load(file){
 const context={exports:{},require:specifier=>specifier.endsWith('.css')?{default:{}}:
  specifier.startsWith('.')?load(path.resolve(path.dirname(file),specifier+'.ts')):
  require(path.join(root,'node_modules',specifier))};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{
  target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,
 }}).outputText,context);
 return context.exports;
}
const {OrderDetails}=load(path.join(root,'apps/admin/app/bayi-portal/order-details.tsx'));
const order={id:'order',order_number:'TEST-1',status:'DELIVERED',total_amount:'200.00',currency:'TRY',
 created_at:'2026-11-20T10:00:00Z',payment_method:'bank_transfer',payment_status:'SUCCEEDED',payment_amount:'200.00',
 has_shipment:true,items:[{id:'item',product_name:'Deneme Ürünü',sku:'TEST',quantity:2,unit_amount:'100.00',line_total:'200.00'}],address:null,
 commissions:[
  {id:'earn',order_item_id:'item',amount:'100.10',currency:'TRY',status:'CONFIRMED',entry_kind:'EARN',created_at:'2026-11-20T10:00:00Z'},
  {id:'reverse',order_item_id:'item',amount:'-20.05',currency:'TRY',status:'REVERSED',entry_kind:'REVERSAL',created_at:'2026-11-20T10:00:00Z'},
  {id:'pending',order_item_id:'item',amount:'30.00',currency:'TRY',status:'PENDING',entry_kind:'EARN',created_at:'2026-11-20T10:00:00Z'},
  {id:'euro',order_item_id:'item',amount:'12.00',currency:'EUR',status:'CONFIRMED',entry_kind:'EARN',created_at:'2026-11-20T10:00:00Z'},
 ],deductions:[{id:'fee',amount:'5.01',currency:'TRY',note:'İade kargo bedeli',created_at:'2026-11-20T10:00:00Z'}]};
const render=value=>renderToStaticMarkup(React.createElement(OrderDetails,{order:value,onClose(){},onTrack(){},onOpenCommissions(){}}));
const html=render(order);
const formatted=(value,currency)=>Number(value).toLocaleString('tr-TR',{style:'currency',currency});
assert(html.includes(formatted('75.04','TRY')),'Net commission must subtract reversals and cargo fees, exclude pending earnings');
assert(html.includes(formatted('12.00','EUR')),'Currencies must remain separate');
assert(html.includes('Havale / EFT')&&html.includes('Ödeme doğrulandı'));
assert(html.includes('Deneme Ürünü')&&html.includes('Prim ters kaydı'));
assert(html.includes('Kargo Hareketleri'));
const legacy=render({...order,has_shipment:false,payment_method:null,payment_status:null,payment_amount:null,commissions:undefined,deductions:undefined});
assert(!legacy.includes('Kargo Hareketleri'));
assert(legacy.includes('Ödeme kaydı yok')&&legacy.includes('henüz prim hareketi kaydedilmemiş'));
console.log('Dealer order detail passed: exact net commission, separate currencies, pending earnings, payment status, and missing records.');
