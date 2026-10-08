const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createHash,createHmac,randomUUID}=require('node:crypto');
const ts=require('typescript');
const {AsyncLocalStorage}=require('node:async_hooks');
require('reflect-metadata');
// Execute the actual service sources against an isolated PostgreSQL-compatible DB.
require.extensions['.ts']=(module,filename)=>module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,experimentalDecorators:true,emitDecoratorMetadata:true}}).outputText,filename);
const modulePath=process.env.PGLITE_MODULE||'@electric-sql/pglite';
const {PGlite}=require(modulePath);
const {citext}=require(path.isAbsolute(modulePath)?path.join(modulePath,'dist/contrib/citext.cjs'):'@electric-sql/pglite/contrib/citext');
const {CartService}=require('../src/carts/cart.service.ts');
const {PricingService}=require('../src/pricing/pricing.service.ts');
const {CheckoutService}=require('../src/checkout/checkout.service.ts');
const {PaymentsService}=require('../src/payments/payments.service.ts');
const {OrdersService}=require('../src/orders/orders.service.ts');
const {AuthService}=require('../src/auth/auth.service.ts');
const {JwtAuthGuard}=require('../src/auth/jwt-auth.guard.ts');
const {JwtService}=require('@nestjs/jwt');
const {bootstrapAdminAccount}=require('../src/database/bootstrap-admin-account.ts');
async function main(){
 const pg=new PGlite({extensions:{citext}});
 const envKeys=['PAYTR_MERCHANT_KEY','PAYTR_MERCHANT_SALT'];
 const previous=Object.fromEntries(envKeys.map(key=>[key,process.env[key]]));
 try{
  const directory=path.join(__dirname,'../migrations');
  for(const name of fs.readdirSync(directory).filter(name=>name.endsWith('.sql')).sort()){
   const sql=fs.readFileSync(path.join(directory,name),'utf8').replace(/^CREATE EXTENSION IF NOT EXISTS pgcrypto;\s*/m,'');
   if(/ALTER\s+TYPE\s+[^;]+\s+ADD\s+VALUE/i.test(sql)){for(const statement of sql.split(';').map(s=>s.trim()).filter(Boolean))await pg.exec(statement);}
   else await pg.exec(sql);
  }
  // PGlite has one connection: route service reads to the active test transaction.
  // This tests atomic SQL behavior, not production pool concurrency.
  const context=new AsyncLocalStorage();
  const db={query:async(sql,values=[])=>{const r=await (context.getStore()??pg).query(sql,values);return {...r,rowCount:r.rows.length||r.affectedRows||0};},transaction:work=>pg.transaction(tx=>context.run(tx,()=>work({query:db.query})))};
  const password=randomUUID();
  const actor=await bootstrapAdminAccount(db,'isolated@example.com',password);
  actor.role='SUPER_ADMIN';
  const jwt=new JwtService({secret:'isolated-test-secret-not-a-production-secret',signOptions:{expiresIn:'15m'}});
  const auth=new AuthService(db,jwt), guard=new JwtAuthGuard(jwt,db);
  const session=await auth.login('isolated@example.com',password,{});
  const request={headers:{authorization:`Bearer ${session.accessToken}`}};
  const guardContext={switchToHttp:()=>({getRequest:()=>request})};
  assert.equal(await guard.canActivate(guardContext),true);
  const rotated=await auth.rotate(session.refreshToken,{});
  await assert.rejects(()=>guard.canActivate(guardContext));
  request.headers.authorization=`Bearer ${rotated.accessToken}`;
  assert.equal(await guard.canActivate(guardContext),true);
  await auth.logout(rotated.refreshToken,rotated.accessToken);
  await assert.rejects(()=>guard.canActivate(guardContext));
  const beforeReset=await auth.login('isolated@example.com',password,{});
  request.headers.authorization=`Bearer ${beforeReset.accessToken}`;
  const resetPassword=randomUUID();
  await bootstrapAdminAccount(db,'isolated@example.com',resetPassword,true);
  await assert.rejects(()=>guard.canActivate(guardContext));
  await assert.rejects(()=>auth.login('isolated@example.com',password,{}));
  const afterReset=await auth.login('isolated@example.com',resetPassword,{});
  await auth.logout(afterReset.refreshToken,afterReset.accessToken);
  const product=(await db.query("INSERT INTO products(sku,slug,name,status) VALUES('TEST','isolated-product','Original tea','ACTIVE') RETURNING id")).rows[0].id;
  const warehouse=(await db.query("INSERT INTO warehouses(code,name) VALUES('ISOLATED','Isolated warehouse') RETURNING id")).rows[0].id;
  await db.query('INSERT INTO inventory(product_id,warehouse_id,physical_quantity) VALUES($1,$2,10)',[product,warehouse]);
  await db.query("INSERT INTO product_prices(product_id,scope,amount) VALUES($1,'GLOBAL',759.99)",[product]);
  const pricing=new PricingService(db), carts=new CartService(db,pricing), checkout=new CheckoutService(db,pricing), payments=new PaymentsService(db,{}), orders=new OrdersService(db);
  async function prepare(){
   const guestKey=randomUUID();const cart=await carts.createGuest(createHash('sha256').update(guestKey).digest('hex'));
   await carts.addItem(cart.id,guestKey,product,2);
   const dto={cartId:cart.id,guestKey,warehouseId:warehouse,recipientName:'Original customer',contactEmail:'customer@example.com',phone:'5555555555',city:'City',district:'District',addressLine:'Original address',reservationMinutes:10};
   const key=randomUUID();const result=await checkout.create(dto,key);
   const replay=await checkout.create(dto,key);assert.equal(replay.checkoutId,result.checkoutId);assert.equal(replay.replayed,true);
   return {...result,guestKey};
  }
  const manual=await prepare();
  const manualOrder=await payments.initializeManual(manual.checkoutId,manual.guestKey,'TRANSFER');
  assert.equal(manualOrder.status,'PENDING');
  assert.equal((await payments.initializeManual(manual.checkoutId,manual.guestKey,'TRANSFER')).replayed,true);
  // Public order cancellation intentionally remains outside the admin-only path.
  await db.query("UPDATE orders SET sales_channel='ADMIN_ORDER' WHERE id=$1",[manualOrder.orderId]);
  await orders.cancel(manualOrder.orderId,actor);
  assert.equal((await orders.cancel(manualOrder.orderId,actor)).replayed,true);
  assert.equal((await db.query('SELECT reserved_quantity FROM inventory')).rows[0].reserved_quantity,0);
  const card=await prepare();
  const reference=randomUUID().replace(/-/g,'');
  const payment=(await db.query("INSERT INTO payments(checkout_id,provider,provider_reference,amount,currency) VALUES($1,'paytr',$2,1519.98,'TRY') RETURNING id",[card.checkoutId,reference])).rows[0].id;
  await db.query('INSERT INTO payment_attempts(payment_id,provider_request_id) VALUES($1,$2)',[payment,reference]);
  await db.query("UPDATE checkout_sessions SET expires_at=now()-interval '1 hour' WHERE id=$1",[card.checkoutId]);
  assert.equal((await db.query('SELECT release_expired_checkout_reservations() AS count')).rows[0].count,0);
  await db.query("UPDATE products SET name='Changed name' WHERE id=$1",[product]);
  await db.query('UPDATE product_prices SET amount=999 WHERE product_id=$1',[product]);
  process.env.PAYTR_MERCHANT_KEY='isolated-key';process.env.PAYTR_MERCHANT_SALT='isolated-salt';
  const payload={merchant_oid:reference,status:'success',total_amount:'151998',test_mode:'1',hash:createHmac('sha256','isolated-key').update(`${reference}isolated-saltsuccess151998`).digest('base64')};
  const completed=await payments.receivePaytrCallback(payload);
  assert.equal(completed.status,'SUCCEEDED');
  assert.equal((await payments.receivePaytrCallback(payload)).replayed,true);
  const detail=await orders.detail(completed.orderId);
  assert.equal(detail.items[0].product_name,'Original tea');assert.equal(detail.items[0].unit_amount,'759.99');
  assert.equal(detail.address.recipient_name,'Original customer');
  assert.equal(detail.payments[0].status,'SUCCEEDED');
  assert.equal((await db.query('SELECT count(*) AS count FROM orders')).rows[0].count,2);
  assert.equal((await db.query('SELECT physical_quantity,reserved_quantity FROM inventory')).rows[0].physical_quantity,10);
  assert.equal((await db.query('SELECT physical_quantity,reserved_quantity FROM inventory')).rows[0].reserved_quantity,2);
  console.log('V1 isolated service flow passed: migrations, real password/JWT login, refresh revocation, logout, cart, checkout replay, transfer, cancellation, reservation release, delayed signed PayTR, replay and immutable snapshots. No external payment or production DB was used.');
 }finally{
  for(const key of envKeys){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}
  await pg.close();
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
