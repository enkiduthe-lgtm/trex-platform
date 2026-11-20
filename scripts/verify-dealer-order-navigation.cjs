const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const ts=require(path.join(root,'node_modules/typescript'));
const transpile=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const controls={exports:{}};
vm.runInNewContext(transpile(fs.readFileSync(path.join(root,'apps/admin/app/lib/async-controls.ts'),'utf8')),controls);
const source=fs.readFileSync(path.join(root,'apps/admin/app/bayi-portal/page.tsx'),'utf8');
function extract(startText,endText){const start=source.indexOf(startText),end=source.indexOf(endText,start);assert(start>=0&&end>start);return source.slice(start,end);}
async function main(){
 const state={tab:'Primlerim',detail:{id:'previous'},tracking:'previous-shipment',message:'',busy:false,focus:0};
 const requests=[];
 const context=vm.createContext({Error,
  orderViewGate:{current:controls.exports.createRequestGate()},actionLock:{current:false},
  setTabState:value=>state.tab=value,setOrderDetail:value=>state.detail=value,
  setTrackingOrder:value=>state.tracking=value,setMessage:value=>state.message=value,setBusy:value=>state.busy=value,
  requestAnimationFrame:callback=>callback(),document:{getElementById:()=>({focus:()=>state.focus++})},
  api:url=>new Promise((resolve,reject)=>requests.push({url,resolve,reject})),
 });
 vm.runInContext(transpile(extract('  const setTab=','  useEffect(')+
  extract('  async function action(','  function updateQuantity(')+
  extract('  async function openOrder(','  async function confirmCancellation(')),context);
 const first=context.openOrder('unavailable');
 assert.equal(state.tab,'Primlerim','The source view remains open while the order is loading');
 await context.openOrder('duplicate');
 assert.equal(requests.length,1,'Rapid clicks must not duplicate reads');
 requests[0].reject(new Error('Sipariş bulunamadı'));
 await first;
 assert.equal(state.tab,'Primlerim');assert.equal(state.detail.id,'previous');
 assert.equal(state.message,'Sipariş bulunamadı');assert.equal(state.busy,false);
 const success=context.openOrder('owned');
 requests[1].resolve({id:'owned'});await success;
 assert.equal(state.tab,'Siparişlerim');assert.equal(state.detail.id,'owned');
 assert.equal(state.tracking,null);assert.equal(state.focus,1);
 const late=context.openOrder('late');
 vm.runInContext("setTab('Ürünler')",context);
 requests[2].resolve({id:'late'});await late;
 assert.equal(state.tab,'Ürünler');assert.equal(state.detail.id,'owned');assert.equal(state.focus,1);
 const lateError=context.openOrder('late-error');
 vm.runInContext("setTab('Yeni Sipariş')",context);
 requests[3].reject(new Error('Late error'));await lateError;
 assert.equal(state.message,'','A stale failure must not display an error on another screen');
 assert.equal(state.tab,'Yeni Sipariş');
 const closed=context.openOrder('closed');
 context.orderViewGate.current.invalidate();requests[4].resolve({id:'closed'});await closed;
 assert.equal(state.detail.id,'owned');assert.equal(state.busy,false);
 console.log('Dealer order navigation passed: duplicate clicks, retry after failure, successful navigation, old responses, old errors, and closed views.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
