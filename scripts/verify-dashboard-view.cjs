const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),ts=require(path.join(root,'node_modules/typescript')),React=require(path.join(root,'node_modules/react')),{renderToStaticMarkup}=require(path.join(root,'node_modules/react-dom/server'));
const compile=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
function pure(name){const box={exports:{},Intl,Date};vm.runInNewContext(compile(fs.readFileSync(path.join(root,'apps/admin/app/lib',name+'.ts'),'utf8')),box);return box.exports;}
const libraries=Object.fromEntries(['dashboard-access','dashboard-data','chart-data'].map(name=>[name,pure(name)]));
const summary={generatedAt:'2026-11-22T20:59:59Z',periods:['all','week','today'].flatMap(period=>[{period,currency:'TRY',total_count:2,sales_count:2,amount:'0.30'},{period,currency:'EUR',total_count:1,sales_count:1,amount:'900.00'}]),trend:[{created_at:'2026-11-22T20:00:00Z',currency:'TRY',amount:'0.30'},{created_at:'2026-11-22T20:00:00Z',currency:'EUR',amount:'900.00'}],stages:[{stage:'DELIVERED',count:3}],carriers:[{provider:'aras',count:3}],recent:[]};
const operations={waiting:'0',picking:'0',packing:'0',critical_stock:'0',returns_pending:'0'},support={open_count:'0',urgent_count:'0',overdue_count:'0'};
function render(overrides={}){
 const values={currency:'TRY',authenticated:true,role:'SUPER_ADMIN',access:libraries['dashboard-access'].dashboardAccess('SUPER_ADMIN'),loading:false,summary,stockAvailable:true,operations,stock:[],support,message:'',period:'today',updatedAt:'2026-11-22T20:59:59Z',...overrides},state=Object.values(values),charts=[];let index=0;
 const box={exports:{},Date,Intl,require(name){
  if(name==='react')return {...React,useState:()=>[state[index++],()=>{}],useRef:value=>({current:value}),useEffect(){},useMemo:fn=>fn()};
  if(name==='react/jsx-runtime')return require(path.join(root,'node_modules/react/jsx-runtime'));
  if(name==='next/link')return {default:props=>React.createElement('a',props,props.children)};
  if(name==='next/navigation')return {useRouter:()=>({replace(){throw Error('Unexpected navigation');}})};
  if(name.endsWith('/admin-nav'))return {AdminNav:()=>null};
  if(name.endsWith('/metric-chart'))return {MetricChart:props=>{charts.push(props);return React.createElement('section',{'data-unavailable':props.unavailable,'data-title':props.title});}};
  if(name.endsWith('.css'))return {default:new Proxy({},{get:(_,key)=>String(key)})};
  if(name.endsWith('/api'))return {api(){throw Error('Unexpected live read');}};
  const key=name.split('/').at(-1);if(libraries[key])return libraries[key];throw Error(name);
 }};vm.runInNewContext(compile(fs.readFileSync(path.join(root,'apps/admin/app/dashboard-page.tsx'),'utf8')),box);return {html:renderToStaticMarkup(React.createElement(box.exports.default)),charts};
}
const normal=render();assert(normal.html.includes('Veri zamanı:'));assert(normal.html.includes('23:59:59'));assert(normal.html.includes('Son kontrol:'));assert(normal.html.includes('her dakika yenilenir'));assert.equal(normal.charts[0].data.at(-1).label,'22 Kas');assert.equal(normal.charts[0].data.at(-1).value,0.30);assert.equal(normal.charts[0].data.length,7);
const euro=render({currency:'EUR'});assert.equal(euro.charts[0].data.at(-1).value,900);assert.equal(euro.charts[0].currency,'EUR');
const failed=render({summary:null,operations:null,stock:[],stockAvailable:false,support:null,message:'Satış ve Sipariş Özeti Yüklenemedi.',updatedAt:null});assert(failed.html.includes('role="alert"'));assert(failed.charts.every(chart=>chart.unavailable));assert(failed.html.includes('Stok Bilgileri Yüklenemedi.'));assert(!failed.html.includes('Veri zamanı:'));assert(!failed.html.includes('Son kontrol:'));
const scoped=render({role:'ADMIN',access:libraries['dashboard-access'].dashboardAccess('ADMIN',{configured:true,grants:['SUPPORT.VIEW']}),summary:null});assert.equal(scoped.charts.length,0);assert(scoped.html.includes('MÜŞTERİ TALEPLERİ'));assert(!scoped.html.includes('SATIŞ PERFORMANSI'));assert(!scoped.html.includes('href="/kargo"'));
const auth=render({authenticated:false});assert(auth.html.includes('Giriş Kontrol Ediliyor'));assert(!auth.html.includes('SATIŞ PERFORMANSI'));
console.log('Homepage markup passed: validated snapshot timestamps, date-anchored seven-day chart, separate currencies, unavailable sections and permission-scoped cards. Browser layout remains unverified.');
