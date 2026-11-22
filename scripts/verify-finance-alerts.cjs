const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),ts=require(path.join(root,'node_modules/typescript')),React=require(path.join(root,'node_modules/react')),{renderToStaticMarkup}=require(path.join(root,'node_modules/react-dom/server'));
const source=fs.readFileSync(path.join(root,'apps/admin/app/finans/uyarilar/page.tsx'),'utf8').replace(/\r\n/g,'\n');
const transpile=text=>ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const controlsBox={exports:{}};vm.runInNewContext(transpile(fs.readFileSync(path.join(root,'apps/admin/app/lib/async-controls.ts'),'utf8')),controlsBox);const controls=controlsBox.exports;
const alert={code:'NEGATIVE_ACCOUNT',severity:'HIGH',title:'Negatif hesap bakiyesi',detail:'Test hesabı · 10 TRY'};
function setup(){const state={alerts:[alert],loading:false,ready:true,error:''},requests=[];const box=vm.createContext({Error,Array,Boolean,...state,alive:{current:true},gate:{current:controls.createRequestGate()},api:()=>new Promise((resolve,reject)=>requests.push({resolve,reject}))});for(const key of Object.keys(state))box['set'+key[0].toUpperCase()+key.slice(1)]=value=>{state[key]=value;box[key]=value;};vm.runInContext(transpile(source.slice(source.indexOf('type Alert='),source.indexOf('export default function FinanceAlerts()'))+source.slice(source.indexOf('async function load()'),source.indexOf('useEffect(()=>{alive.current=true'))),box);return {state,box,requests};}
function render({rows=[],ready=false,loading=false,error='',filter='ALL'}={}){
 let stateIndex=0;const values=[rows,filter,loading,ready,error];const box={exports:{},require(name){
  if(name==='react')return {...React,useState:()=>[values[stateIndex++],()=>{}],useEffect(){},useRef:value=>({current:value})};if(name==='react/jsx-runtime')return require(path.join(root,'node_modules/react/jsx-runtime'));
  if(name==='next/link')return {default:props=>React.createElement('a',props,props.children)};if(name.endsWith('/admin-nav'))return {AdminNav:()=>null};if(name.endsWith('/async-controls'))return controls;if(name.endsWith('/api'))return {api(){throw Error('Unexpected request');}};if(name.endsWith('.css'))return {default:new Proxy({},{get:(_,key)=>String(key)})};throw Error(name);
 }};vm.runInNewContext(transpile(source),box);return renderToStaticMarkup(React.createElement(box.exports.default));
}
async function main(){
 const fail=setup();const failing=fail.box.load();assert.equal(fail.state.ready,false);fail.requests[0].reject(Error('Server unavailable'));await failing;assert.equal(fail.state.alerts.length,1);assert.equal(fail.state.ready,false);assert(fail.state.error);assert.equal(fail.state.loading,false);
 const stale=setup();const old=stale.box.load(),newer=stale.box.load();stale.requests[1].resolve([{...alert,title:'New'}]);await newer;stale.requests[0].reject(Error('Stale error'));await old;assert.equal(stale.state.alerts[0].title,'New');assert.equal(stale.state.error,'');assert.equal(stale.state.ready,true);
 const canceled=setup();const pending=canceled.box.load();canceled.box.alive.current=false;canceled.box.gate.current.invalidate();canceled.requests[0].resolve([]);await pending;assert.equal(canceled.state.alerts.length,1);
 for(const result of [null,[{...alert,severity:'toString'}],Array.from({length:51},()=>alert)]){const invalid=setup();const loading=invalid.box.load();invalid.requests[0].resolve(result);await loading;assert.equal(invalid.state.ready,false);assert(invalid.state.error.includes('doğrulanamadı'));}
 const nullable=setup();const valid=nullable.box.load();nullable.requests[0].resolve([{...alert,detail:null}]);await valid;assert.equal(nullable.state.ready,true);
 const emptyError=render({error:'Read failed'});assert(emptyError.includes('role="alert"'));assert(emptyError.includes('Güncel finans uyarıları alınamadı'));assert(!emptyError.includes('Bu kontrolde listelenen finans uyarısı yok'));assert(!emptyError.includes('<h2>0</h2>'));
 const initial=render({loading:true});assert(initial.includes('Finans uyarıları kontrol ediliyor'));assert(!initial.includes('Bu kontrolde listelenen finans uyarısı yok'));
 const empty=render({ready:true});assert(empty.includes('Bu kontrolde listelenen finans uyarısı yok'));assert(empty.includes('<h2>0</h2>'));
 const retained=render({rows:[alert],error:'Read failed'});assert(retained.includes(alert.title));assert(retained.includes('Son alınan liste'));assert(!retained.includes('<h2>1</h2>'));
 const capped=render({rows:Array.from({length:50},()=>alert),ready:true});assert(capped.includes('İlk 50 uyarı gösteriliyor'));assert(capped.includes('Yüklenen Uyarı'));assert(!capped.includes('TOPLAM UYARI'));
 const filtered=render({rows:[alert],ready:true,filter:'LOW'});assert(filtered.includes('Yüklenen uyarılarda bu önceliğe uyan kayıt yok'));assert(!filtered.includes('Bu kontrolde listelenen finans uyarısı yok'));
 console.log('Finance alerts passed: retryable read failures, retained stale rows, no false zero/all-clear, ignored stale or canceled responses, strict response validation, explicit 50-record scope and filter-aware empty states. No finance data was changed.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
