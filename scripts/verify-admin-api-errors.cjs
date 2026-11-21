const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),ts=require(path.join(root,'node_modules/typescript'));
const source=fs.readFileSync(path.join(root,'apps/admin/app/lib/api.ts'),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const response=(status,body)=>({status,ok:status>=200&&status<300,json:async()=>body});
function setup(handler){
 const store=new Map(),redirects=[],events=new Map();
 const box={exports:{},Error,FormData,atob,fetch:(...args)=>handler(...args),window:{addEventListener:(name,callback)=>events.set(name,callback),localStorage:{getItem:key=>store.get(key)??null,setItem:(key,value)=>store.set(key,value),removeItem:key=>store.delete(key)},location:{pathname:'/bayi-portal',replace:value=>redirects.push(value)}}};
 vm.runInNewContext(code,box);return {api:box.exports,store,redirects,events};
}
async function main(){
 const validation=setup(async()=>response(422,{message:['Alan gerekli','Tutar geçersiz']}));
 await assert.rejects(validation.api.api('/test'),error=>error instanceof validation.api.ApiError&&error.status===422&&error.message==='Alan gerekli · Tutar geçersiz');
 const unavailable=setup(async()=>({status:503,ok:false,json:async()=>{throw Error('not JSON');}}));
 await assert.rejects(unavailable.api.api('/test'),error=>error.status===503&&error.message==='İşlem tamamlanamadı (503)');
 const offline=setup(async()=>{throw new TypeError('offline');});
 await assert.rejects(offline.api.api('/test'),error=>!(error instanceof offline.api.ApiError)&&error.message==='offline');
 let completeRefresh,refreshCalls=0;const calls=[];
 const renewed=setup(async(url,init)=>{
  calls.push({url,init});
  if(url.endsWith('/auth/refresh')){refreshCalls++;return new Promise(resolve=>completeRefresh=()=>resolve(response(200,{accessToken:'new-test-token'})));}
  if(init.headers.Authorization==='Bearer new-test-token')return response(200,{id:'saved'});
  return response(401,{});
 });
 renewed.api.setToken('old-test-token');
 const body='{"amount":100}',first=renewed.api.api('/dealer-portal/payout-requests',{method:'POST',body,headers:{'Idempotency-Key':'test-key'}}),second=renewed.api.api('/dealer-portal/orders');
 await new Promise(resolve=>setImmediate(resolve));assert.equal(refreshCalls,1,'Concurrent authorization failures must share one token refresh');
 completeRefresh();await Promise.all([first,second]);
 const replay=calls.find(row=>row.url.endsWith('/payout-requests')&&row.init.headers.Authorization==='Bearer new-test-token');
 assert.equal(replay.init.method,'POST');assert.equal(replay.init.body,body);assert.equal(replay.init.headers['Idempotency-Key'],'test-key');
 assert.equal(renewed.redirects.length,0);
 const expired=setup(async()=>response(401,{}));expired.api.setToken('expired-test-token');
 await assert.rejects(expired.api.api('/dealer-portal/orders'),error=>error.status===401);
 assert.deepEqual(expired.redirects,['/giris']);assert.equal(expired.api.getToken(),null);
 const token=(sub,version=1)=>'header.'+Buffer.from(JSON.stringify({sub,version})).toString('base64url')+'.signature';
 let writes=0;const switched=setup(async()=>{writes++;return response(200,{id:'saved'});});
 switched.api.setToken(token('dealer-a'));await switched.api.api('/dealer-portal/orders');assert.equal(writes,1);
 switched.store.set(switched.api.tokenKey,token('dealer-b'));
 await assert.rejects(switched.api.api('/dealer-portal/orders',{method:'POST',body:'{}'}),error=>error.status===401);
 assert.equal(writes,1,'An old page must not submit an order with another account token');
 assert.deepEqual(switched.redirects,['/giris']);assert.equal(switched.api.getToken(),token('dealer-b'),'Other tabs keep their own active token');
 const same=setup(async()=>response(200,{}));same.api.setToken(token('dealer-a'));
 same.store.set(same.api.tokenKey,token('dealer-a',2));same.events.get('storage')({key:same.api.tokenKey,newValue:token('dealer-a',2)});
 await same.api.api('/dealer-portal/orders');assert.equal(same.redirects.length,0,'Normal renewal for the same user must remain valid');
 same.events.get('storage')({key:same.api.tokenKey,newValue:token('dealer-b')});assert.deepEqual(same.redirects,['/giris']);
 const explicit=setup(async()=>response(200,{}));explicit.api.setToken(token('dealer-a'));explicit.api.clearToken();explicit.api.setToken(token('dealer-b'));await explicit.api.api('/dealer-portal/orders');assert.equal(explicit.redirects.length,0);
 let orderSends=0;const drift=setup(async url=>{if(url.endsWith('/auth/refresh'))return response(200,{accessToken:token('dealer-b')});orderSends++;return response(401,{});});
 drift.api.setToken(token('dealer-a'));await assert.rejects(drift.api.api('/dealer-portal/orders',{method:'POST',body:'{}'}),error=>error.status===401);
 assert.equal(orderSends,1,'A refresh cookie belonging to another account must not replay the original POST');assert.deepEqual(drift.redirects,['/giris']);
 const loggedOut=setup(async()=>response(200,{}));loggedOut.api.setToken(token('dealer-a'));loggedOut.events.get('storage')({key:loggedOut.api.tokenKey,newValue:null});assert.deepEqual(loggedOut.redirects,['/giris']);
 console.log('API client passed: HTTP status errors, validation messages, transport failures, shared refresh, unchanged POST replay, and expired sessions.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
