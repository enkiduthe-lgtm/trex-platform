const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),ts=require(path.join(root,'node_modules/typescript')),React=require(path.join(root,'node_modules/react')),{renderToStaticMarkup}=require(path.join(root,'node_modules/react-dom/server'));
function pure(file){const box={exports:{},Date,Intl,Number,Set,URLSearchParams};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,'apps/admin/app/lib',file+'.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,box);return box.exports;}
const libraries=Object.fromEntries(['profitability-report','finance-report','report-period'].map(name=>[name,pure(name)]));
function render(file,state,customerAccess=false){
 let index=0;const box={exports:{},Date,Number,Boolean,Set,String,Intl,URLSearchParams,require(name){
  if(name==='react')return {...React,useState:()=>[state[index++],()=>{}],useRef:value=>({current:value}),useEffect(){}};
  if(name==='react/jsx-runtime')return require(path.join(root,'node_modules/react/jsx-runtime'));
  if(name==='next/link')return {default:props=>React.createElement('a',props,props.children)};
  if(name.endsWith('/admin-nav'))return {AdminNav:()=>null};
  if(name.endsWith('/use-order-permissions'))return {useOrderPermissions:()=>({permissions:{viewCustomer:customerAccess}})};
  if(name.endsWith('.css'))return {default:new Proxy({},{get:(_,key)=>String(key)})};
  if(name.endsWith('/api'))return {api(){throw Error('Unexpected live read');}};
  if(name.endsWith('/xlsx'))return {downloadXlsx(){throw Error('Unexpected export');}};
  const library=name.split('/').at(-1);if(libraries[library])return libraries[library];throw Error(name);
 }};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,'apps/admin/app',file),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,box);return renderToStaticMarkup(React.createElement(box.exports.default));
}
const zero={id:'zero',name:'Synthetic Product',sale_price:'0.00',sale_currency:'TRY',unit_cost:'5.00',cost_currency:'TRY',gross_profit:'-5.00',gross_margin_percent:null};
const profit=render('karlilik/profitability-workspace.tsx',[[zero],'','ALL',false,true,'','2026-11-22T12:00:00Z']);assert(profit.includes('<caption>Ürün Bazında Kârlılık Karşılaştırması</caption>'));assert(profit.includes('Birim Satış Zararı'));assert(profit.includes('Sıfır satış fiyatında marj hesaplanmaz.'));assert(profit.includes('Farklı para birimleri çevrilmez.'));
const profitFailed=render('karlilik/profitability-workspace.tsx',[[zero],'','ALL',false,false,'Offline','2026-11-22T12:00:00Z']);assert(profitFailed.includes('role="alert"'));assert(profitFailed.includes('Doğrulanmadı'));assert(/<button[^>]*disabled=""[^>]*>Excel’e Aktar<\/button>/.test(profitFailed));
const period={from:'2026-11-21',to:'2026-11-22'},report={dateFrom:period.from,dateTo:period.to,rows:[{day:'2026-11-22',count:2,active:1}],count:2,active:1,generatedAt:'2026-11-22T12:00:00Z'};
const members=render('raporlar/uyeler/member-workspace.tsx',[period,report,false,true,'']);assert(!members.includes('href="/musteriler"'),'Reports-only staff must not receive a direct customer-card shortcut');assert(members.includes('<caption>Günlük Müşteri Kayıt Sayıları</caption>'));assert(members.includes('iletişim bilgileri bu rapora alınmaz'));assert(render('raporlar/uyeler/member-workspace.tsx',[period,report,false,true,''],true).includes('href="/musteriler"'));
const membersFailed=render('raporlar/uyeler/member-workspace.tsx',[period,null,false,false,'Offline']);assert(membersFailed.includes('Doğrulanmadı'));assert(membersFailed.includes('Rapor bilgileri doğrulanmadı.'));assert(/<button[^>]*disabled=""[^>]*>Excel’e Aktar<\/button>/.test(membersFailed));
const changed=render('raporlar/uyeler/member-workspace.tsx',[{...period,from:'2026-11-20'},report,false,true,'']);assert(changed.includes('Tarih seçimi değişti.'));assert(/<button[^>]*disabled=""[^>]*>Excel’e Aktar<\/button>/.test(changed));
console.log('Report markup passed: horizontal captions, zero-price loss guidance, mixed-currency scope, unavailable-versus-zero cards, failed/stale export controls and report-only customer-link separation. Browser layout review remains pending.');
