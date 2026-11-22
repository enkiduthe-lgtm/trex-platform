const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),ts=require(path.join(root,'node_modules/typescript')),React=require(path.join(root,'node_modules/react')),{renderToStaticMarkup}=require(path.join(root,'node_modules/react-dom/server'));
function pure(name){const box={exports:{},Date,Intl,URLSearchParams,require(module){if(module==='./report-totals')return pure('report-totals');throw Error(module);}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,'apps/admin/app/lib',name+'.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,box);return box.exports;}
const libraries=Object.fromEntries(['report-period','management-report','sales-groups'].map(name=>[name,pure(name)]));
const filters={dateFrom:'2026-11-21',dateTo:'2026-11-22',currency:'TRY'},data={...filters,generatedAt:'2026-11-22T19:30:00Z',totals:{order_count:0,revenue:'0',average_order:'0'},financial:{income:'0',expense:'0',net:'0'},daily:[],channels:[],statuses:[],topProducts:[]},operations={returns_open:0,returns_refunded:0,shipments_active:0,shipments_failed:0,shipments_returned:0,support_overdue:0};
function render(state){let index=0;const box={exports:{},Date,Intl,URLSearchParams,require(name){
 if(name==='react')return {...React,useState:()=>[state[index++],()=>{}],useRef:value=>({current:value}),useEffect(){}};
 if(name==='react/jsx-runtime')return require(path.join(root,'node_modules/react/jsx-runtime'));
 if(name==='next/link')return {default:props=>React.createElement('a',props,props.children)};
 if(name.endsWith('/admin-nav'))return {AdminNav:()=>null};if(name.endsWith('.css'))return {default:new Proxy({},{get:(_,key)=>String(key)})};
 if(name.endsWith('/api'))return {api(){throw Error('Unexpected live access');}};if(name.endsWith('/xlsx'))return {downloadXlsx(){throw Error('Unexpected export');}};
 const key=name.split('/').at(-1);if(libraries[key])return libraries[key];throw Error(name);
 }};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,'apps/admin/app/raporlar/page.tsx'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,box);return renderToStaticMarkup(React.createElement(box.exports.default));}
const state=[filters,data,operations,false,'','',filters];const html=render(state);
assert(html.includes('22:30:00'));assert(html.includes('aria-label="Günlük Sipariş Özeti"'));assert(html.includes('Satış Kanalı Performansı'));assert(!html.includes('Platform Satış Performansı'));assert(!html.includes('Günlük Ziyaretçi Özeti'));assert(!html.includes('Henüz Hazır Değil'));
for(const group of Object.keys(libraries['sales-groups'].salesGroups))assert(html.includes('group='+group),'Missing working catalogue group '+group);
const failed=render([filters,null,operations,false,'Satış ve finans özeti alınamadı.','',filters]);assert(failed.includes('role="alert"'));assert(!failed.includes('NET NAKİT'));assert(failed.includes('Dönem Operasyon Özeti'));assert(/<button[^>]*disabled=""[^>]*>Excel’e Aktar<\/button>/.test(failed));
const changed=render([{...filters,currency:'EUR'},data,operations,false,'','',filters]);assert(changed.includes('Filtreler değişti.'));assert(changed.includes('currency=TRY'));assert(/<button[^>]*disabled=""[^>]*>Excel’e Aktar<\/button>/.test(changed));
console.log('Management report markup passed: business-time generation stamp, labelled tables, working catalogue destinations, no visitor placeholder, independent errors and snapshot-bound exports. Browser layout remains unverified.');
