const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const ts=require(path.join(root,'node_modules/typescript'));
const transpile=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const controls={exports:{}};
vm.runInNewContext(transpile(fs.readFileSync(path.join(root,'apps/admin/app/lib/async-controls.ts'),'utf8')),controls);
const source=fs.readFileSync(path.join(root,'apps/admin/app/bayi-portal/wallet-panel.tsx'),'utf8');
const start=source.indexOf(' async function load(');
const end=source.indexOf(' async function refresh(',start);
assert(start>=0&&end>start);
async function main(){
  const state={data:null,loading:false};
  const requests=[];
  const context={
    alive:{current:true},gate:{current:controls.exports.createRequestGate()},fetching:{current:null},
    setLoading:value=>state.loading=value,setData:value=>state.data=value,
    setRefreshWarning:()=>{},setUpdatedAt:()=>{},
    api:()=>new Promise((resolve,reject)=>requests.push({resolve,reject})),
  };
  vm.runInNewContext(transpile(source.slice(start,end)),context);
  const first=context.load();
  await context.load();
  assert.equal(requests.length,1,'Overlapping refreshes must share the active read');
  context.gate.current.invalidate();
  const second=context.load();
  requests[1].resolve({balance:{available:'200.00'}});
  await second;
  requests[0].resolve({balance:{available:'100.00'}});
  await first;
  assert.equal(state.data.balance.available,'200.00','A stale read must not overwrite the new balance');
  assert.equal(state.loading,false);
  const preserved=context.load(true);
  requests[2].reject(new Error('offline'));
  await assert.rejects(preserved,/offline/);
  assert.equal(state.data.balance.available,'200.00','A background failure retains the labelled last snapshot');
  const unavailable=context.load();
  requests[3].reject(new Error('offline'));
  await assert.rejects(unavailable,/offline/);
  assert.equal(state.data,null);
  const closed=context.load();
  context.alive.current=false;
  context.gate.current.invalidate();
  requests[4].resolve({balance:{available:'999.00'}});
  await closed;
  assert.equal(state.data,null,'An unmounted panel ignores a late response');
  await context.load();
  assert.equal(requests.length,5);
  console.log('Dealer wallet refresh passed: duplicate reads, superseded balances, preserved snapshots, and unmounted views.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
