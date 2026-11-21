const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),ts=require(path.join(root,'node_modules/typescript'));
const transpile=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const controls={exports:{}};vm.runInNewContext(transpile(fs.readFileSync(path.join(root,'apps/admin/app/lib/async-controls.ts'),'utf8')),controls);
const source=fs.readFileSync(path.join(root,'apps/admin/app/personel/page.tsx'),'utf8');
function extract(a,b){const start=source.indexOf(a),end=source.indexOf(b,start);assert(start>=0&&end>start);return source.slice(start,end);}
function setup(){
 const state={staff:[{id:'before',email:'old@example.test'}],ready:true,loading:false,message:'',loadError:'',busy:false},requests=[];
 const box=vm.createContext({Error,ready:true,loading:false,alive:{current:true},loadGate:{current:controls.exports.createRequestGate()},actionLock:{current:controls.exports.createActionLock()},
  api:(route,init)=>new Promise((resolve,reject)=>requests.push({route,init,resolve,reject})),setStaff:value=>state.staff=value,setSelf:value=>state.self=value,
  setReady:value=>{state.ready=value;box.ready=value;},setLoading:value=>{state.loading=value;box.loading=value;},setLoadError:value=>state.loadError=value,setBusy:value=>state.busy=value,setMessage:value=>state.message=value,
 });vm.runInContext(transpile(extract(' async function load(',' useEffect(')+extract(' async function act(',' async function create(')),box);return {state,requests,box};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
async function main(){
 const app=setup();const first=app.box.act('/admin/staff/member',{isActive:false},'PATCH');
 const duplicate=app.box.act('/admin/staff/member',{isActive:true},'PATCH');
 assert.equal(app.requests.length,1,'Rapid repeated clicks must not send conflicting account changes');assert.equal(await duplicate,false);
 app.requests[0].resolve({});await flush();assert.equal(app.requests.length,3);
 app.requests[1].reject(new Error('Refresh failed'));app.requests[2].resolve({user:{id:'owner'}});
 assert.equal(await first,true,'A successful write stays successful even if the following list read fails');
 assert(app.state.message.includes('Kaydedildi'));assert.equal(app.state.ready,false);assert(app.state.loadError.includes('Refresh failed'));
 assert.equal(app.state.staff[0].id,'before','Failed refresh preserves the labelled old snapshot');
 await app.box.act('/admin/staff/member',{isActive:true},'PATCH');assert.equal(app.requests.length,3,'Unverified stale accounts cannot be changed');
 const retry=app.box.load();app.requests[3].resolve([{id:'after',email:'new@example.test'}]);app.requests[4].resolve({user:{id:'owner'}});await retry;
 assert.equal(app.state.ready,true);assert.equal(app.state.loadError,'');assert.equal(app.state.staff[0].id,'after');
 const old=app.box.load(),fresh=app.box.load();app.requests[7].resolve([{id:'newer'}]);app.requests[8].resolve({user:{id:'owner'}});await fresh;
 app.requests[5].resolve([{id:'stale'}]);app.requests[6].resolve({user:{id:'old-owner'}});await old;
 assert.equal(app.state.staff[0].id,'newer');assert.equal(app.state.self,'owner');
 const closing=app.box.load();app.box.alive.current=false;app.box.loadGate.current.invalidate();app.requests[9].resolve([{id:'closed'}]);app.requests[10].resolve({user:{id:'closed'}});await closing;
 assert.equal(app.state.staff[0].id,'newer');
 console.log('Staff account actions passed: duplicate mutation lock, successful-write/failed-refresh distinction, blocked stale actions, reload recovery, latest list and closed-view isolation.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
