const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),React=require(path.join(root,'node_modules/react')),{renderToStaticMarkup}=require(path.join(root,'node_modules/react-dom/server')),ts=require(path.join(root,'node_modules/typescript'));
const transpile=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const controls={exports:{}};vm.runInNewContext(transpile(fs.readFileSync(path.join(root,'apps/admin/app/lib/async-controls.ts'),'utf8')),controls);
const member={id:'staff',email:'staff@example.test',role:'ADMIN',is_active:true,created_at:'2026-11-21T10:00:00Z'};
function render({staff=[],loading=false,ready=false,error='',query='',busy=false,reset=null,editing=null}={}){
 const values=[staff,'owner',query,'',busy,editing,{email:'',password:'',role:'ADMIN'},reset,'',loading,ready,error];let index=0;
 const box={exports:{},Error,Date,require(name){if(name==='react')return {...React,useState:()=>[values[index++],()=>{}],useRef:value=>({current:value}),useEffect(){}};
  if(name==='react/jsx-runtime')return require(path.join(root,'node_modules/react/jsx-runtime'));if(name==='next/link')return {default:props=>React.createElement('a',props,props.children)};
  if(name.endsWith('/admin-nav'))return {AdminNav:()=>null};if(name.endsWith('/removal-link'))return {RemovalLink:props=>React.createElement('a',props,props.children)};
  if(name==='./access-editor')return {AccessEditor:props=>React.createElement('span',{'data-editor-disabled':props.disabled?'true':'false'},'Permission draft')};
  if(name.endsWith('/async-controls'))return controls.exports;if(name.endsWith('/api'))return {api(){throw Error('Unexpected request');}};throw Error(name);
 }};
 vm.runInNewContext(transpile(fs.readFileSync(path.join(root,'apps/admin/app/personel/page.tsx'),'utf8')),box);return renderToStaticMarkup(React.createElement(box.exports.default));
}
const loading=render({loading:true});assert(loading.includes('Hesaplar yükleniyor'));assert(!loading.includes('Henüz hesap veya başvuru bulunmuyor'));
const failed=render({error:'offline'});assert(failed.includes('Hesap listesi yenilenemedi'));assert(!failed.includes('Henüz hesap veya başvuru bulunmuyor'));
const stale=render({staff:[member],error:'offline',reset:member,editing:member});assert(stale.includes('Son yüklenen liste'));assert(stale.includes('staff@example.test'));assert(stale.includes('data-editor-disabled="true"'));
assert(/<button disabled="">Hesabı Oluştur<\/button>/.test(stale));assert(/<input disabled="" required="" minLength="12" maxLength="128" type="password"/.test(stale));
const fresh=render({staff:[member],ready:true,query:' staff@example.test '});assert(fresh.includes('Hesabı Pasifleştir'));assert(!fresh.includes('Aramanıza uygun hesap bulunmuyor'));
const empty=render({ready:true,query:'missing'});assert(empty.includes('Aramanıza uygun hesap bulunmuyor'));
console.log('Staff account markup passed: distinct loading/failure/empty states, labelled stale list, disabled sensitive controls, preserved editor and trimmed search. Browser layout remains unverified.');
