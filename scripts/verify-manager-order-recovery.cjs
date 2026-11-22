// Actual list loader and refresh effect with controlled reads; no real orders or carrier calls.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),ts=require(path.join(root,'node_modules/typescript'));
const source=fs.readFileSync(path.join(root,'apps/admin/app/siparisler/page.tsx'),'utf8').replace(/\r\n/g,'\n');
const transpile=value=>ts.transpileModule(value,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
function extract(start,end){const a=source.indexOf(start),b=source.indexOf(end,a);assert(a>=0&&b>a);return source.slice(a,b);}
const notes={exports:{}};vm.runInNewContext(transpile(fs.readFileSync(path.join(root,'apps/admin/app/lib/order-notes.ts'),'utf8')),notes);
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function setup(){
 const state={orders:[{id:'one',admin_note:'saved'}],selected:['one'],listLoading:false,listFailed:false,hasOlder:false,loadedUrl:'/admin/orders',orderNotes:{one:'unsaved draft'},stageCounts:{SHIPPED:1},message:''},requests=[],events=new Map(),documentEvents=new Map();let tick,cleanup;
 const box=vm.createContext({Promise,Error,Object,Set,...state,loadingOlder:false,validDates:true,listGeneration:{current:0},countGeneration:{current:0},listRequestRunning:{current:false},currentUrl:{current:'/admin/orders'},actionLock:{current:false},noteLocks:{current:new Set()},dirtyNotes:{current:new Set(['one'])},mergeOrderNotes:notes.exports.mergeOrderNotes,
  document:{visibilityState:'visible',addEventListener:(name,fn)=>documentEvents.set(name,fn),removeEventListener:name=>documentEvents.delete(name)},
  window:{setInterval:(fn,period)=>{assert.equal(period,30000);tick=fn;return 1;},clearInterval:()=>{tick=null;},addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:name=>events.delete(name)},
  useEffect:effect=>{cleanup=effect();},api:(route,init)=>new Promise((resolve,reject)=>requests.push({route,init,resolve,reject}))});
 for(const key of Object.keys(state))box['set'+key[0].toUpperCase()+key.slice(1)]=value=>{state[key]=typeof value==='function'?value(state[key]):value;box[key]=state[key];};
 vm.runInContext(transpile(extract('const load = (','  useEffect(() => {'))+'\nglobalThis.load=load;',box);
 vm.runInContext(transpile(extract('  useEffect(()=>{\n    const refresh=()=>{','  async function syncTracking()')),box);
 return {state,requests,box,events,documentEvents,tick:()=>tick(),cleanup:()=>cleanup()};
}
async function main(){
 const app=setup();app.tick();assert.equal(app.requests.length,2);app.events.get('focus')();app.documentEvents.get('visibilitychange')();assert.equal(app.requests.length,2,'Simultaneous refresh triggers must share one list read');
 app.requests[0].reject(new Error('Counts offline'));app.requests[1].reject(new Error('List offline'));await flush();assert.equal(app.state.listFailed,true);assert.equal(app.state.loadedUrl,null);assert.equal(app.state.orders.length,0);assert.equal(app.state.selected.length,0);assert.equal(app.state.orderNotes.one,'unsaved draft');
 app.tick();assert.equal(app.requests.length,4,'A failed background read must not permanently stop refresh');app.requests[2].resolve([{stage:'DELIVERED',count:1}]);app.requests[3].resolve([{id:'one',status:'DELIVERED',admin_note:'old saved'},{id:'two',admin_note:'other saved'}]);await flush();
 assert.equal(app.state.listFailed,false);assert.equal(app.state.loadedUrl,'/admin/orders');assert.equal(app.state.orders[0].status,'DELIVERED');assert.equal(app.state.orderNotes.one,'unsaved draft','Recovery must retain unsaved note edits');assert.equal(app.state.orderNotes.two,'other saved');assert.equal(app.state.stageCounts.DELIVERED,1);
 for(const mutate of [b=>b.document.visibilityState='hidden',b=>b.listLoading=true,b=>b.loadingOlder=true,b=>b.orders=Array(101).fill({}),b=>b.actionLock.current=true,b=>b.noteLocks.current.add('one'),b=>b.validDates=false,b=>b.currentUrl.current='/admin/orders?q=new']){const guarded=setup();mutate(guarded.box);guarded.tick();assert.equal(guarded.requests.length,0);}
 const stale=setup();stale.tick();stale.box.currentUrl.current='/admin/orders?q=new';stale.requests[0].resolve([]);stale.requests[1].reject(new Error('Old filter failed'));await flush();assert.equal(stale.state.listFailed,false);assert.equal(stale.state.orders[0].id,'one','An old filter failure must not clear the current list');
 const failure=setup();failure.box.listFailed=true;failure.box.loadedUrl=null;failure.box.validDates=false;failure.tick();assert.equal(failure.requests.length,0,'Recovery must still respect invalid date filters');
 app.cleanup();assert.equal(app.events.size,0);assert.equal(app.documentEvents.size,0);assert(app.requests.every(request=>request.init===undefined),'Refresh is read-only and must never create a carrier shipment');
 console.log('Manager order recovery passed: offline retry, delivered status refresh, coalesced visible-tab reads, draft retention, filter isolation, action guards and listener cleanup. No carrier or production writes.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
