const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),ts=require(path.join(root,'node_modules/typescript'));
const React=require(path.join(root,'node_modules/react')),{renderToStaticMarkup}=require(path.join(root,'node_modules/react-dom/server'));
const transpile=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const source=fs.readFileSync(path.join(root,'apps/admin/app/bayi-portal/page.tsx'),'utf8');
function extract(startText,endText){const start=source.indexOf(startText),end=source.indexOf(endText,start);assert(start>=0&&end>start);return source.slice(start,end);}
const functions=transpile(extract('  async function refreshCreationOptions(','  async function refreshAfterAction('));
function setup(failPath,role='DEALER'){
 const state={ready:false,loading:true,options:{products:[{id:'stale'}]},creationError:'',form:{currency:'EUR',contactEmail:'customer@example.test',recipientName:'Preserved draft'},orders:[],summary:null};
 const calls=[];
 const responses={'/auth/me':{user:{role,email:'dealer@example.test'}},'/dealer-portal/summary':{order_count:'2'},'/dealer-portal/creation-options?currency=EUR':{products:[{id:'fresh'}],warehouses:[{id:'warehouse'}]},'/dealer-portal/orders':[{id:'order'}],'/dealer-portal/ledger':[{id:'ledger'}],'/dealer-portal/shipments':[{id:'shipment'}],'/dealer-portal/commission-balances':[{currency:'TRY',amount:'300.00'}]};
 const box=vm.createContext({Error,form:state.form,
  accountSummaryGate:{current:{invalidate(){}}},
  api:async route=>{calls.push(route);if(route===failPath)throw new Error('Unavailable '+route);return responses[route];},
  setReady:value=>state.ready=value,setAccountLoading:value=>state.loading=value,setOrderDetail:value=>state.detail=value,
  setEmail:value=>state.email=value,setSummary:value=>state.summary=value,setOptions:value=>state.options=value,setCreationError:value=>state.creationError=value,
  setOrders:value=>state.orders=value,setLedger:value=>state.ledger=value,setShipments:value=>state.shipments=value,setAvailable:value=>state.available=value,
  setForm:update=>{state.form=update(state.form);box.form=state.form;},setMessage:value=>state.message=value,
 });
 vm.runInContext(functions,box);return {state,calls,box,responses};
}
async function main(){
 const partial=setup('/dealer-portal/creation-options?currency=EUR');await partial.box.load();
 assert.equal(partial.state.ready,true);assert.equal(partial.state.loading,false);assert(partial.state.creationError);
 assert.equal(partial.state.options.products.length,0,'Unavailable prices must not show a stale catalog');
 assert.equal(partial.state.orders[0].id,'order');assert.equal(partial.state.available[0].amount,'300.00');
 assert.equal(partial.state.form.recipientName,'Preserved draft');assert.equal(partial.state.form.contactEmail,'customer@example.test');
 partial.box.api=async route=>partial.responses[route];await partial.box.refreshCreationOptions();
 assert.equal(partial.state.options.products[0].id,'fresh');assert.equal(partial.state.creationError,'');assert.equal(partial.state.orders[0].id,'order');
 const critical=setup('/dealer-portal/summary');await assert.rejects(critical.box.load(),/Unavailable/);
 assert.equal(critical.state.ready,false);assert.equal(critical.state.loading,false);assert.equal(critical.state.summary,null);
 const unauthorized=setup(undefined,'ADMIN');await assert.rejects(unauthorized.box.load(),/Yalnızca Bayi/);
 assert.deepEqual(unauthorized.calls,['/auth/me']);assert.equal(unauthorized.state.loading,false);
 const css={default:{}};
 const component={exports:{},require:name=>name==='react/jsx-runtime'?require(path.join(root,'node_modules/react/jsx-runtime')):css};
 vm.runInNewContext(transpile(fs.readFileSync(path.join(root,'apps/admin/app/bayi-portal/account-summary.tsx'),'utf8')),component);
 const props={orderCount:'999',available:[{currency:'TRY',amount:'999.99'}],balances:[{currency:'TRY',amount:'111.11'}]};
 const loading=renderToStaticMarkup(React.createElement(component.exports.AccountSummary,{...props,ready:false,loading:true}));
 assert(loading.includes('Yükleniyor'));assert(!loading.includes('999')&&!loading.includes('Kayıt bulunmuyor'));
 const unavailable=renderToStaticMarkup(React.createElement(component.exports.AccountSummary,{...props,ready:false,loading:false}));
 assert(unavailable.includes('Bilgiler alınamadı'));assert(!unavailable.includes('999'));
 console.log('Dealer loading passed: unavailable FX prices, usable financial history, isolated price retry, preserved draft, critical failures, role isolation and honest summary cards.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
