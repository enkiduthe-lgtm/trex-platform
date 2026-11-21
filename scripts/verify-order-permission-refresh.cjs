const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),ts=require(path.join(root,'node_modules/typescript'));
const transpile=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const permissionModule={exports:{}};vm.runInNewContext(transpile(fs.readFileSync(path.join(root,'apps/admin/app/lib/order-permissions.ts'),'utf8')),permissionModule);
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function mount(){
 const values=[],refs=[],effects=[],requests=[],events=new Map(),documentEvents=new Map();let stateIndex=0,refIndex=0,tick,cleared=false;
 const react={useState(initial){const i=stateIndex++;if(!(i in values))values[i]=typeof initial==='function'?initial():initial;return [values[i],value=>values[i]=typeof value==='function'?value(values[i]):value];},useRef(initial){const i=refIndex++;return refs[i]??(refs[i]={current:initial});},useEffect:effect=>effects.push(effect)};
 const document={visibilityState:'visible',addEventListener:(name,fn)=>documentEvents.set(name,fn),removeEventListener:name=>documentEvents.delete(name)};
 const box={exports:{},Error,document,window:{setInterval:(fn,period)=>{assert.equal(period,60000);tick=fn;return 1;},clearInterval:()=>cleared=true,addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:name=>events.delete(name)},
  require(name){if(name==='react')return react;if(name==='./order-permissions')return permissionModule.exports;if(name==='./api')return {api:route=>new Promise((resolve,reject)=>requests.push({route,resolve,reject}))};throw Error(name);}};
 vm.runInNewContext(transpile(fs.readFileSync(path.join(root,'apps/admin/app/lib/use-order-permissions.ts'),'utf8')),box);
 const render=()=>{stateIndex=0;refIndex=0;return box.exports.useOrderPermissions();};render();const cleanup=effects.shift()();
 return {render,requests,events,documentEvents,document,cleanup,tick:()=>tick(),get cleared(){return cleared;}};
}
async function main(){
 const app=mount();assert.equal(app.render().permissions.edit,false);app.requests[0].resolve({user:{role:'ADMIN'}});await flush();app.requests[1].resolve({configured:true,grants:['ORDERS.VIEW','ORDERS.EDIT']});await flush();assert(app.render().permissions.edit);
 assert.equal(typeof app.events.get('focus'),'function','Open pages must re-check changed permissions on focus');
 app.events.get('focus')();app.events.get('focus')();app.tick();assert.equal(app.requests.length,3,'Concurrent refresh triggers are coalesced');
 assert.equal(app.render().loading,false,'Background rechecks must not restart dependent page loaders or discard forms');
 app.requests[2].resolve({user:{role:'ADMIN'}});await flush();app.requests[3].resolve({configured:true,grants:['ORDERS.VIEW']});await flush();assert.equal(app.render().permissions.edit,false,'Revoked edit grants disappear on an open page');
 app.document.visibilityState='hidden';app.tick();assert.equal(app.requests.length,4);app.document.visibilityState='visible';app.documentEvents.get('visibilitychange')();app.requests[4].reject(new Error('offline'));await flush();
 assert(Object.values(app.render().permissions).every(value=>!value));assert(app.render().error);assert.equal(app.render().role,'');
 const retry=app.render().refresh();app.requests[5].resolve({user:{role:'ADMIN'}});await flush();app.requests[6].resolve({});await retry;
 assert.equal(app.render().permissions.edit,false,'A malformed permission profile must not fall back to legacy manager powers');
 const restore=app.render().refresh();app.requests[7].resolve({user:{role:'SUPER_ADMIN'}});await restore;assert(Object.values(app.render().permissions).every(Boolean));assert.equal(app.render().error,'');
 const oldRefresh=app.render().refresh,closing=oldRefresh();app.cleanup();app.requests[8].resolve({user:{role:'ADMIN'}});await closing;
 assert.equal(app.requests.length,9,'Closed pages must not start a second profile read');assert.equal(app.render().role,'SUPER_ADMIN');await oldRefresh();assert.equal(app.requests.length,9);assert(app.cleared);assert.equal(app.events.size,0);assert.equal(app.documentEvents.size,0);
 console.log('Order permission refresh passed: live grant changes, focus/visibility, hidden tabs, coalescing, fail-closed errors, malformed profiles, explicit recovery and disposal.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
