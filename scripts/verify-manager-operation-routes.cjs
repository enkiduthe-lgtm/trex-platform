// Inspect real Nest controller metadata from the built API. No server or database is started.
const assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..');require(path.join(root,'node_modules/reflect-metadata'));
const {PATH_METADATA,METHOD_METADATA}=require(path.join(root,'node_modules/@nestjs/common/constants'));
const {RequestMethod}=require(path.join(root,'node_modules/@nestjs/common'));
const {FinanceController}=require(path.join(root,'apps/api/dist/finance/finance.controller'));
const {CurrentAccountsController}=require(path.join(root,'apps/api/dist/current-accounts/current-accounts.controller'));
const {ShippingController}=require(path.join(root,'apps/api/dist/shipping/shipping.controller'));
const {SupportController}=require(path.join(root,'apps/api/dist/support/support.controller'));
const {REQUIRED_ROLES}=require(path.join(root,'apps/api/dist/auth/roles.decorator'));
const actor={id:'test-actor',role:'SUPER_ADMIN'},dto={test:'payload'},calls=[];
const finance=new FinanceController({createTransaction:(...args)=>calls.push(['transaction',...args]),createTransfer:(...args)=>calls.push(['transfer',...args]),createCarrierSettlement:(...args)=>calls.push(['carrier',...args])});
const current=new CurrentAccountsController({create:(...args)=>calls.push(['current',...args])});
const support=new SupportController({create:(...args)=>calls.push(['support',...args]),addMessage:(...args)=>calls.push(['message',...args])});
const cases=[
 [FinanceController,finance,'idempotentTransaction','/admin/finance/transactions/idempotent'],
 [FinanceController,finance,'idempotentTransfer','/admin/finance/transfers/idempotent'],
 [FinanceController,finance,'idempotentCarrierSettlement','/admin/finance/carrier-settlements/idempotent'],
 [CurrentAccountsController,current,'createIdempotent','/admin/current-accounts/entries/idempotent'],
 [SupportController,support,'createIdempotent','/admin/support-tickets/idempotent'],
];
for(const [Type,controller,method,expected] of cases){
 const handler=Type.prototype[method];assert.equal('/'+Reflect.getMetadata(PATH_METADATA,Type)+'/'+Reflect.getMetadata(PATH_METADATA,handler),expected);assert.equal(Reflect.getMetadata(METHOD_METADATA,handler),RequestMethod.POST);
 controller[method](dto,{user:actor},undefined);let call=calls.at(-1);assert.equal(call[1],dto);assert.equal(call[2],controller===support?actor.id:actor);assert.equal(call[3],'','Missing keys must reach the service as invalid, never as an optional legacy request');
 controller[method](dto,{user:actor},'original-key');call=calls.at(-1);assert.equal(call[3],'original-key');
}
const message=SupportController.prototype.addIdempotentMessage;assert.equal('/'+Reflect.getMetadata(PATH_METADATA,SupportController)+'/'+Reflect.getMetadata(PATH_METADATA,message),'/admin/support-tickets/:id/messages/idempotent');assert.equal(Reflect.getMetadata(METHOD_METADATA,message),RequestMethod.POST);support.addIdempotentMessage('ticket',dto,{user:actor},undefined);assert.deepEqual(calls.at(-1),['message','ticket',dto,actor.id,'']);support.addIdempotentMessage('ticket',dto,{user:actor},'original-key');assert.equal(calls.at(-1).at(-1),'original-key');
const sync=ShippingController.prototype.syncOrder;assert.equal('/'+Reflect.getMetadata(PATH_METADATA,ShippingController)+'/'+Reflect.getMetadata(PATH_METADATA,sync),'/admin/orders/:id/shipment/sync');assert.equal(Reflect.getMetadata(METHOD_METADATA,sync),RequestMethod.POST);assert.deepEqual(Reflect.getMetadata(REQUIRED_ROLES,sync),['SUPER_ADMIN']);
console.log('Built API route checks passed: six mandatory-key POST routes match client URLs and forward the original key; individual tracking queries remain director-only. No application, database or carrier connection was opened.');
