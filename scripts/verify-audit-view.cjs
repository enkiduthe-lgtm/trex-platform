const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),ts=require(path.join(root,'node_modules/typescript')),React=require(path.join(root,'node_modules/react')),{renderToStaticMarkup}=require(path.join(root,'node_modules/react-dom/server'));
const compile=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
function pure(name){const box={exports:{},Date,Intl};vm.runInNewContext(compile(fs.readFileSync(path.join(root,'apps/admin/app/lib',name+'.ts'),'utf8')),box);return box.exports;}
const libraries=Object.fromEntries(['finance-report','audit-labels'].map(name=>[name,pure(name)])),filter={action:'',entityType:'',entityId:'',from:'',to:''};
const entry={id:'synthetic',action:'commission.rule.updated',entity_type:'commission_rule',entity_id:'synthetic-rule',created_at:'2026-11-22T19:00:00Z',actor_role:'SUPER_ADMIN',actor_user_id:'synthetic-actor',metadata:{secret:'NEVER_RENDER'}};
function render(items,error='',stale=false){let stateIndex=0,refIndex=0;const state=[filter,filter,1,{items,page:1,hasMore:false},error,false,0];const box={exports:{},Date,Intl,URLSearchParams,require(name){
 if(name==='react')return {...React,useState:()=>[state[stateIndex++],()=>{}],useEffect(){},useRef:()=>({current:refIndex++===1&&!stale?'page=1':0})};
 if(name==='react/jsx-runtime')return require(path.join(root,'node_modules/react/jsx-runtime'));
 if(name==='next/link')return {default:props=>React.createElement('a',props,props.children)};
 if(name.endsWith('/admin-nav'))return {AdminNav:()=>null};if(name.endsWith('.css'))return {default:new Proxy({},{get:(_,key)=>String(key)})};
 if(name.endsWith('/api'))return {api(){throw Error('Unexpected live read');}};if(name.endsWith('/xlsx'))return {downloadXlsx(){throw Error('Unexpected export');}};
 const key=name.split('/').at(-1);if(libraries[key])return libraries[key];throw Error(name);
 }};vm.runInNewContext(compile(fs.readFileSync(path.join(root,'apps/admin/app/islem-kayitlari/audit-workspace.tsx'),'utf8')),box);return renderToStaticMarkup(React.createElement(box.exports.default));}
const html=render([entry]);assert(html.includes('Personel Prim Kuralı Düzenlendi'));assert(html.includes('<code>commission.rule.updated</code>'));assert(html.includes('Prim Hakedişi'));assert(html.includes('Prim Kuralı'));assert(html.includes('Müdür'));assert(!html.includes('NEVER_RENDER'));
const unknown=render([{...entry,action:'constructor',entity_type:'constructor',actor_role:'toString'}]);assert(unknown.includes('Diğer İşlem'));assert(unknown.includes('<code>constructor</code>'));assert(unknown.includes('Bilinmiyor'));assert(!unknown.includes('function Object'));
const failed=render([entry],'Read failed');assert(failed.includes('role="alert"'));assert(!failed.includes('<code>commission.rule.updated</code>'));assert(/<button[^>]*disabled=""[^>]*>Bu Sayfayı Excel’e Aktar<\/button>/.test(failed));
const stale=render([entry],'',true);assert(!stale.includes('<code>commission.rule.updated</code>'));assert(stale.includes('Güncel liste bekleniyor'));
console.log('Audit markup passed: Turkish action/entity labels, retained exact codes, safe unknown values, no metadata leakage and failed/stale export exclusion. Browser layout remains unverified.');
