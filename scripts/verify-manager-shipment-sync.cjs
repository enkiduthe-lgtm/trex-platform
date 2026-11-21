// Real shipping page handlers, controlled API responses. Never contacts Aras or production.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),ts=require(path.join(root,'node_modules/typescript'));
const source=fs.readFileSync(path.join(root,'apps/admin/app/kargo/page.tsx'),'utf8').replace(/\r\n/g,'\n');
const transpile=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
function extract(a,b){const start=source.indexOf(a),end=source.indexOf(b,start);assert(start>=0&&end>start);return source.slice(start,end);}
const shipment={id:'shipment',order_id:'order',order_number:'TEST-1',provider:'aras',status:'IN_TRANSIT',tracking_direction_code:'1'};
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function setup(){
 const state={loading:false,loaded:true,config:{provider:'aras',tracking:{configured:true,enabled:false}},shipments:[shipment],queue:[],message:'',loadError:'',details:{old:{events:[]}},busy:null},requests=[];
 const box=vm.createContext({Error,Array,Number,Promise,role:'SUPER_ADMIN',accessLoading:false,...state,actionLock:{current:false},readyRef:{current:true},alive:{current:true},readVersion:{current:0},
  api:(route,init)=>new Promise((resolve,reject)=>requests.push({route,init,resolve,reject}))});
 for(const key of Object.keys(state))box['set'+key[0].toUpperCase()+key.slice(1)]=value=>{state[key]=typeof value==='function'?value(state[key]):value;box[key]=state[key];};
 vm.runInContext(transpile(extract('const load = async () => {','useEffect(() => {')+extract('async function syncShipment(','async function createShipment(')+extract('async function loadHistory(','const registered='))+'\nglobalThis.load=load;',box);
 return {state,requests,box};
}
async function main(){
 const success=setup();const syncing=success.box.syncShipment('order');await success.box.syncShipment('order');assert.equal(success.requests.length,1);assert.equal(success.requests[0].route,'/admin/orders/order/shipment/sync');assert.equal(success.requests[0].init.method,'POST');
 success.requests[0].resolve({configured:true,checked:1,updated:1,failed:0});await flush();assert.equal(success.state.details.old,undefined);success.requests[1].resolve(success.state.config);success.requests[2].resolve([{...shipment,status:'DELIVERED',tracking_number:'123'}]);success.requests[3].resolve([]);await syncing;
 assert.equal(success.state.shipments[0].status,'DELIVERED');assert.equal(success.state.shipments[0].tracking_number,'123');assert(success.state.message.includes('Yeni gönderi oluşturulmadı'));assert.equal(success.box.actionLock.current,false);assert(success.requests.every(r=>r.route.endsWith('/sync')||!r.init));
 const partial=setup();const pending=partial.box.syncShipment('order');partial.requests[0].resolve({checked:1,updated:1,failed:0});await flush();partial.requests[1].reject(Error('Refresh offline'));partial.requests[2].resolve([]);partial.requests[3].resolve([]);await pending;
 assert(partial.state.message.includes('güncellendi'));assert.equal(partial.state.loadError,'Refresh offline');assert.equal(partial.state.loaded,false);assert.equal(partial.box.readyRef.current,false);await partial.box.syncShipment('order');assert.equal(partial.requests.length,4);
 for(const change of [box=>box.role='ADMIN',box=>box.accessLoading=true,box=>box.config.tracking.configured=false,box=>box.shipments=[{...shipment,status:'DELIVERED'}],box=>box.shipments=[{...shipment,tracking_direction_code:'3'}],box=>box.readyRef.current=false]){const denied=setup();change(denied.box);await denied.box.syncShipment('order');assert.equal(denied.requests.length,0);}
 for(const [result,text] of [[{busy:true},'kontrolü sürüyor'],[{configured:false},'ayarları eksik'],[{checked:1,updated:0,failed:1},'tamamlanamadı'],[{checked:1,updated:0,failed:0},'henüz gönderi hareketi'],[{checked:0,updated:0,failed:0},'aktif gönderi bulunamadı']]){
  const s=setup();const p=s.box.syncShipment('order');s.requests[0].resolve(result);await flush();s.requests[1].resolve(s.state.config);s.requests[2].resolve(s.state.shipments);s.requests[3].resolve([]);await p;assert(s.state.message.includes(text),s.state.message);
 }
 const race=setup();const first=race.box.load(),second=race.box.load();race.requests[3].resolve(race.state.config);race.requests[4].resolve([{...shipment,id:'new'}]);race.requests[5].resolve([]);await second;race.requests[0].reject(Error('Old read failed'));race.requests[1].resolve([]);race.requests[2].resolve([]);await first;assert.equal(race.state.shipments[0].id,'new');assert.equal(race.state.loadError,'');assert.equal(race.state.loaded,true);
 const history=setup();const oldHistory=history.box.loadHistory('order');history.box.readVersion.current++;history.requests[0].resolve({events:[{id:'old'}]});await oldHistory;assert.equal(history.state.details.order,undefined);
 const disposed=setup();const closing=disposed.box.syncShipment('order');disposed.box.alive.current=false;disposed.requests[0].resolve({checked:1,updated:1,failed:0});await closing;assert.equal(disposed.requests.length,1);assert.equal(disposed.box.actionLock.current,false);
 console.log('Manager shipment sync passed: director-only single-order query, no shipment creation, delivered/tracking refresh, absent/failed/busy outcomes, preserved success after failed refresh, stale list/history and disposal guards.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
