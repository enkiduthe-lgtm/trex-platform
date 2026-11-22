const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),ts=require(path.join(root,'node_modules/typescript')),React=require(path.join(root,'node_modules/react')),{renderToStaticMarkup}=require(path.join(root,'node_modules/react-dom/server'));
const compile=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
function pure(name){const box={exports:{}};vm.runInNewContext(compile(fs.readFileSync(path.join(root,'apps/admin/app/lib',name+'.ts'),'utf8')),box);return box.exports;}
const libraries=Object.fromEntries(['async-controls','legacy-commission-data'].map(name=>[name,pure(name)])),source=fs.readFileSync(path.join(root,'apps/admin/app/primler/page.tsx'),'utf8');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const data={canManage:true,rules:[{id:id(50),is_active:true,product_name:'Synthetic product',sku:'TEST',recipient_kind:'STAFF',recipient_email:'staff@example.invalid',amount_per_unit:'2.10',currency:'TRY',sales_channel_group:'RETAIL'}],entries:[{id:id(10),entry_kind:'EARN',status:'CONFIRMED',order_number:'SYNTHETIC-1',product_name:'Synthetic product',quantity:5,amount:'2.10',currency:'TRY',created_at:'2026-11-22T18:00:00Z',recipient_kind:'STAFF',recipient_email:'staff@example.invalid'}],staff:[{id:id(2),email:'staff@example.invalid',role:'ADMIN'}],products:[{id:id(40),name:'Synthetic product',sku:'TEST'}],accounts:[{id:id(30),name:'Test TRY account',currency:'TRY'}]};
function render(overrides={}){
 const values={data,message:'',busy:'',loading:false,ready:true,loadError:'',reverseId:'',reversalNote:'',closeRuleId:'',form:{productId:id(40),recipientUserId:id(2),recipientKind:'STAFF',salesChannelGroup:'RETAIL',amountPerUnit:'2.10'},productQuery:'',startDate:'',endDate:'',accounts:{[id(10)]:id(30)},...overrides},state=Object.values(values);let index=0;
 const box={exports:{},Date,Intl,require(name){
 if(name==='react')return {...React,useState:()=>[state[index++],()=>{}],useRef:value=>({current:value}),useEffect(){}};
 if(name==='react/jsx-runtime')return require(path.join(root,'node_modules/react/jsx-runtime'));
 if(name==='next/link')return {default:props=>React.createElement('a',props,props.children)};
 if(name.endsWith('/admin-nav'))return {AdminNav:()=>null};if(name.endsWith('.css'))return {default:new Proxy({},{get:(_,key)=>String(key)})};
 if(name.endsWith('/api'))return {api(){throw Error('Unexpected live request');},ApiError:Error};const key=name.split('/').at(-1);if(libraries[key])return libraries[key];throw Error(name);
 }};vm.runInNewContext(compile(source),box);return renderToStaticMarkup(React.createElement(box.exports.default));
}
const normal=render();assert(normal.includes('Personel Prim Kuralları Ve Hareketleri'));assert(normal.includes('Ödendi Kaydet'));assert(normal.includes('banka havalesi göndermez'));assert(normal.includes('5 adet'));
const reverse=render({reverseId:id(10),reversalNote:'Selected adjustment'});assert(reverse.includes('aria-labelledby="reverse-commission-title"'));assert(reverse.includes('SYNTHETIC-1'));assert(reverse.includes('staff@example.invalid'));assert(reverse.includes('yalnızca seçilen hakedişi etkiler'));assert(/maxlength="500"/i.test(reverse));assert(reverse.includes('Seçilen Prime Ters Kayıt Oluştur'));
const close=render({closeRuleId:id(50)});assert(close.includes('aria-labelledby="close-commission-rule-title"'));assert(close.includes('Kuralı Kapatmayı Onayla'));
const busy=render({busy:'saving',ready:true});assert(busy.includes('<fieldset disabled="">'));assert(/<button[^>]*disabled=""[^>]*>Ödendi Kaydet<\/button>/.test(busy));assert(/<select[^>]*disabled=""[^>]*aria-label="Ödeme hesabı"/.test(busy));
const failed=render({data:null,ready:false,loadError:'Synthetic read error'});assert(failed.includes('role="alert"'));assert(failed.includes('kayıtları doğrulanmadı'));assert(failed.includes('— Prim Hareketi'));assert(!failed.includes('Henüz aktif prim kuralı yok.'));assert(!failed.includes('Seçilen Dönemde Gösterilecek Prim Hareketi Yok.'));
const own=render({data:{...data,canManage:false,staff:[],products:[],accounts:[]}});assert(!own.includes('Ödendi Kaydet'));assert(!own.includes('Ters kayıt</button>'));assert(!own.includes('Ürün Bazında Personel Primi'));
const searched=render({productQuery:'another product'});assert(searched.includes('value="'+id(40)+'" selected=""'),'Selected product remains visible when the search text changes');
const savedReadError=render({data:null,ready:false,message:'Prim kuralı kaydedildi.',loadError:'Liste alınamadı.'});assert(savedReadError.includes('Prim kuralı kaydedildi.'));assert(savedReadError.includes('Liste alınamadı.'));
console.log('Legacy commission markup passed: in-panel selected-record confirmations, disabled writes during refresh/save, explicit bank-recording wording, honest failed states, own-only controls and retained product selection. Browser layout remains unverified.');
