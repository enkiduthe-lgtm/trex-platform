const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),React=require(path.join(root,'node_modules/react')),{renderToStaticMarkup}=require(path.join(root,'node_modules/react-dom/server')),ts=require(path.join(root,'node_modules/typescript'));
const transpile=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
function helper(name){const box={exports:{},require:module=>module.startsWith('.')?helper(path.join(path.dirname(name),module)):require(module)};vm.runInNewContext(transpile(fs.readFileSync(path.join(root,'apps/admin/app/lib',name+'.ts'),'utf8')),box);return box.exports;}
const entry={id:'earned',order_item_id:'item',recipient_user_id:'executive',staff_role:'EXECUTIVE',staff_channel_group:'RETAIL',staff_unit_amount:'6.00',staff_share_count:3,amount:'12.00',currency:'TRY',status:'CONFIRMED',entry_kind:'EARN',created_at:'2026-11-21T10:00:00Z',paid_at:null,staff_paid_amount:null,note:null,order_number:'TEST-ORDER',product_name:'Test Tea',sku:'tea',quantity:2,recipient_email:'private-recipient@example.test'};
function render({own=false,financeError='',busy=''}={}){
 const data={canManage:!own,canSeeAll:!own,settings:null,rates:[{id:'secret',product_id:'tea',channel_group:'RETAIL',executive_amount:'6.00',director_amount:'4321.00',product_name:'Test Tea',sku:'tea'}],users:[],products:[],entries:[entry]};
 const state=[data,'2026-11','',busy,{executiveCount:3,executiveIds:[],directorId:''},{productId:'',channelGroup:'RETAIL',executiveAmount:'',directorAmount:''},'account',[{id:'account',name:'TL Kasası',currency:'TRY'}],financeError,false,false,'',false];let index=0;
 const box={exports:{},Error,Intl,Date,require(name){
  if(name==='react')return {...React,useState:()=>[state[index++],()=>{}],useRef:value=>({current:value}),useEffect(){}};
  if(name==='react/jsx-runtime')return require(path.join(root,'node_modules/react/jsx-runtime'));
  if(name==='next/link')return {default:props=>React.createElement('a',props,props.children)};
  if(name.endsWith('/admin-nav'))return {AdminNav:()=>null};if(name.endsWith('/metric-chart'))return {MetricChart:()=>null};
  if(name.endsWith('.css'))return {default:new Proxy({},{get:(_,key)=>String(key)})};
  if(name.endsWith('/api'))return {api(){throw Error('Unexpected request during static rendering');}};
  if(name.endsWith('/xlsx'))return {downloadXlsx(){}};if(name.startsWith('../../lib/'))return helper(name.slice('../../lib/'.length));throw Error(name);
 }};
 vm.runInNewContext(transpile(fs.readFileSync(path.join(root,'apps/admin/app/primler/yonetim/page.tsx'),'utf8')),box);
 return renderToStaticMarkup(React.createElement(box.exports.default));
}
const own=render({own:true});assert(own.includes('TEST-ORDER'));assert(!own.includes('private-recipient@example.test'));assert(!own.includes('Müdür Prim / Adet'));assert(!own.includes('Ödeme Hesabı'));assert(!own.includes('4.321'));
const failed=render({financeError:'offline'});assert(failed.includes('TEST-ORDER'));assert(failed.includes('Ürün Ve Kanal Prim Tutarları'));assert(failed.includes('Ödeme Hesaplarını Yenile'));assert(failed.includes('Ödeme hesapları alınamadı'));
assert(/<button[^>]*disabled=""[^>]*>Ödendi Kaydet<\/button>/.test(failed),'Account failure disables recording payment while entries stay visible');
const saving=render({busy:'channel-pools/settings'});assert.equal((saving.match(/<fieldset disabled="" class="grid formFields"/g)||[]).length,2,'Both settings forms are disabled during a write');
console.log('Management commission markup passed: own-only identity/director privacy, visible entries/settings on account failure, disabled payments and frozen saving forms. Browser layout remains unverified.');
