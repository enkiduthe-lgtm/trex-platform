const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),ts=require(path.join(root,'node_modules/typescript'));
const transpile=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const controls={exports:{}};vm.runInNewContext(transpile(fs.readFileSync(path.join(root,'apps/admin/app/lib/async-controls.ts'),'utf8')),controls);
const source=fs.readFileSync(path.join(root,'apps/admin/app/bayi-portal/page.tsx'),'utf8');
function extract(startText,endText){const start=source.indexOf(startText),end=source.indexOf(endText,start);assert(start>=0&&end>start);return source.slice(start,end);}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function setup(){
 const state={orders:[{id:'current',status:'DELIVERED'}],shipments:[],error:'',message:''},requests=[],events=new Map(),documentEvents=new Map();
 let cleanup,tick;
 const box=vm.createContext({Error,ready:true,tab:'Siparişlerim',portalAlive:{current:true},actionLock:{current:false},
  historyGate:{current:controls.exports.createRequestGate()},accountSummaryGate:{current:controls.exports.createRequestGate()},accountRefreshQueued:{current:false},
  api:route=>new Promise((resolve,reject)=>requests.push({route,resolve,reject})),setOrders:value=>state.orders=value,setShipments:value=>state.shipments=value,
  setHistoryError:value=>state.error=value,setMessage:value=>state.message=value,setBusy(){},refreshAccountSummary:async()=>{},
  useEffect:effect=>cleanup=effect(),document:{visibilityState:'visible',addEventListener:(name,fn)=>documentEvents.set(name,fn),removeEventListener:name=>documentEvents.delete(name)},
  window:{setInterval:fn=>{tick=fn;return 1;},clearInterval(){},addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:name=>events.delete(name)},
 });
 vm.runInContext(transpile(extract("  useEffect(()=>{\n    if(!ready||!['Siparişlerim'","  function addItem(")+extract('  async function action(','  function updateQuantity(')),box);
 const settle=(offset,status)=>{requests[offset].resolve([{id:'current',status}]);requests[offset+1].resolve([{id:'shipment',status}]);};
 return {state,requests,box,settle,tick:()=>tick(),events,documentEvents,cleanup:()=>cleanup()};
}
async function main(){
 const app=setup();assert.equal(app.requests.length,2);app.tick();assert.equal(app.requests.length,2,'Concurrent polling is coalesced');
 await app.box.action(async()=>{app.state.orders=[{id:'current',status:'CANCELLED'}];});
 app.settle(0,'PROCESSING');await flush();
 assert.equal(app.state.orders[0].status,'CANCELLED','A read started before an action cannot restore the old order status after the action');
 app.tick();app.settle(2,'CANCELLED');await flush();assert.equal(app.state.shipments[0].status,'CANCELLED');
 app.box.document.visibilityState='hidden';app.tick();assert.equal(app.requests.length,4);
 app.box.document.visibilityState='visible';app.documentEvents.get('visibilitychange')();assert.equal(app.requests.length,6);
 app.cleanup();app.settle(4,'PROCESSING');await flush();assert.equal(app.state.orders[0].status,'CANCELLED');
 assert.equal(app.events.size,0);assert.equal(app.documentEvents.size,0);app.tick();assert.equal(app.requests.length,6,'Disposed timers cannot start new reads');
 const failed=setup();await failed.box.action(async()=>{});failed.requests[0].reject(new Error('Old error'));failed.requests[1].resolve([]);await flush();
 assert.equal(failed.state.error,'','Old read failures must not warn after a newer action');failed.cleanup();
 console.log('Dealer history refresh passed: action/read race, stale failure, current shipment status, hidden tabs, coalescing and disposal.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
