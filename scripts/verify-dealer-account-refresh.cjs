const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),ts=require(path.join(root,'node_modules/typescript'));
const transpile=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const controls={exports:{}};vm.runInNewContext(transpile(fs.readFileSync(path.join(root,'apps/admin/app/lib/async-controls.ts'),'utf8')),controls);
const source=fs.readFileSync(path.join(root,'apps/admin/app/bayi-portal/page.tsx'),'utf8');
function extract(startText,endText){const start=source.indexOf(startText),end=source.indexOf(endText,start);assert(start>=0&&end>start);return source.slice(start,end);}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
async function main(){
 const state={summary:null,ledger:null,available:null,message:'',busy:false},requests=[];
 const box=vm.createContext({Error,portalAlive:{current:true},historyGate:{current:controls.exports.createRequestGate()},accountSummaryGate:{current:controls.exports.createRequestGate()},accountRefreshQueued:{current:false},actionLock:{current:false},
  api:route=>new Promise((resolve,reject)=>requests.push({route,resolve,reject})),setSummary:value=>state.summary=value,setLedger:value=>state.ledger=value,
  setAvailable:value=>state.available=value,setMessage:value=>state.message=value,setBusy:value=>state.busy=value,
 });
 vm.runInContext(transpile(extract('  async function refreshAccountSummary(','  async function openOrder(')+extract('  async function action(','  function updateQuantity(')),box);
 const settle=(offset,amount)=>{requests[offset].resolve({order_count:'1'});requests[offset+1].resolve([]);requests[offset+2].resolve([{currency:'TRY',amount}]);};
 const old=box.refreshAccountSummary(),fresh=box.refreshAccountSummary();assert.equal(requests.length,6);
 settle(3,'200.00');await fresh;settle(0,'100.00');await old;
 assert.equal(state.available[0].amount,'200.00','A slower old balance cannot replace a newer successful balance');
 let finish;const action=box.action(()=>new Promise(resolve=>finish=resolve));
 await box.refreshAccountSummary();await box.refreshAccountSummary();assert.equal(requests.length,6);assert(box.accountRefreshQueued.current);
 finish();await action;assert.equal(requests.length,9,'Summary refreshes requested during an order action are coalesced and run after the action');
 settle(6,'300.00');await flush();assert.equal(state.available[0].amount,'300.00');assert.equal(box.accountRefreshQueued.current,false);
 const reloadOld=box.refreshAccountSummary();box.accountSummaryGate.current.invalidate();settle(9,'50.00');await reloadOld;
 assert.equal(state.available[0].amount,'300.00','A full reload invalidates preceding summary reads');
 const failure=box.refreshAccountSummary();requests[12].reject(new Error('offline'));requests[13].resolve([]);requests[14].resolve([]);await failure;
 assert.equal(state.available[0].amount,'300.00');assert(state.message.includes('yenilenemedi'));
 const closing=box.refreshAccountSummary();box.portalAlive.current=false;box.accountSummaryGate.current.invalidate();settle(15,'999.00');await closing;
 assert.equal(state.available[0].amount,'300.00');await box.refreshAccountSummary();assert.equal(requests.length,18);
 box.portalAlive.current=true;
 const beforeAction=box.refreshAccountSummary();
 await box.action(async()=>{state.available=[{currency:'TRY',amount:'425.00'}];});
 settle(18,'300.00');await beforeAction;
 assert.equal(state.available[0].amount,'425.00','An old account read must not restore the balance before a completed order action');
 console.log('Dealer account summary passed: out-of-order balances, queued action refreshes, coalescing, full reload invalidation, preserved snapshots and unmounted views.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
