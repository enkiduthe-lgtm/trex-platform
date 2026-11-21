const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),ts=require(path.join(root,'node_modules/typescript'));
const source=fs.readFileSync(path.join(root,'apps/admin/app/bayi-portal/wallet-panel.tsx'),'utf8');
const start=source.indexOf(' async function request()'),end=source.indexOf(' function exportReport()',start);assert(start>=0&&end>start);
const code=ts.transpileModule(source.slice(start,end),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
class ApiError extends Error{constructor(message,status){super(message);this.status=status;}}
function setup(){
 const state={view:{month:'2026-10',search:'tea',movementFilter:'ALL'},message:'',busy:false,amount:'100.00',reads:0};
 const requests=[],key={current:null};
 const box=vm.createContext({Error,ApiError,lock:{current:false},key,loading:false,fetching:{current:null},data:{balance:{eligible:'500.00'}},hasPrimaryIban:true,amount:'100.00',view:state.view,
  setBusy:value=>state.busy=value,setMessage:value=>state.message=value,setAmount:value=>state.amount=value,
  onViewChange:update=>{state.view=update(state.view);box.view=state.view;},onChange(){},load:async()=>state.reads++,
  crypto:{randomUUID:()=>`intent-${requests.length}`},api:(url,options)=>new Promise((resolve,reject)=>requests.push({url,options,resolve,reject})),
 });vm.runInContext(code,box);return {state,requests,key,box};
}
async function main(){
 const app=setup(),first=app.box.request();await app.box.request();assert.equal(app.requests.length,1);
 const original=JSON.parse(app.requests[0].options.body);app.requests[0].reject(new Error('connection lost'));await first;
 assert.equal(app.state.view.pendingRequest.id,original.requestKey);assert.equal(app.state.view.pendingRequest.amount,'100.00');
 assert.equal(app.state.view.month,'2026-10');assert.equal(app.state.view.search,'tea');assert.equal(app.state.busy,false);
 // A remounted form must replay the old intent even if current balance or bank details changed.
 app.box.amount='200.00';app.box.data.balance.eligible='0.00';app.box.hasPrimaryIban=false;
 const retry=app.box.request();assert.equal(app.requests.length,2);
 assert.equal(app.requests[1].options.body,app.requests[0].options.body);
 app.requests[1].resolve({id:'existing'});await retry;
 assert.equal(app.state.view.pendingRequest,undefined);assert.equal(app.key.current,null);assert.equal(app.state.amount,'');
 assert.equal(app.state.view.movementFilter,'ALL');
 const rejected=setup(),known=rejected.box.request();rejected.requests[0].reject(new ApiError('Insufficient eligible balance',409));await known;
 assert.equal(rejected.state.view.pendingRequest,undefined);assert.equal(rejected.key.current,null);assert.equal(rejected.state.amount,'100.00');
 const server=setup(),unknown=server.box.request();server.requests[0].reject(new ApiError('Temporary error',503));await unknown;
 assert(server.state.view.pendingRequest);assert(server.key.current);
 for(const status of [408,429,499]){
  const transient=setup(),pending=transient.box.request();transient.requests[0].reject(new ApiError('Try again',status));await pending;
  assert(transient.state.view.pendingRequest);assert(transient.key.current,'Timeouts and throttling must keep the original request key');
 }
 const malformed=setup(),incomplete=malformed.box.request();malformed.requests[0].resolve({});await incomplete;
 assert(malformed.state.view.pendingRequest);assert(malformed.key.current,'Incomplete acknowledgements must not claim a confirmed payout request');
 const match=setup(),intent={id:'saved-intent',amount:'100.00'};match.key.current=intent;match.state.view.pendingRequest=intent;match.box.view=match.state.view;
 match.box.data={requests:[{id:'saved',request_key:intent.id,status:'APPROVED'}]};match.box.busy=false;
 match.box.status={APPROVED:'Onaylandı'};match.box.useEffect=effect=>effect();
 const effectStart=source.indexOf(' useEffect(()=>{',source.indexOf(' const key=')),effectEnd=source.indexOf(' async function load(',effectStart);assert(effectStart>=0&&effectEnd>effectStart);
 vm.runInContext(ts.transpileModule(source.slice(effectStart,effectEnd),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,match.box);
 assert.equal(match.state.view.pendingRequest,undefined);assert.equal(match.key.current,null);assert.equal(match.requests.length,0);
 assert(match.state.message.includes('Onaylandı'),'A matching saved request reconciles without creating another payout');
 const replaced=setup(),old=replaced.box.request();
 replaced.state.view={...replaced.state.view,pendingRequest:{id:'newer-intent',amount:'50.00'}};replaced.box.view=replaced.state.view;
 replaced.requests[0].resolve({id:'old-saved'});await old;
 assert.equal(replaced.state.view.pendingRequest.id,'newer-intent','A late old response cannot clear a newer persisted intent');
 console.log('Dealer payout retry passed: duplicate clicks, persisted intent, same key and amount, replay with zero balance, definite rejection, uncertain server failure and preserved filters.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
