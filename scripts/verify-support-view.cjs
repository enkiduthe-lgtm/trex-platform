const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),ts=require(path.join(root,'node_modules/typescript')),React=require(path.join(root,'node_modules/react')),{renderToStaticMarkup}=require(path.join(root,'node_modules/react-dom/server'));
const source=fs.readFileSync(path.join(root,'apps/admin/app/destek/page.tsx'),'utf8');
const names=[...source.matchAll(/\[\s*(\w+)\s*,\s*\w+\s*\]\s*=\s*useState/g)].map(match=>match[1]);
function lib(file){const box={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,'apps/admin/app/lib',file+'.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,box);return box.exports;}
const controls=lib('async-controls'),rules=lib('order-permissions');
const ticket={id:'ticket-a',ticket_number:'DST-TEST',status:'OPEN',priority:'NORMAL',contact_name:'Test',subject:'Test Talebi',assigned_to:null,assigned_email:null,order_id:'linked-order',order_number:'TEST-ORDER',created_at:'2026-11-22T10:00:00Z',due_at:'2026-11-23T10:00:00Z',messages:[{id:'public',body:'Birinci satır\nİkinci satır',is_internal:false,created_at:'2026-11-22T10:00:00Z'},{id:'private',body:'İç not',is_internal:true,created_at:'2026-11-22T10:00:00Z'}],activity:[]};
function render({grants=['SUPPORT.VIEW'],pending='',ready=true}={}){
 const overrides={rows:[ticket],selected:{...ticket,activity:[{id:'audit',action:'support_ticket.created',created_at:'2026-11-22T10:00:00Z'}]},assignees:[{id:'staff',email:'staff@example.test',role:'ADMIN'}],listLoading:false,listReady:ready,loadedStatus:'',detailLoading:false,detailReady:true,listError:ready?'':'Read offline',summary:{open_count:'1',urgent_count:'0',overdue_count:'0'}};let stateIndex=0;
 const box={exports:{},Date,Intl,URLSearchParams,require(name){
  if(name==='react')return {...React,useState:initial=>[Object.hasOwn(overrides,names[stateIndex])?overrides[names[stateIndex++]]:(stateIndex++,typeof initial==='function'?initial():initial),()=>{}],useRef:value=>({current:value}),useEffect(){}};
  if(name==='react/jsx-runtime')return require(path.join(root,'node_modules/react/jsx-runtime'));
  if(name==='next/navigation')return {useSearchParams:()=>new URLSearchParams()};if(name==='next/link')return {default:props=>React.createElement('a',props,props.children)};
  if(name.endsWith('/admin-nav'))return {AdminNav:()=>null};if(name.endsWith('/use-order-permissions'))return {useOrderPermissions:()=>({permissions:rules.orderPermissions('ADMIN',{configured:true,grants}),loading:false,error:''})};
  if(name.endsWith('/use-finance-submission'))return {useFinanceSubmission:endpoint=>({busy:false,pending:pending&&(pending==='message')===endpoint.includes('/messages/')?{body:'original',key:'key',endpoint}:null})};if(name.endsWith('/async-controls'))return controls;
  if(name.endsWith('.css'))return {default:new Proxy({},{get:(_,key)=>String(key)})};if(name.endsWith('/api'))return {api(){throw Error('Unexpected request');}};if(name.endsWith('/xlsx'))return {downloadXlsx(){}};throw Error(name);
 }};
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,box);
 return renderToStaticMarkup(React.createElement(box.exports.default));
}
const view=render();assert(!view.includes('<form'));assert(view.includes('DST-TEST'));assert(view.includes('Mesaj geçmişi'));assert(!view.includes('href="/siparisler/linked-order"'));assert.equal((view.match(/<select disabled=""/g)||[]).length,3);
const create=render({grants:['SUPPORT.VIEW','SUPPORT.CREATE']});assert(create.includes('Talebi Kaydet'));assert(create.includes('Mesajı Kaydet'));assert(create.includes('Müşteri listesi yetkiniz kapalı'));assert(create.includes('class="message internal"'));
assert(create.includes('staff@example.test · Yönetici'));assert(create.includes('Talep oluşturuldu'));assert(!create.includes('support_ticket.created'));
const edit=render({grants:['SUPPORT.VIEW','SUPPORT.EDIT']});assert(!edit.includes('<form'));assert.equal((edit.match(/<select disabled=""/g)||[]).length,0);
const unknown=render({grants:['SUPPORT.VIEW','SUPPORT.CREATE'],pending:'ticket'});assert(unknown.includes('Talebi Doğrula / Yeniden Dene'));assert(unknown.indexOf('Talebi Doğrula / Yeniden Dene')<unknown.indexOf('<form'));assert(/<fieldset[^>]*disabled=""/.test(unknown));
const message=render({grants:['SUPPORT.VIEW','SUPPORT.CREATE'],pending:'message'});assert(message.includes('Mesajı Doğrula / Yeniden Dene'));
const failed=render({grants:['SUPPORT.VIEW','SUPPORT.CREATE'],ready:false});assert(failed.includes('role="alert"'));assert(/<fieldset[^>]*disabled=""/.test(failed));assert(!/<button[^>]*disabled=""[^>]*>Talepleri Yenile/.test(failed));assert(!failed.includes('class="form-card ticket"'),'Unverified list rows stay hidden while independently verified case detail remains readable');
console.log('Support markup passed: usable view-only detail, independent create/edit actions, hidden unauthorized order links, explicit pending recovery outside locked forms, boxed internal notes and retryable list errors. Browser layout remains unverified.');
