const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),ts=require(path.join(root,'node_modules/typescript'));
class ApiError extends Error{constructor(message,status){super(message);this.status=status;}}
function mount(){
 const values=[],refs=[],effects=[],requests=[];let stateIndex=0,refIndex=0,keys=0;
 const react={useState(initial){const i=stateIndex++;if(!(i in values))values[i]=initial;return [values[i],value=>values[i]=typeof value==='function'?value(values[i]):value];},useRef(initial){const i=refIndex++;return refs[i]??(refs[i]={current:initial});},useEffect:fn=>effects.push(fn)};
 const box={exports:{},Error,crypto:{randomUUID:()=>`test-key-${++keys}`},require(name){if(name==='react')return react;if(name==='./api')return {ApiError,api:(route,init)=>new Promise((resolve,reject)=>requests.push({route,init,resolve,reject}))};throw Error(name);}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,'apps/admin/app/lib/use-finance-submission.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,box);
 const render=()=>{stateIndex=0;refIndex=0;return box.exports.useFinanceSubmission();};render();const cleanup=effects.shift()();return {render,requests,cleanup,valid:box.exports.validFinanceAmount};
}
async function main(){
 const app=mount(),body=JSON.stringify({kind:'COLLECTION',amount:100});
 const first=app.render().send(body);await assert.rejects(app.render().send(body),/devam ediyor/);assert.equal(app.requests.length,1);assert.equal(app.requests[0].route,'/admin/finance/transactions/idempotent');
 app.requests[0].reject(new Error('Lost response'));await assert.rejects(first,/Lost response/);assert(app.render().pending);
 await assert.rejects(app.render().send('different'),/Önce sonucu/);assert.equal(app.requests.length,1);
 const retry=app.render().retry();assert.equal(app.requests[1].init.body,body);assert.equal(app.requests[1].init.headers['Idempotency-Key'],app.requests[0].init.headers['Idempotency-Key']);app.requests[1].resolve({id:'existing',replayed:true});assert.equal((await retry).replayed,true);assert.equal(app.render().pending,null);
 const rejected=app.render().send(body);app.requests[2].reject(new ApiError('Rejected',400));await assert.rejects(rejected);assert.equal(app.render().pending,null);
 const another=app.render().send('corrected');assert.notEqual(app.requests[3].init.headers['Idempotency-Key'],app.requests[2].init.headers['Idempotency-Key']);app.requests[3].resolve({});await assert.rejects(another,/yanıtı doğrulanamadı/);assert(app.render().pending);
 for(const status of [408,429,499,503]){const replay=app.render().retry();app.requests.at(-1).reject(new ApiError('Uncertain',status));await assert.rejects(replay);assert(app.render().pending);}
 const disposed=app.render().retry();const before=app.render().pending;app.cleanup();app.requests.at(-1).resolve({id:'saved'});await disposed;assert.equal(app.render().pending,before,'Closed hooks do not update rendered state');await assert.rejects(app.render().send(body),/devam ediyor/);
 const oldApi=mount();const unsupported=oldApi.render().send(body);oldApi.requests[0].reject(new ApiError('Not found',404));await assert.rejects(unsupported);assert.equal(oldApi.render().pending,null,'Old API versions reject the new route instead of accepting a duplicate-prone fallback');oldApi.cleanup();
 for(const value of ['0.01','100','9999999999.99'])assert(app.valid(value));for(const value of ['','0','-1','1e3','1.001','NaN','10000000000'])assert(!app.valid(value));
 console.log('Finance submission passed: duplicate lock, original-body/key retry, unknown-response recovery, known rejection, unsupported-server refusal, disposal and exact amount bounds.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
