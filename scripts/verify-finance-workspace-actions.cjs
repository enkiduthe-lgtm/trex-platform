const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),ts=require(path.join(root,'node_modules/typescript'));
const transpile=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const controls={exports:{}};vm.runInNewContext(transpile(fs.readFileSync(path.join(root,'apps/admin/app/lib/async-controls.ts'),'utf8')),controls);
const source=fs.readFileSync(path.join(root,'apps/admin/app/finans/page.tsx'),'utf8');
const functions=transpile(source.slice(source.indexOf('  async function runOperation('),source.indexOf('  const shownTransactions')));
function setup(){
 const accounts=[{id:'try',name:'Ortak Hesap',currency:'TRY',is_active:true},{id:'eur',name:'Ortak Hesap',currency:'EUR',is_active:true},{id:'second',name:'Diğer',currency:'TRY',is_active:true}],row={id:'movement',account_id:'eur',account_name:'Ortak Hesap',currency:'EUR',can_edit:true,kind:'COLLECTION',amount:'10.00',description:'Test'};
 const state={busy:'',message:'',loads:0,confirms:0},requests=[];
 const box=vm.createContext({Error,JSON,controlsDisabled:false,ready:true,loading:false,accessLoading:false,unresolved:false,permissions:{financeCreate:true,financeEdit:true,financeDelete:true,financeApprove:true},accounts,transactions:[row],alive:{current:true},actionLock:{current:false},loadGate:{current:controls.exports.createRequestGate()},editingAccount:null,editingTx:null,account:{name:' Hesap ',accountType:'BANK',currency:'TRY'},tx:{accountId:'try',amount:'10.00',kind:'COLLECTION',description:' Test ',counterpartyName:'',referenceNumber:'',paymentStatus:'PAID'},transfer:{fromAccountId:'try',toAccountId:'second',amount:'10.01',description:' Transfer '},
  validFinanceAmount:value=>/^\d+(?:\.\d{1,2})?$/.test(value)&&Number(value)>0&&Number(value)<=9999999999.99,
  api:(route,init)=>new Promise((resolve,reject)=>requests.push({route,init,resolve,reject})),load:async()=>{state.loads++;},setBusy:value=>state.busy=value,setMessage:value=>state.message=value,
  setAccount:value=>box.account=typeof value==='function'?value(box.account):value,setEditingAccount:value=>box.editingAccount=value,setTx:value=>box.tx=typeof value==='function'?value(box.tx):value,setEditingTx:value=>box.editingTx=value,setTransfer:value=>box.transfer=typeof value==='function'?value(box.transfer):value,
  window:{confirm:()=>{state.confirms++;return true;}},requestAnimationFrame:fn=>fn(),document:{getElementById:()=>({scrollIntoView(){}})},
 });box.transactionSubmission={pending:null,send:body=>box.api('/admin/finance/transactions/idempotent',{body}),retry:()=>box.api('retry-transaction',{})};box.transferSubmission={pending:null,send:body=>box.api('/admin/finance/transfers/idempotent',{body}),retry:()=>box.api('retry-transfer',{})};vm.runInContext(functions,box);return {state,requests,box,row};
}
async function main(){
 const app=setup();app.box.editTransaction(app.row);assert.equal(app.box.tx.accountId,'eur','Same-named accounts must be resolved by their immutable ID');app.box.editingTx=null;
 const prior=app.box.tx;app.box.editTransaction({...app.row,id:'linked',can_edit:false});assert.equal(app.box.tx,prior);
 app.box.tx={...app.box.tx,accountId:'try'};const first=app.box.addTx({preventDefault(){}});await app.box.addTx({preventDefault(){}});assert.equal(app.requests.length,1);assert.equal(app.requests[0].route,'/admin/finance/transactions/idempotent');app.requests[0].resolve({id:'saved'});await first;assert.equal(app.box.tx.amount,'');assert.equal(app.state.loads,1);assert.equal(app.box.actionLock.current,false);
 app.box.tx.amount='1.001';await app.box.addTx({preventDefault(){}});assert.equal(app.requests.length,1);app.box.tx.amount='10.00';app.box.tx.description='Test';app.box.accounts[0].is_active=false;await app.box.addTx({preventDefault(){}});assert.equal(app.requests.length,1);app.box.accounts[0].is_active=true;
 app.box.transfer.toAccountId='eur';await app.box.addTransfer({preventDefault(){}});assert.equal(app.requests.length,1,'Different currencies cannot silently transfer');app.box.transfer.toAccountId='second';const move=app.box.addTransfer({preventDefault(){}});assert.equal(app.requests[1].route,'/admin/finance/transfers/idempotent');app.requests[1].resolve({transferGroupId:'group'});await move;assert.equal(app.box.transfer.amount,'');
 app.box.permissions.financeCreate=false;await app.box.addTx({preventDefault(){}});assert.equal(app.requests.length,2);
 app.box.transactions[0].can_edit=false;await app.box.removeTx('movement');assert.equal(app.state.confirms,0,'Protected rows do not offer a misleading destructive confirmation');assert.equal(app.requests.length,2);
 const recovery=setup();recovery.box.ready=false;recovery.box.controlsDisabled=true;recovery.box.unresolved=true;recovery.box.transactionSubmission.pending={body:'original'};const retry=recovery.box.retryTransaction();assert.equal(recovery.requests[0].route,'retry-transaction','Known submissions can be recovered even if current account reads failed');recovery.requests[0].resolve({id:'saved',replayed:true});await retry;assert(recovery.state.message.includes('doğrulandı'));
 console.log('Finance workspace actions passed: account-ID editing, protected rows, duplicate lock, exact inputs, same-currency transfers, role checks and unresolved-request recovery.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
