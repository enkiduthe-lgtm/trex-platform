const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),ts=require(path.join(root,'node_modules/typescript'));
const source=fs.readFileSync(path.join(root,'apps/admin/app/raporlar/page.tsx'),'utf8'),start=source.indexOf(' async function load('),end=source.indexOf(' useEffect(',start);
const code=ts.transpileModule(source.slice(start,end),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const period={dateFrom:'2026-11-01',dateTo:'2026-11-21',currency:'TRY'};
function setup(){const state={data:null,operations:null,message:'',busy:false,snapshot:null},requests=[];const box=vm.createContext({Error,URLSearchParams,requestId:{current:0},api:route=>new Promise((resolve,reject)=>requests.push({route,resolve,reject})),setBusy:value=>state.busy=value,setData:value=>state.data=value,setOperations:value=>state.operations=value,setMessage:value=>state.message=value,setLoadedFilters:value=>state.snapshot=value});vm.runInContext(code,box);return {state,requests,box};}
async function main(){
 const partial=setup();const load=partial.box.load(period);partial.requests[0].resolve({...period,totals:{revenue:'120.00'}});partial.requests[1].reject(new Error('Operations unavailable'));await load;
 assert.equal(partial.state.data?.totals.revenue,'120.00','An unavailable operations summary must not hide a successful financial report');assert.equal(partial.state.operations,null);assert(partial.state.message.includes('Operasyon'));assert.equal(partial.state.snapshot.currency,'TRY');
 const reverse=setup();const missing=reverse.box.load(period);reverse.requests[0].reject(new Error('Summary unavailable'));reverse.requests[1].resolve({returns_open:2});await missing;assert.equal(reverse.state.operations.returns_open,2);assert.equal(reverse.state.data,null);assert(reverse.state.message.includes('Satış'));
 const stale=setup();const old=stale.box.load({...period,currency:'EUR'}),fresh=stale.box.load(period);stale.requests[2].resolve({...period});stale.requests[3].resolve({returns_open:1});await fresh;stale.requests[0].resolve({...period,currency:'EUR'});stale.requests[1].reject(new Error('Old error'));await old;
 assert.equal(stale.state.data.currency,'TRY');assert.equal(stale.state.message,'');assert.equal(stale.state.snapshot.currency,'TRY');
 const invalid=setup();await invalid.box.load({...period,dateFrom:'2026-12-01'});assert.equal(invalid.requests.length,0);
 console.log('Report read isolation passed: independent sales/operations failures, loaded-period snapshots, stale responses and invalid ranges.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
