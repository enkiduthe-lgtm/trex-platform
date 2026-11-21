const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),ts=require(path.join(root,'node_modules/typescript'));
const source=fs.readFileSync(path.join(root,'apps/admin/app/bayi-portal/tracking-panel.tsx'),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const flush=()=>new Promise(resolve=>setImmediate(resolve));
async function main(){
 const values=[],refs=[],effects=[],requests=[],events=new Map(),documentEvents=new Map();let index=0,refIndex=0,tick,cleared=false;
 const document={visibilityState:'visible',addEventListener:(name,fn)=>documentEvents.set(name,fn),removeEventListener:(name,fn)=>{if(documentEvents.get(name)===fn)documentEvents.delete(name);}};
 const box={exports:{},Error,document,window:{setInterval:(fn,period)=>{assert.equal(period,30000);tick=fn;return 1;},clearInterval:()=>cleared=true,
  addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:(name,fn)=>{if(events.get(name)===fn)events.delete(name);}},
  require(name){
   if(name==='react')return {useState(initial){const slot=index++;if(!(slot in values))values[slot]=initial;return [values[slot],value=>values[slot]=value];},useRef(initial){const slot=refIndex++;return refs[slot]??(refs[slot]={current:initial});},useEffect:effect=>effects.push(effect)};
   if(name==='react/jsx-runtime')return {jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};
   if(name==='../lib/api')return {api:url=>new Promise((resolve,reject)=>requests.push({url,resolve,reject}))};
   if(name==='../lib/finance-report')return {financeDateTime:value=>value};
   if(name.endsWith('.css'))return {default:{}};
   throw Error(name);
  },
 };
 vm.runInNewContext(code,box);
 box.exports.TrackingPanel({orderId:'own-order',onClose(){}});const cleanup=effects.shift()();
 assert.equal(requests.length,1);assert.equal(requests[0].url,'/dealer-portal/orders/own-order/tracking');
 tick();events.get('focus')();documentEvents.get('visibilitychange')();assert.equal(requests.length,1,'Overlapping visibility events must share the active read');
 const delivered={order_id:'own-order',order_number:'TEST-1',status:'DELIVERED',tracking_number:'123456789',events:[]};
 requests[0].resolve(delivered);await flush();assert.equal(values[0],delivered);assert(values[3]);
 document.visibilityState='hidden';tick();assert.equal(requests.length,1);
 document.visibilityState='visible';documentEvents.get('visibilitychange')();assert.equal(requests.length,2,'Returning to the tab refreshes tracking immediately');
 requests[1].reject(new Error('offline'));await flush();assert.equal(values[0],delivered);assert.equal(values[2],'offline');
 const wrong=refs[0].current();requests[2].resolve({...delivered,order_id:'other-order'});await wrong;
 assert.equal(values[0],delivered);assert(values[2].includes('Beklenen sipariş'));
 const oldRefresh=refs[0].current,closing=oldRefresh();cleanup();
 requests[3].resolve({...delivered,status:'CANCELLED'});await closing;
 assert.equal(values[0],delivered);assert.equal(refs[0].current,null);assert(cleared);
 assert.equal(events.size,0);assert.equal(documentEvents.size,0);
 await oldRefresh();assert.equal(requests.length,4);
 console.log('Dealer tracking passed: delivered status, visibility refresh, duplicate reads, retained snapshot, wrong-order rejection and closed views.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
