const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),ts=require(path.join(root,'node_modules/typescript'));
const source=fs.readFileSync(path.join(root,'apps/admin/app/siparisler/[id]/page.tsx'),'utf8').replace(/\r\n/g,'\n');
const start=source.indexOf('  useEffect(() => {\n    let active = true;\n    setData(null);'),end=source.indexOf('\n  return (',start);assert(start>0&&end>start);
const code=ts.transpileModule(source.slice(start,end),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const flush=()=>new Promise(resolve=>setImmediate(resolve));
async function main(){
 const effects=[],requests=[],state={data:null,invoice:null};let effectIndex=0;
 const box=vm.createContext({Error,id:'first',role:'ADMIN',loadAttempt:0,
  useEffect(fn,deps){const i=effectIndex++;const previous=effects[i];if(previous&&deps.every((value,n)=>value===previous.deps[n]))return;previous?.cleanup?.();effects[i]={deps,cleanup:fn()};},
  api:route=>new Promise((resolve,reject)=>requests.push({route,resolve,reject})),setData:value=>state.data=value,setInvoice:value=>state.invoice=value,setLoading(){},setArasCheck(){},setOperationMessage(){},setError(){},
 });
 const render=()=>{effectIndex=0;vm.runInContext(code,box);};
 render();assert.equal(requests.length,1);requests[0].resolve({id:'first',order_number:'FIRST'});await flush();
 box.role='SUPER_ADMIN';render();assert.equal(requests.length,2,'A permission recheck must not reload or blank the order detail');assert.equal(state.data.id,'first');assert.equal(requests[1].route,'/admin/orders/first/invoice');
 requests[1].resolve({id:'invoice'});await flush();assert.equal(state.invoice.id,'invoice');
 box.role='';render();assert.equal(state.invoice,null,'Director-only invoice state is cleared when the role is no longer verified');assert.equal(state.data.id,'first');assert.equal(requests.length,2);
 box.role='SUPER_ADMIN';render();assert.equal(requests.length,3);box.id='second';render();assert.equal(requests.length,5);
 requests[2].resolve({id:'late-first-invoice'});requests[3].resolve({id:'second'});requests[4].resolve({id:'second-invoice'});await flush();
 assert.equal(state.data.id,'second');assert.equal(state.invoice.id,'second-invoice');
 box.loadAttempt++;render();assert.equal(requests.length,7,'Explicit order retry still reloads order and authorized invoice');effects.forEach(effect=>effect.cleanup?.());requests[5].resolve({id:'closed'});requests[6].resolve({id:'closed-invoice'});await flush();assert.equal(state.data,null);assert.equal(state.invoice,null);
 console.log('Order detail permission loading passed: no duplicate order loads during role rechecks, director invoice isolation, route changes, explicit retry and disposed reads.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
