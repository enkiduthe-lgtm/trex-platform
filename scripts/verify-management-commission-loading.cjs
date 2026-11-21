const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),ts=require(path.join(root,'node_modules/typescript'));
const source=fs.readFileSync(path.join(root,'apps/admin/app/primler/yonetim/page.tsx'),'utf8');
const start=source.indexOf(' async function load('),end=source.indexOf(' useEffect(',start);
const code=ts.transpileModule(source.slice(start,end),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const controls={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,'apps/admin/app/lib/async-controls.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,controls);
const pool={canManage:true,canSeeAll:true,settings:{executive_count:3,executive_ids:['a','b','c'],director_id:'director'},rates:[{id:'rate'}],entries:[{id:'earned'}]};
function setup(canSeeAll=true){
 const state={data:null,loading:true,error:'',accounts:[],financeError:'',account:'old-account'},requests=[];
 const box=vm.createContext({Error,loading:false,busy:'',data:{canSeeAll},loadId:{current:0},financeLock:{current:false},saveLock:{current:controls.exports.createActionLock()},currentMonth:{current:'2026-11'},financeError:'',financeLoading:false,financeAccounts:[],
  api:(route,init)=>new Promise((resolve,reject)=>requests.push({route,init,resolve,reject})),setLoading:value=>{state.loading=value;box.loading=value;},setLoadError:value=>state.error=value,setNeedsLogin(){},
  setData:value=>{state.data=value;box.data=value;},setFinanceAccounts:value=>{state.accounts=value;box.financeAccounts=value;},setFinanceError:value=>{state.financeError=value;box.financeError=value;},setFinanceLoading:value=>{state.financeLoading=value;box.financeLoading=value;},
  setMessage:value=>state.message=value,setBusy:value=>box.busy=value,
  setAccount:value=>state.account=typeof value==='function'?value(state.account):value,setPeople:value=>state.people=value,
 });vm.runInContext(code,box);
 const saveStart=source.indexOf(' async function save('),saveEnd=source.indexOf(' const entries=',saveStart);
 vm.runInContext(ts.transpileModule(source.slice(saveStart,saveEnd),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,box);
 return {state,requests,box};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
async function main(){
 const app=setup();const load=app.box.load('2026-11');app.requests[0].resolve(pool);await flush();
 app.requests[1].reject(new Error('Finance unavailable'));await load;
 assert.equal(app.state.data?.entries[0].id,'earned','Finance lookup failure must not hide commission records or rate settings');
 assert.equal(app.state.error,'');assert(app.state.financeError);assert.equal(app.state.loading,false);assert.equal(app.state.account,'');
 await app.box.save('entries/earned/pay',{accountId:'old-account'});assert.equal(app.requests.length,2,'Unverified payment accounts cannot be submitted');
 const retry=app.box.refreshFinanceAccounts();app.requests[2].resolve({accounts:[{id:'tl',currency:'TRY'},{id:'eur',currency:'EUR'}]});await retry;
 assert.equal(app.state.accounts.length,1);assert.equal(app.state.accounts[0].id,'tl');assert.equal(app.state.financeError,'');
 assert.equal(app.state.data.entries[0].id,'earned','Retrying accounts must not reload commission settings or replace form drafts');
 const own=setup(false);const ownLoad=own.box.load('2026-11');own.requests[0].resolve({...pool,canManage:false,canSeeAll:false,settings:null,rates:[]});await ownLoad;
 assert.equal(own.requests.length,1,'Own-only managers must not request finance account data');assert.equal(own.state.accounts.length,0);
 const stale=setup();const old=stale.box.load('2026-10'),fresh=stale.box.load('2026-11');
 stale.requests[1].resolve(pool);await flush();stale.requests[2].resolve({accounts:[{id:'new',currency:'TRY'}]});await fresh;
 stale.requests[0].reject(new Error('Old month failure'));await old;assert.equal(stale.state.error,'');assert.equal(stale.state.accounts[0].id,'new');
 const late=app.box.refreshFinanceAccounts();app.box.loadId.current++;app.requests[3].resolve({accounts:[{id:'stale',currency:'TRY'}]});await late;
 assert.equal(app.state.accounts[0].id,'tl','Late finance reads must not replace accounts belonging to a newer period or closed page');
 const writing=app.box.save('channel-pools/settings',{executiveCount:3});await app.box.save('channel-pools/settings',{executiveCount:4});
 assert.equal(app.requests.length,5,'Repeated clicks cannot create overlapping commission settings writes');
 app.requests[4].reject(new Error('Save failed'));await writing;assert.equal(app.box.saveLock.current.isLocked(),false);
 console.log('Management commission loading passed: isolated finance failure/retry, own-only privacy, TRY accounts and stale response protection.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
