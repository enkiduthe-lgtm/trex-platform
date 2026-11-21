// Execute the page's real read/write handlers against controlled requests; no live accounts.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),ts=require(path.join(root,'node_modules/typescript'));
const transpile=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const source=fs.readFileSync(path.join(root,'apps/admin/app/yonetim/hesap-sil/page.tsx'),'utf8').replace(/\r\n/g,'\n');
const helpers={exports:{}};vm.runInNewContext(transpile(fs.readFileSync(path.join(root,'apps/admin/app/lib/async-controls.ts'),'utf8')),helpers);
function extract(a,b){const start=source.indexOf(a),end=source.indexOf(b,start);assert(start>=0&&end>start);return source.slice(start,end);}
const account={id:'staff-one',name:'Test Yönetici',kind:'staff',archived_at:null};
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function setup(){
 const state={rows:[account],selected:account,allowed:true,ready:true,loading:false,loadError:'',message:''},requests=[];
 const box=vm.createContext({Error,Array,Boolean,JSON,endpoint:'/admin/account-archives',...state,lock:{current:false},alive:{current:true},readyRef:{current:true},gate:{current:helpers.exports.createRequestGate()},
  api:(route,init)=>new Promise((resolve,reject)=>requests.push({route,init,resolve,reject}))});
 for(const key of Object.keys(state))box['set'+key[0].toUpperCase()+key.slice(1)]=value=>{state[key]=value;box[key]=value;};
 box.setBusy=value=>state.busy=value;
 vm.runInContext(transpile(extract('async function load()','useEffect(')+extract('async function save()','const accountLabel')),box);
 return {state,requests,box};
}
async function main(){
 const recover=setup();const first=recover.box.load();assert.equal(recover.box.readyRef.current,false);recover.requests[0].resolve({user:{role:'SUPER_ADMIN'}});await flush();recover.requests[1].reject(Error('Read offline'));await first;
 assert.equal(recover.state.ready,false);assert.equal(recover.state.allowed,true);assert.equal(recover.state.loadError,'Read offline');await recover.box.save();assert.equal(recover.requests.length,2);
 const retry=recover.box.load();recover.requests[2].resolve({user:{role:'SUPER_ADMIN'}});await flush();recover.requests[3].resolve([account]);await retry;assert.equal(recover.state.ready,true);assert.equal(recover.state.loadError,'');
 const complete=setup();const saving=complete.box.save();await complete.box.save();assert.equal(complete.requests.length,1,'Repeated clicks must share the same write lock');assert.equal(complete.requests[0].route,'/admin/account-archives/staff/staff-one');assert.equal(JSON.parse(complete.requests[0].init.body).isActive,false);
 complete.requests[0].resolve({});await flush();complete.requests[1].resolve({user:{role:'SUPER_ADMIN'}});await flush();complete.requests[2].reject(Error('Refresh offline'));await saving;
 assert(complete.state.message.includes('listeden kaldırıldı'));assert.equal(complete.state.loadError,'Refresh offline');assert.equal(complete.state.selected,null);assert.equal(complete.state.ready,false);assert.equal(complete.box.lock.current,false);
 const uncertain=setup();const failed=uncertain.box.save();uncertain.requests[0].reject(Error('Connection lost'));await failed;assert.equal(uncertain.state.ready,false);assert.equal(uncertain.state.selected,null);assert(uncertain.state.message.includes('liste'));await uncertain.box.save();assert.equal(uncertain.requests.length,1);
 const denied=setup();const deny=denied.box.load();denied.requests[0].resolve({user:{role:'ADMIN'}});await deny;assert.equal(denied.state.allowed,false);assert.equal(denied.state.rows.length,0);assert.equal(denied.requests.length,1);denied.box.selected=account;await denied.box.save();assert.equal(denied.requests.length,1);
 const stale=setup();stale.box.rows=[];await stale.box.save();assert.equal(stale.requests.length,0);
 const malformed=setup();const invalid=malformed.box.load();malformed.requests[0].resolve({user:{role:'SUPER_ADMIN'}});await flush();malformed.requests[1].resolve({rows:[]});await invalid;assert.equal(malformed.state.ready,false);assert(malformed.state.loadError.includes('doğrulanamadı'));
 const race=setup();const old=race.box.load(),current=race.box.load();race.requests[1].resolve({user:{role:'SUPER_ADMIN'}});await flush();race.requests[2].resolve([{...account,id:'new'}]);await current;race.requests[0].resolve({user:{role:'ADMIN'}});await old;assert.equal(race.state.rows[0].id,'new');assert.equal(race.state.allowed,true);
 const disposed=setup();const pending=disposed.box.save();disposed.box.alive.current=false;disposed.requests[0].resolve({});await pending;assert.equal(disposed.requests.length,1);assert.equal(disposed.box.lock.current,false);
 const restore=setup();restore.box.rows=[{...account,kind:'dealer',archived_at:'2026-11-01T12:00:00Z'}];restore.box.selected=restore.box.rows[0];const restored=restore.box.save();assert.equal(restore.requests[0].route,'/admin/account-archives/dealer/staff-one');assert.equal(JSON.parse(restore.requests[0].init.body).isActive,true);restore.box.alive.current=false;restore.requests[0].resolve({});await restored;
 console.log('Account archive recovery passed: retryable read failures, confirmed success distinct from refresh, uncertain-write pause, fresh director authorization, exact targets, stale response/disposal guards and dealer restore.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
