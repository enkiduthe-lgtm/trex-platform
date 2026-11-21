const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const ts=require(path.join(process.argv[2],'node_modules/typescript'));
const validation={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../apps/admin/app/lib/dealer-order-validation.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,validation);
const source=fs.readFileSync(path.join(__dirname,'../apps/admin/app/bayi-portal/page.tsx'),'utf8');
const start=source.indexOf('  function addItem('),end=source.indexOf('  async function action(',start);
const code=ts.transpileModule(source.slice(start,end),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const tea={id:'tea',name:'Tea',amount:'100.00',currency:'TRY',packs:[{size:2,amount:'180.00'},{size:3,amount:'250.00'},{size:5,amount:'400.00'}]};
function run(quick,{count=7,size=5,override='9999',existing=[],editing=null,product=tea,unconfirmed=false}={}) {
  let result=existing,message='';
  const context={
    ready:true,unconfirmedOrder:unconfirmed,creationError:'',actionLock:{current:false},product,editingItemId:editing,validDealerMoney:validation.exports.validDealerMoney,
    form:{productId:product.id,quantity:count},packSize:size,priceOverride:override,items:existing,
    setMessage:value=>message=value,setItems:update=>result=update(result),
    setEditingItemId:()=>{},setPriceOverride:()=>{},setPackSize:()=>{},setForm:()=>{},setTab:()=>{},
  };
  vm.runInNewContext(code,context);
  context.addItem(quick?product:undefined);
  return {result,message};
}
let result=run(true);
assert.equal(result.result[0].quantity,1);
assert.equal(result.result[0].unitAmount,'100.00');
assert.equal(result.result[0].packSize,undefined);
for(const size of [2,3,5]){
  result=run(false,{count:2,size,override:''});
  assert.equal(result.result.length,1);
  assert.equal(result.result[0].quantity,2*size);
  assert.equal(result.result[0].packSize,size);
}
result=run(false,{count:1,size:2,override:'179.99'});
assert.equal(result.result.length,0);assert(result.message);
for(const override of ['100.005','1e3','10000000000']){
 result=run(false,{count:1,size:1,override});
 assert.equal(result.result.length,0);assert(result.message,'Invalid precision or excessive prices must not be rounded into a cart item');
}
const original={productId:'tea',quantity:1,unitAmount:'110.00',baseAmount:'100.00',currency:'TRY'};
const other={productId:'cap',quantity:2,unitAmount:'50.00',baseAmount:'45.00',currency:'TRY'};
result=run(true,{existing:[original,other],editing:'cap',product:{...tea,id:'new-product'}});
assert.equal(result.result.length,2);assert.equal(result.result[1],other);assert(result.message,'Catalog quick-add cannot silently discard an unfinished cart edit');
result=run(true,{unconfirmed:true});assert.equal(result.result.length,0);assert(result.message,'Unresolved orders cannot accept more cart products');
result=run(true,{existing:[original]});
assert.equal(result.result.length,1);assert(result.message);
result=run(false,{existing:[original,other],editing:'tea',count:2,size:3,override:'275.00'});
assert.equal(result.result.length,2);
assert.equal(result.result[0].quantity,6);
assert.equal(result.result[0].packAmount,'275.00');
assert.equal(result.result[0].baseAmount,'250.00');
assert.equal(result.result[1],other);
assert.equal(original.quantity,1);
result=run(false,{existing:[original],editing:'tea',count:1,size:5,override:'399.99'});
assert.equal(result.result[0],original);assert(result.message);
result=run(false,{existing:[original],editing:'tea',count:2,size:1,override:'120.00'});
assert.equal(result.result[0].packSize,undefined);
assert.equal(result.result[0].packAmount,undefined);
assert.equal(result.result[0].quantity,2);
result=run(false,{existing:[original,other],editing:'cap',count:1,size:1,override:'120.00'});
assert.equal(result.result[0],original);assert.equal(result.result[1],other);assert(result.message);
console.log('Dealer cart passed: package quantities, single-price reset, edit without duplicates, other rows preserved, and under-floor rejection.');
