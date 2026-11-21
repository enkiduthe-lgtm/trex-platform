const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),ts=require(path.join(root,'node_modules/typescript'));
const source=fs.readFileSync(path.join(root,'apps/admin/app/siparisler/sil/page.tsx'),'utf8').replace(/\r\n/g,'\n');
const transpile=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const controls={exports:{}};vm.runInNewContext(transpile(fs.readFileSync(path.join(root,'apps/admin/app/lib/async-controls.ts'),'utf8')),controls);
function extract(a,b){const start=source.indexOf(a),end=source.indexOf(b,start);assert(start>=0&&end>start);return source.slice(start,end);}
const cancelled={id:'cancelled',order_number:'TEST-1',status:'CANCELLED'},archived={id:'archived',order_number:'TEST-OLD',status:'CANCELLED'};
function setup(){
 const state={orders:[cancelled],deleted:[archived],selected:['cancelled'],reason:'Deneme kaydı',message:'',loadError:'',ready:true,loading:false},requests=[];
 const box=vm.createContext({Error,URLSearchParams,allowed:true,ready:true,loading:false,orders:state.orders,deleted:state.deleted,selected:state.selected,reason:state.reason,confirmBulk:true,testMode:true,testNumber:'TEST-1',testCandidate:cancelled,
  alive:{current:true},gate:{current:controls.exports.createRequestGate()},lock:{current:false},api:(route,init)=>new Promise((resolve,reject)=>requests.push({route,init,resolve,reject})),
  setMessage:value=>state.message=value,setBusy:value=>state.busy=value,setId:value=>state.id=value,setReason:value=>{state.reason=value;box.reason=value;},setConfirmBulk:value=>box.confirmBulk=value,
  setTestCandidate:value=>box.testCandidate=value,setTestNumber:value=>box.testNumber=value,
  setReady:value=>{state.ready=value;box.ready=value;},setLoading:value=>{state.loading=value;box.loading=value;},setLoadError:value=>state.loadError=value,
  setOrders:value=>{state.orders=value;box.orders=value;},setDeleted:value=>{state.deleted=value;box.deleted=value;},setSelected:value=>{state.selected=typeof value==='function'?value(state.selected):value;box.selected=state.selected;},
 });vm.runInContext(transpile(extract('async function load(','async function lookupTestOrder(')+extract('async function lookupTestOrder(','useEffect(')+extract('async function bulkArchive(','return <main')),box);return {state,requests,box};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
async function main(){
 const app=setup();const saving=app.box.action('cancelled');app.requests[0].resolve({});await flush();
 app.requests[1].reject(new Error('Refresh offline'));app.requests[2].resolve([]);await saving;
 assert(app.state.message.includes('Sipariş Listeden Silindi'),'A completed archive must not be reported as failed when the list refresh fails');
 assert(app.state.loadError);assert.equal(app.state.ready,false);await app.box.action('cancelled');assert.equal(app.requests.length,3,'Stale lists cannot authorize another archive');
 const blocked=setup();await blocked.box.action('unknown');assert.equal(blocked.requests.length,0);blocked.box.allowed=false;await blocked.box.action('cancelled');await blocked.box.lookupTestOrder();await blocked.box.bulkArchive();assert.equal(blocked.requests.length,0);
 const test=setup();test.box.testNumber='OTHER';await test.box.action('cancelled',false,true);assert.equal(test.requests.length,0,'The confirmed test order must match its exact order number');
 const bulk=setup();bulk.box.orders=[cancelled,{...cancelled,id:'second',order_number:'TEST-2'}];bulk.box.selected=['cancelled','second'];bulk.state.selected=bulk.box.selected;
 const pending=bulk.box.bulkArchive();bulk.requests[0].resolve({});await flush();bulk.requests[1].reject(new Error('Cannot archive'));await flush();bulk.requests[2].resolve([{...cancelled,id:'second',order_number:'TEST-2'}]);bulk.requests[3].resolve([archived,cancelled]);await pending;
 assert.deepEqual([...bulk.state.selected],['second'],'Only unfinished bulk targets stay selected');assert(bulk.state.message.includes('1 Sipariş Silindi'));assert(bulk.state.message.includes('TEST-2'));assert.equal(bulk.state.ready,true);
 const duplicate=setup();const first=duplicate.box.action('cancelled');await duplicate.box.action('cancelled');assert.equal(duplicate.requests.length,1);duplicate.requests[0].reject(new Error('Rejected'));await first;assert.equal(duplicate.box.lock.current,false);
 console.log('Order removal actions passed: success/refresh distinction, stale and role guards, exact test-order match, partial bulk selection and duplicate lock.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
