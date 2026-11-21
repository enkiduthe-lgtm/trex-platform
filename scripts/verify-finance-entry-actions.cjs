const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),ts=require(path.join(root,'node_modules/typescript'));
const transpile=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const library={exports:{},require:name=>name==='react'?{}:{}};vm.runInNewContext(transpile(fs.readFileSync(path.join(root,'apps/admin/app/lib/use-finance-submission.ts'),'utf8')),library);
function setup(kind){
 const pathName=kind==='COLLECTION'?'havaleler':'masraflar',source=fs.readFileSync(path.join(root,`apps/admin/app/finans/${pathName}/page.tsx`),'utf8');
 const start=source.indexOf(kind==='COLLECTION'?'  async function writeCollection(':'  async function writeExpense('),end=source.indexOf(kind==='COLLECTION'?'  return <main':'  function exportExpenses(',start);
 const state={form:{accountId:'account',amount:'100.01',description:' Açıklama ',expenseCategory:'Kargo',counterpartyName:' Alıcı ',referenceNumber:' REF ',documentUrl:'',costCenter:''},busy:false,message:'',calls:[],loads:[]};
 const box=vm.createContext({Error,JSON,actionLock:{current:false},loading:false,ready:true,canEnter:true,accessLoading:false,permissions:{createExpense:true},accounts:[{id:'account'}],entry:state.form,form:state.form,pageAlive:{current:true},alive:{current:true},validFinanceAmount:library.exports.validFinanceAmount,
  submission:{pending:null,send:async body=>{state.calls.push({body});return {id:'saved'};},retry:async()=>{state.calls.push({retry:true});return {id:'saved',replayed:true};}},
  setBusy:value=>state.busy=value,setMessage:value=>state.message=value,setEntry:fn=>state.form=fn(state.form),setForm:fn=>state.form=fn(state.form),load:async confirmation=>state.loads.push(confirmation),
 });vm.runInContext(transpile(source.slice(start,end)),box);return {state,box,submit:()=>kind==='COLLECTION'?box.addCollection({preventDefault(){}}):box.submit({preventDefault(){}}),retry:()=>kind==='COLLECTION'?box.writeCollection():box.writeExpense()};
}
async function main(){
 for(const kind of ['COLLECTION','EXPENSE']){
  const app=setup(kind);app.state.form.amount='1.001';await app.submit();assert.equal(app.state.calls.length,0);app.state.form.amount='100.01';
  app.state.form.description=' ';await app.submit();assert.equal(app.state.calls.length,0);app.state.form.description=' Açıklama ';
  await app.submit();const body=JSON.parse(app.state.calls[0].body);assert.equal(body.kind,kind);assert.equal(body.amount,100.01);assert.equal(body.description,'Açıklama');assert.equal(app.state.form.amount,'');assert.equal(app.box.actionLock.current,false);
  const pending=setup(kind);pending.box.submission.pending={body:'original',key:'original'};await pending.submit();assert.equal(pending.state.calls.length,0,'Uncertain submissions cannot create a fresh body');await pending.retry();assert.equal(pending.state.calls[0].retry,true);assert.equal(pending.state.form.amount,'');
  const failure=setup(kind),original=failure.state.form;failure.box.submission.send=async()=>{throw Error('Lost response');};await failure.submit();assert.equal(failure.state.form,original);assert.equal(failure.state.form.amount,'100.01');assert.equal(failure.state.message,'Lost response');assert.equal(failure.box.actionLock.current,false);
  const denied=setup(kind);denied.box.canEnter=false;denied.box.permissions.createExpense=false;await denied.submit();await denied.retry();assert.equal(denied.state.calls.length,0);
 }
 console.log('Finance entry actions passed: exact amounts, required descriptions, normalized bodies, preserved failed drafts, original-request recovery and role guards for both collection and expense forms.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
