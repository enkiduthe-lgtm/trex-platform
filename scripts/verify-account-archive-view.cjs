const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),ts=require(path.join(root,'node_modules/typescript')),React=require(path.join(root,'node_modules/react')),{renderToStaticMarkup}=require(path.join(root,'node_modules/react-dom/server'));
const code=ts.transpileModule(fs.readFileSync(path.join(root,'apps/admin/app/yonetim/hesap-sil/page.tsx'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
function render({ready=true,allowed=true,readError='',selected=false}={}){
 const row={id:'test',name:'Test Yönetici',kind:'staff',archived_at:null};
 const state=[[row],selected?row:null,'Hesap listeden kaldırıldı.',false,false,ready,readError,allowed,'staff','',false];let index=0;
 const box={exports:{},require(name){if(name==='react')return {...React,useState:()=>[state[index++],()=>{}],useRef:value=>({current:value}),useEffect(){}};if(name==='react/jsx-runtime')return require(path.join(root,'node_modules/react/jsx-runtime'));if(name==='next/link')return {default:props=>React.createElement('a',props,props.children)};if(name.endsWith('/admin-nav'))return {AdminNav:()=>null};if(name.endsWith('.css'))return {default:new Proxy({},{get:(_,key)=>String(key)})};if(name.endsWith('/async-controls'))return {createRequestGate:()=>({})};if(name.endsWith('/finance-report'))return {financeDateTime:String};if(name.endsWith('/api'))return {api(){throw Error('Unexpected write');}};throw Error(name);}};
 vm.runInNewContext(code,box);return renderToStaticMarkup(React.createElement(box.exports.default));
}
const paused=render({ready:false,readError:'Refresh offline'});assert(paused.includes('Hesap Listesini Yenile'));assert(paused.includes('role="alert"'));assert(paused.includes('Son yüklenen liste'));assert(/<button[^>]*disabled=""[^>]*>Sil<\/button>/.test(paused));assert(!/<button[^>]*disabled=""[^>]*>Hesap Listesini Yenile/.test(paused));
const denied=render({allowed:false,ready:false});assert(!denied.includes('<table>'));assert(denied.includes('Hesap Listesini Yenile'));
const confirm=render({selected:true});assert(confirm.includes('Sipariş, prim ve finans geçmişi saklanır.'));assert(confirm.includes('Silmeyi Onayla'));assert(confirm.includes('Vazgeç'));
console.log('Account archive markup passed: accessible retry after failed reads, disabled stale-row actions, director-only table and explicit history-preserving confirmation. Browser layout remains pending.');
