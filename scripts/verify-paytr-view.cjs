const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),ts=require(path.join(root,'node_modules/typescript')),React=require(path.join(root,'node_modules/react')),{renderToStaticMarkup}=require(path.join(root,'node_modules/react-dom/server'));
const source=fs.readFileSync(path.join(root,'apps/admin/app/finans/paytr/paytr-workspace.tsx'),'utf8'),names=[...source.matchAll(/\[\s*(\w+)\s*,\s*\w+\s*\]\s*=\s*useState/g)].map(match=>match[1]);
function lib(file){const box={exports:{},Date,Intl};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,'apps/admin/app/lib',file+'.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,box);return box.exports;}
const controls=lib('async-controls'),rules=lib('order-permissions'),dates=lib('finance-report');
const receipt=(payment_id,is_test=false)=>({payment_id,order_id:'order',order_number:'TEST-'+payment_id,is_test,gross_amount:'100.00',commission_rate:'3.69',commission_amount:'3.69',net_amount:'96.31',currency:'TRY',created_at:'2026-11-22T10:00:00Z'});
function render({grants=['FINANCE.VIEW'],ready=true,saving=false,check=false,tests=false,count=2}={}){
 const rows=count===100?Array.from({length:100},(_,index)=>receipt(String(index))):[receipt('real'),receipt('simulation',true)];
 const overrides={data:{commissionRate:'5.00',receipts:rows},rate:'4',loading:false,ready,readError:ready?'':'Read unavailable',saving,needsCheck:check,showTests:tests};let index=0;
 const box={exports:{},Date,Intl,require(name){
  if(name==='react')return {...React,useState:initial=>[Object.hasOwn(overrides,names[index])?overrides[names[index++]]:(index++,typeof initial==='function'?initial():initial),()=>{}],useRef:value=>({current:value}),useEffect(){}};
  if(name==='react/jsx-runtime')return require(path.join(root,'node_modules/react/jsx-runtime'));if(name==='next/link')return {default:props=>React.createElement('a',props,props.children)};
  if(name.endsWith('/admin-nav'))return {AdminNav:()=>null};if(name.endsWith('/use-order-permissions'))return {useOrderPermissions:()=>({permissions:rules.orderPermissions('ADMIN',{configured:true,grants}),loading:false,error:''})};if(name.endsWith('/async-controls'))return controls;if(name.endsWith('/finance-report'))return dates;
  if(name.endsWith('.css'))return {default:new Proxy({},{get:(_,key)=>String(key)})};if(name.endsWith('/api'))return {api(){throw Error('Unexpected request');}};if(name.endsWith('/xlsx'))return {downloadXlsx(){}};throw Error(name);
 }};vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,box);return renderToStaticMarkup(React.createElement(box.exports.default));
}
const view=render();assert(!view.includes('<form'));assert(view.includes('TEST-real'));assert(!view.includes('TEST-simulation'));assert(!view.includes('href="/siparisler/order"'));assert(view.includes('Finans · Düzenle'));
const edit=render({grants:['FINANCE.VIEW','FINANCE.EDIT','ORDERS.VIEW']});assert(edit.includes('<form'));assert(edit.includes('href="/siparisler/order"'));assert(edit.includes('>Oranı Kaydet</button>'));assert(edit.includes('%3,69'),'Historical row rate must remain distinct from current 5% setting');
const saving=render({grants:['FINANCE.VIEW','FINANCE.EDIT'],saving:true});assert(/<fieldset[^>]*disabled=""/.test(saving));
const unknown=render({grants:['FINANCE.VIEW','FINANCE.EDIT'],ready:false,check:true});assert(unknown.indexOf('Oranı Yeniden Kontrol Et')<unknown.indexOf('<form'));assert(/<fieldset[^>]*disabled=""/.test(unknown));assert(!/<button[^>]*disabled=""[^>]*>Oranı Yeniden Kontrol Et/.test(unknown));
const stale=render({ready:false});assert(stale.includes('role="alert"'));assert(stale.includes('TEST-real'));assert(!stale.includes('<h2>1</h2>'));
const tests=render({tests:true});assert(tests.includes('TEST-simulation'));assert(!tests.includes('TEST-real'));assert(tests.includes('Test kayıtları kasa bakiyesine dahil değildir'));
assert(render({count:100}).includes('Daha eski hareketler bu listede ve aktarımda yer almaz'));
console.log('PayTR markup passed: view-only settings, separate real/test tables, historical rates, scoped order links, locked in-flight form, visible recovery and explicit last-100 scope. Browser layout remains unverified.');
