const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),React=require(path.join(root,'node_modules/react')),{renderToStaticMarkup}=require(path.join(root,'node_modules/react-dom/server')),ts=require(path.join(root,'node_modules/typescript'));
const transpile=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const controls={exports:{}};vm.runInNewContext(transpile(fs.readFileSync(path.join(root,'apps/admin/app/lib/async-controls.ts'),'utf8')),controls);
function render({allowed=true,ready=false,loading=false,error='',busy=false}={}){
 const state=[allowed,[],[],'','','',busy,false,'',null,[],false,loading,ready,error];let i=0;
 const box={exports:{},Error,require(name){if(name==='react')return {...React,useState:()=>[state[i++],()=>{}],useRef:value=>({current:value}),useEffect(){}};if(name==='react/jsx-runtime')return require(path.join(root,'node_modules/react/jsx-runtime'));if(name==='next/link')return {default:props=>React.createElement('a',props,props.children)};if(name.endsWith('/admin-nav'))return {AdminNav:()=>null};if(name.endsWith('.css'))return {default:new Proxy({},{get:(_,key)=>String(key)})};if(name.endsWith('/async-controls'))return controls.exports;if(name.endsWith('/api'))return {api(){throw Error('Unexpected request');}};throw Error(name);}};
 vm.runInNewContext(transpile(fs.readFileSync(path.join(root,'apps/admin/app/siparisler/sil/page.tsx'),'utf8')),box);return renderToStaticMarkup(React.createElement(box.exports.default));
}
const loading=render({loading:true});assert(loading.includes('Sipariş kayıtları yükleniyor'));assert(!loading.includes('Silinen Sipariş Bulunmuyor'));assert(/<fieldset class="operationFields" disabled=""/.test(loading));
const failure=render({error:'offline'});assert(failure.includes('Güncel kayıtlar alınamadı'));assert(failure.includes('başarılı işlemi tekrar göndermeyin'));assert(!failure.includes('Silinmeye Uygun Sipariş Yok'));assert(/<fieldset class="operationFields" disabled=""/.test(failure));
assert(failure.indexOf('Sipariş Kayıtlarını Yenile')<failure.indexOf('<fieldset'),'Reload remains outside the disabled operation controls');
const ready=render({ready:true});assert(ready.includes('Silinmeye Uygun Sipariş Yok'));assert(ready.includes('Silinen Sipariş Bulunmuyor'));assert(!/<fieldset class="operationFields" disabled=""/.test(ready));
const restricted=render({allowed:false});assert(!restricted.includes('Seçilen Siparişi Listeden Sil'));assert(!restricted.includes('Deneme Siparişini Arşivle'));
console.log('Order removal markup passed: loading/failure/empty distinction, disabled stale mutations, accessible reload and director-only operation controls. Browser layout remains unverified.');
