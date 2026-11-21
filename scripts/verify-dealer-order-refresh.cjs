const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),ts=require(path.join(root,'node_modules/typescript'));
const source=fs.readFileSync(path.join(root,'apps/admin/app/bayi-portal/order-detail-panel.tsx'),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function mount(order,loadedAt,visibility='visible'){
 const values=[],refs=[],effects=[],requests=[],events=new Map(),documentEvents=new Map();
 let stateIndex=0,refIndex=0,tick,cleared=false;
 const react={
  useState(initial){const index=stateIndex++;if(!(index in values))values[index]=typeof initial==='function'?initial():initial;return [values[index],value=>values[index]=typeof value==='function'?value(values[index]):value];},
  useRef(initial){const index=refIndex++;return refs[index]??(refs[index]={current:initial});},
  useEffect(effect){effects.push(effect);},
 };
 const document={visibilityState:visibility,addEventListener:(name,fn)=>documentEvents.set(name,fn),removeEventListener:(name,fn)=>{if(documentEvents.get(name)===fn)documentEvents.delete(name);}};
 const box={exports:{},Error,document,window:{setInterval:(fn,period)=>{assert.equal(period,30000);tick=fn;return 1;},clearInterval:()=>cleared=true,
  addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:(name,fn)=>{if(events.get(name)===fn)events.delete(name);}},
  require(name){if(name==='react')return react;if(name==='react/jsx-runtime')return {jsx:(type,props)=>({type,props})};if(name==='../lib/api')return {api:url=>new Promise((resolve,reject)=>requests.push({url,resolve,reject}))};if(name==='./order-details')return {OrderDetails:()=>{}};throw Error(name);},
 };
 vm.runInNewContext(code,box);
 function render(next=order,nextLoadedAt=loadedAt){stateIndex=0;refIndex=0;return box.exports.OrderDetailPanel({order:next,loadedAt:nextLoadedAt,onClose(){},onTrack(){},onOpenCommissions(){}});}
 render();const cleanup=effects.shift()();
 return {values,refs,requests,events,documentEvents,document,cleanup,render,tick:()=>tick(),get cleared(){return cleared;}};
}
async function main(){
 const order={id:'first',order_number:'TEST-1',status:'SHIPPED'},now=new Date().toISOString();
 const app=mount(order,now);
 assert.equal(app.requests.length,0,'Freshly opened details must not immediately duplicate the initial read');
 const pending=app.refs[0].current();await app.refs[0].current();app.tick();
 assert.equal(app.requests.length,1);
 assert.equal(app.requests[0].url,'/dealer-portal/orders/first');
 app.requests[0].resolve({...order,status:'DELIVERED'});await pending;
 assert.equal(app.values[0].order.status,'DELIVERED');assert(app.values[0].updatedAt);
 const snapshot=app.values[0],failure=app.refs[0].current();
 app.requests[1].reject(new Error('offline'));await failure;
 assert.equal(app.values[0],snapshot,'Read failures preserve the last labelled order snapshot');assert.equal(app.values[2],'offline');
 const wrong=app.refs[0].current();app.requests[2].resolve({id:'someone-else'});await wrong;
 assert.equal(app.values[0],snapshot,'A mismatched response must never replace the selected order');assert(app.values[2].includes('Beklenen sipariş'));
 app.document.visibilityState='hidden';app.tick();assert.equal(app.requests.length,3);
 app.document.visibilityState='visible';app.documentEvents.get('visibilitychange')();
 app.requests[3].resolve({...order,status:'DELIVERED'});await flush();assert.equal(app.values[2],'');
 const closing=app.refs[0].current();const oldRefresh=app.refs[0].current;
 app.cleanup();app.requests[4].resolve({...order,status:'CANCELLED'});await closing;
 assert.equal(app.values[0].order.status,'DELIVERED');assert.equal(app.refs[0].current,null);assert(app.cleared);
 assert.equal(app.events.size,0);assert.equal(app.documentEvents.size,0);
 await oldRefresh();assert.equal(app.requests.length,5,'Disposed refresh functions must not start another read');
 const view=app.render({id:'second',status:'PROCESSING'},now);
 assert.equal(view.props.order.id,'second','A newly selected order must not show the previous customer snapshot before effects run');
 const stale=mount(order,'2026-01-01T00:00:00Z');assert.equal(stale.requests.length,1,'Returning to an old detail must refresh immediately');
 stale.cleanup();stale.requests[0].resolve(order);await flush();
 console.log('Dealer detail refresh passed: coalesced reads, delivered status, preserved snapshots, selected-order isolation, hidden tabs, disposal and stale reopen.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
