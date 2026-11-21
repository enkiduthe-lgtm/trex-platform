const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),React=require(path.join(root,'node_modules/react')),{renderToStaticMarkup}=require(path.join(root,'node_modules/react-dom/server')),ts=require(path.join(root,'node_modules/typescript'));
const transpile=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
function lib(name){const box={exports:{}};vm.runInNewContext(transpile(fs.readFileSync(path.join(root,'apps/admin/app/lib',name+'.ts'),'utf8')),box);return box.exports;}
const permissions={transfers:true,createTransfer:true,approveTransfer:true,transferHistory:true,createExpense:true,deleteExpense:true};
function render(kind,pending){
 const account={id:'account',name:'Test Banka',currency:'TRY',is_active:true},entry={accountId:'account',amount:'100.00',description:'Test',expenseCategory:'Kargo',counterpartyName:'',referenceNumber:'',documentUrl:'',costCenter:''};
 const states=kind==='COLLECTION'?[[],[account],permissions,false,true,false,'ENTRY',[],true,'',{},'','',entry]:['',false,true,'',[account],[],'','','','',entry];let index=0;
 const source=fs.readFileSync(path.join(root,`apps/admin/app/finans/${kind==='COLLECTION'?'havaleler':'masraflar'}/page.tsx`),'utf8')+(kind==='COLLECTION'?'\nexport {CollectionsContent};':'');
 const box={exports:{},Error,Date,URLSearchParams,require(name){if(name==='react')return {...React,useState:()=>[states[index++],()=>{}],useRef:value=>({current:value}),useMemo:fn=>fn(),useEffect(){}};
  if(name==='react/jsx-runtime')return require(path.join(root,'node_modules/react/jsx-runtime'));if(name==='next/link')return {default:props=>React.createElement('a',props,props.children)};if(name==='next/navigation')return {useSearchParams:()=>({get:()=>null})};
  if(name.endsWith('/admin-nav'))return {AdminNav:()=>null};if(name.endsWith('/use-order-permissions'))return {useOrderPermissions:()=>({permissions,loading:false,error:''})};
  if(name.endsWith('/use-finance-submission'))return {useFinanceSubmission:()=>({pending:pending?{body:'original',key:'original'}:null,busy:false}),validFinanceAmount:()=>true};
  if(name.endsWith('/finance-report'))return lib('finance-report');if(name.endsWith('/order-permissions'))return lib('order-permissions');if(name.endsWith('/async-controls'))return lib('async-controls');if(name.endsWith('/xlsx'))return {downloadXlsx(){}};if(name.endsWith('/api'))return {api(){throw Error('Unexpected request');}};throw Error(name);
 }};vm.runInNewContext(transpile(source),box);return renderToStaticMarkup(React.createElement(kind==='COLLECTION'?box.exports.CollectionsContent:box.exports.default));
}
for(const kind of ['COLLECTION','EXPENSE']){
 const pending=render(kind,true),button=kind==='COLLECTION'?'Havale Kaydını Doğrula / Yeniden Dene':'Masraf Kaydını Doğrula / Yeniden Dene';
 assert(pending.includes(button));assert(pending.indexOf(button)<pending.indexOf('<fieldset'),'Recovery controls stay outside the locked form');
 assert(/<fieldset[^>]*finance-entry-fields[^>]*disabled=""/.test(pending));
 const ready=render(kind,false);assert(!ready.includes(button));assert(!/<fieldset[^>]*finance-entry-fields[^>]*disabled=""/.test(ready));
}
console.log('Finance entry markup passed: original-request recovery outside locked forms and normal controls restored when no result is pending. Browser layout remains unverified.');
