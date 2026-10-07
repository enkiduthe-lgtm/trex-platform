const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const ts = require('typescript');
require('reflect-metadata');
// Load the actual service, without a build or a production connection.
require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename,'utf8');
  module._compile(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,experimentalDecorators:true,emitDecoratorMetadata:true}}).outputText,filename);
};
const { AdminOrderService } = require('../src/orders/admin-order.service.ts');
const { OrdersService } = require('../src/orders/orders.service.ts');
async function main() {
  const db = new PGlite();
  try {
    await db.exec(`CREATE DOMAIN citext AS text;
      CREATE TABLE users(id uuid PRIMARY KEY);
      CREATE TABLE products(id uuid PRIMARY KEY,name text,sku text,status text);
      CREATE TABLE audit_logs(actor_user_id uuid REFERENCES users(id),action text,entity_type text,entity_id text,metadata jsonb);`);
    for(const migration of ['004_pricing.sql','005_inventory.sql','006_customers_carts.sql','007_checkout_orders.sql','008_payments.sql','028_sales_channel_orders.sql','031_checkout_contact.sql']) {
      const source = fs.readFileSync(path.join(__dirname,'../migrations',migration),'utf8');
      // Enum additions must commit before statements use their new values.
      if(migration==='028_sales_channel_orders.sql') {
        for(const statement of source.split(';').filter(value=>value.trim())) await db.exec(statement);
      } else await db.exec(source);
    }
    const client = { query: async (sql,values=[]) => {
      const result = await db.query(sql,values);
      return {...result,rowCount:result.rows.length || result.affectedRows || 0};
    } };
    await db.exec(`CREATE TABLE picking_sessions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_id uuid REFERENCES orders(id),warehouse_id uuid REFERENCES warehouses(id),status text);
      CREATE TABLE picking_items(picking_session_id uuid REFERENCES picking_sessions(id),order_item_id uuid REFERENCES order_items(id),expected_quantity int);
      CREATE TABLE packing_sessions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),picking_session_id uuid REFERENCES picking_sessions(id),packed_at timestamptz);
      CREATE TABLE finance_transactions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_id uuid REFERENCES orders(id),approved_at timestamptz);`);
    const adapter = { query:client.query,transaction:async work => { await db.exec('BEGIN');try{const result=await work(client);await db.exec('COMMIT');return result;}catch(error){await db.exec('ROLLBACK');throw error;} } };
    const service = new AdminOrderService(adapter);
    const actor = { id:randomUUID(),role:'ADMIN' };
    const productId = randomUUID(), otherProduct = randomUUID();
    await db.query('INSERT INTO users VALUES($1)',[actor.id]);
    await db.query("INSERT INTO products VALUES($1,'Tea','TEA','ACTIVE'),($2,'Other','OTHER','ACTIVE')",[productId,otherProduct]);
    const warehouseId = (await db.query("INSERT INTO warehouses(code,name) VALUES('MAIN','Main') RETURNING id")).rows[0].id;
    await db.query('INSERT INTO inventory(product_id,warehouse_id,physical_quantity) VALUES($1,$3,10),($2,$3,0)',[productId,otherProduct,warehouseId]);
    await db.query("INSERT INTO product_prices(product_id,scope,amount) VALUES($1,'GLOBAL',759.99),($2,'GLOBAL',5)",[productId,otherProduct]);
    const dto = { warehouseId,recipientName:'Test Recipient',contactEmail:'test@example.com',phone:'05000000000',city:'Test',district:'Test',addressLine:'Test address',paymentMethod:'TRANSFER',items:[{productId,quantity:2}] };
    const key = randomUUID();
    const result = await service.create(dto,key,actor);
    assert.equal(result.total_amount,'1519.98');
    assert.equal(result.status,'PENDING_PAYMENT');
    assert.equal((await db.query('SELECT sales_channel FROM orders')).rows[0].sales_channel,'ADMIN_ORDER');
    assert.equal((await db.query('SELECT reserved_quantity FROM inventory WHERE product_id=$1',[productId])).rows[0].reserved_quantity,2);
    assert.equal((await db.query('SELECT status FROM payments')).rows[0].status,'PENDING');
    assert.equal((await db.query('SELECT unit_amount FROM order_items')).rows[0].unit_amount,'759.99');
    assert.equal((await db.query('SELECT phone FROM order_addresses')).rows[0].phone,dto.phone);
    assert.equal((await service.create(dto,key,actor)).id,result.id);
    assert.equal((await db.query('SELECT count(*) AS n FROM orders')).rows[0].n,1);
    await assert.rejects(()=>service.create({...dto,phone:'different'},key,actor),/farklı siparişte/);
    await assert.rejects(()=>service.create({...dto,items:[{productId,quantity:1},{productId:otherProduct,quantity:1}]},randomUUID(),actor),/yeterli stok/);
    assert.equal((await db.query('SELECT reserved_quantity FROM inventory WHERE product_id=$1',[productId])).rows[0].reserved_quantity,2);
    assert.equal((await db.query('SELECT count(*) AS n FROM orders')).rows[0].n,1);
    await db.query("INSERT INTO product_prices(product_id,scope,channel,amount) VALUES($1,'CHANNEL','ADMIN_ORDER',100)",[productId]);
    const cardOrder = await service.create({...dto,paymentMethod:'COD_CARD',items:[{productId,quantity:1}]},randomUUID(),actor);
    assert.equal(cardOrder.total_amount,'100.00');
    assert.equal(cardOrder.status,'PROCESSING');
    assert.equal((await db.query("SELECT count(*) AS n FROM payments WHERE provider='cash_on_delivery_card' AND status='PENDING'")).rows[0].n,1);
    await service.create({...dto,paymentMethod:'COD_CASH',items:[{productId,quantity:1}]},randomUUID(),actor);
    assert.equal((await db.query("SELECT count(*) AS n FROM payments WHERE provider='cash_on_delivery_cash' AND status='PENDING'")).rows[0].n,1);
    assert.equal((await db.query('SELECT count(*) AS n FROM picking_sessions')).rows[0].n,2);
    assert.equal((await db.query('SELECT count(*) AS n FROM picking_items')).rows[0].n,2);
    assert.equal((await db.query('SELECT unit_amount FROM order_items WHERE order_id=$1',[result.id])).rows[0].unit_amount,'759.99');
    const line=(await db.query('SELECT id FROM order_items WHERE order_id=$1',[result.id])).rows[0];
    await service.updatePrices(result.id,{reason:'Manager discount',items:[{itemId:line.id,unitAmount:500}]},actor);
    assert.equal((await db.query('SELECT total_amount FROM orders WHERE id=$1',[result.id])).rows[0].total_amount,'1000.00');
    assert.equal((await db.query('SELECT p.amount FROM payments p JOIN orders o ON o.checkout_id=p.checkout_id WHERE o.id=$1',[result.id])).rows[0].amount,'1000.00');
    assert.equal((await db.query('SELECT reserved_quantity FROM inventory WHERE product_id=$1',[productId])).rows[0].reserved_quantity,4);
    await db.query('INSERT INTO finance_transactions(order_id,approved_at) VALUES($1,now())',[result.id]);
    await assert.rejects(()=>service.updatePrices(result.id,{reason:'Second discount',items:[{itemId:line.id,unitAmount:400}]},actor),/Kısmi tahsilat/);
    const cardLine=(await db.query('SELECT id FROM order_items WHERE order_id=$1',[cardOrder.id])).rows[0];
    await db.query('INSERT INTO packing_sessions(picking_session_id,packed_at) SELECT id,now() FROM picking_sessions WHERE order_id=$1',[cardOrder.id]);
    await assert.rejects(()=>service.updatePrices(cardOrder.id,{reason:'Too late',items:[{itemId:cardLine.id,unitAmount:90}]},actor),/Paketlenmiş/);
    const override=await service.create({...dto,priceChangeReason:'Special customer offer',items:[{productId,quantity:1,unitAmount:80.50}]},randomUUID(),actor);
    assert.equal(override.total_amount,'80.50');
    const orders = new OrdersService(adapter);
    const editDto=detail=>({version:detail.edit_version,reason:'Test correction',recipientName:detail.address.recipient_name,contactEmail:detail.contact_email,phone:detail.address.phone,city:detail.address.city,district:detail.address.district,addressLine:detail.address.address_line,postalCode:detail.address.postal_code??'',items:detail.items.map(item=>({itemId:item.id,quantity:item.quantity,unitAmount:Number(item.unit_amount)}))});
    const initial=await orders.detail(override.id);
    const draft=editDto(initial);
    const editStock=(await db.query('SELECT reserved_quantity FROM inventory WHERE product_id=$1',[productId])).rows[0].reserved_quantity;
    await assert.rejects(()=>service.update(override.id,draft,{...actor,role:'FINANCE'}),/yönetici/);
    const updated=await service.update(override.id,{...draft,recipientName:'Corrected Name',items:[{...draft.items[0],quantity:2,unitAmount:25}]},actor);
    assert.equal(updated.total_amount,'50.00');
    assert.equal((await db.query('SELECT reserved_quantity FROM inventory WHERE product_id=$1',[productId])).rows[0].reserved_quantity,editStock+1);
    assert.equal((await orders.detail(override.id)).address.recipient_name,'Corrected Name');
    assert.equal((await orders.list()).find(order=>order.id===override.id).customer_name,'Corrected Name');
    await assert.rejects(()=>service.update(override.id,draft,actor),/ekranı yenileyin/);
    const excessive=editDto(await orders.detail(override.id));
    await assert.rejects(()=>service.update(override.id,{...excessive,recipientName:'Must roll back',items:[{...excessive.items[0],quantity:100}]},actor),/yeterli/);
    assert.equal((await orders.detail(override.id)).address.recipient_name,'Corrected Name');
    assert.equal((await orders.detail(override.id)).total_amount,'50.00');
    await service.update(override.id,{...excessive,items:[{...excessive.items[0],quantity:1}]},actor);
    assert.equal((await db.query('SELECT reserved_quantity FROM inventory WHERE product_id=$1',[productId])).rows[0].reserved_quantity,editStock);
    const partial=editDto(await orders.detail(result.id));
    await service.update(result.id,{...partial,recipientName:'Paid Customer Correction'},actor);
    assert.equal((await orders.detail(result.id)).total_amount,'1000.00');
    await assert.rejects(async()=>service.update(result.id,{...editDto(await orders.detail(result.id)),items:[{...partial.items[0],unitAmount:400}]},actor),/yalnız müşteri/);
    const packedEdit=editDto(await orders.detail(cardOrder.id));
    await service.update(cardOrder.id,{...packedEdit,addressLine:'Corrected packed address'},actor);
    await assert.rejects(async()=>service.update(cardOrder.id,{...editDto(await orders.detail(cardOrder.id)),items:[{...packedEdit.items[0],quantity:2}]},actor),/yalnız müşteri/);
    assert.equal((await orders.list()).find(order=>order.id===result.id).customer_name,'Paid Customer Correction');
    await assert.rejects(()=>service.create({...dto,currency:'EUR'},randomUUID(),actor),/elle girin/);
    await assert.rejects(()=>service.create({...dto,currency:'USD',paymentMethod:'COD_CARD'},randomUUID(),actor),/yalnız TL/);
    for(const [paymentMethod,currency] of [['HAND_CASH','TRY'],['HAND_CASH','EUR'],['TRANSFER','USD'],['TRANSFER','EUR'],['HAND_CASH','USD']]) {
      const foreign = await service.create({...dto,paymentMethod,currency,priceChangeReason:'Manual agreed amount',items:[{productId,quantity:1,unitAmount:20.25}]},randomUUID(),actor);
      assert.equal(foreign.currency,currency);assert.equal(foreign.total_amount,'20.25');assert.equal(foreign.status,'PENDING_PAYMENT');
      const detail=await orders.detail(foreign.id);
      assert.equal(detail.items[0].currency,currency);assert.equal(detail.payments[0].currency,currency);
      assert.equal(detail.payments[0].status,'PENDING');
      if(currency!=='TRY') {
        const edit=editDto(detail);
        await service.update(foreign.id,{...edit,items:[{...edit.items[0],unitAmount:19.95}]},actor);
        const edited=await orders.detail(foreign.id);
        assert.equal(edited.currency,currency);assert.equal(edited.payments[0].currency,currency);assert.equal(edited.payments[0].amount,'19.95');
      }
      assert.equal((await db.query('SELECT currency FROM checkout_sessions WHERE id=(SELECT checkout_id FROM orders WHERE id=$1)',[foreign.id])).rows[0].currency,currency);
      assert.equal((await db.query('SELECT currency FROM carts WHERE id=(SELECT cart_id FROM checkout_sessions WHERE id=(SELECT checkout_id FROM orders WHERE id=$1))',[foreign.id])).rows[0].currency,currency);
      const before=(await db.query('SELECT reserved_quantity FROM inventory WHERE product_id=$1',[productId])).rows[0].reserved_quantity;
      await assert.rejects(()=>orders.cancel(foreign.id,{...actor,role:'FINANCE'}),/yönetici/);
      const cancelled=await orders.cancel(foreign.id,actor);assert.equal(cancelled.releasedQuantity,1);
      assert.equal((await orders.cancel(foreign.id,actor)).replayed,true);
      assert.equal((await db.query('SELECT reserved_quantity FROM inventory WHERE product_id=$1',[productId])).rows[0].reserved_quantity,before-1);
      assert.equal((await orders.detail(foreign.id)).payments[0].status,'FAILED');
      await assert.rejects(async()=>service.update(foreign.id,editDto(await orders.detail(foreign.id)),actor),/İptal edilmemiş/);
    }
    await assert.rejects(()=>orders.cancel(result.id,actor),/Kısmi tahsilat/);
    await assert.rejects(()=>orders.cancel(cardOrder.id,actor),/Paketlenmiş/);
    const before=(await db.query('SELECT reserved_quantity FROM inventory WHERE product_id=$1',[productId])).rows[0].reserved_quantity;
    await db.query('UPDATE inventory SET reserved_quantity=0 WHERE product_id=$1',[productId]);
    await assert.rejects(()=>orders.cancel(override.id,actor),/stok doğrulanamadı/);
    assert.equal((await orders.detail(override.id)).status,'PENDING_PAYMENT');
    await db.query('UPDATE inventory SET reserved_quantity=$2 WHERE product_id=$1',[productId,before]);
    await db.query("UPDATE payments SET status='SUCCEEDED' WHERE checkout_id=(SELECT checkout_id FROM orders WHERE id=$1)",[override.id]);
    // A contact-only correction must preserve any existing total adjustments.
    await db.query('UPDATE orders SET total_amount=30 WHERE id=$1',[override.id]);
    await db.query('UPDATE checkout_sessions SET total_amount=30 WHERE id=(SELECT checkout_id FROM orders WHERE id=$1)',[override.id]);
    await db.query('UPDATE payments SET amount=30 WHERE checkout_id=(SELECT checkout_id FROM orders WHERE id=$1)',[override.id]);
    await service.update(override.id,{...editDto(await orders.detail(override.id)),recipientName:'Collected Customer Correction'},actor);
    assert.equal((await orders.detail(override.id)).total_amount,'30.00');
    assert.equal((await orders.detail(override.id)).payments[0].amount,'30.00');
    assert.equal((await db.query('SELECT total_amount FROM checkout_sessions WHERE id=(SELECT checkout_id FROM orders WHERE id=$1)',[override.id])).rows[0].total_amount,'30.00');
    assert.equal((await orders.detail(override.id)).payments[0].status,'SUCCEEDED');
    await assert.rejects(async()=>service.update(override.id,{...editDto(await orders.detail(override.id)),items:[{itemId:draft.items[0].itemId,quantity:2,unitAmount:25}]},actor),/yalnız müşteri/);
    await assert.rejects(()=>orders.cancel(override.id,actor),/Tahsil edilmiş/);
    await db.query("UPDATE products SET status='DRAFT' WHERE id=$1",[productId]);
    await assert.rejects(()=>service.create(dto,randomUUID(),actor),/Aktif ürün/);
    await db.query('UPDATE warehouses SET is_active=false WHERE id=$1',[warehouseId]);
    await assert.rejects(()=>service.create(dto,randomUUID(),actor),/Aktif depo/);
    assert.equal((await db.query("SELECT count(*) AS n FROM audit_logs WHERE action='order.admin.created'")).rows[0].n,9);
    const audit=(await db.query("SELECT metadata FROM audit_logs WHERE action='order.admin.prices.updated'")).rows[0].metadata;
    assert.equal(audit.previousTotal,'1519.98');assert.equal(audit.total,'1000.00');
    console.log('Admin order SQL checks passed: totals, snapshots, retry safety, currency preservation, stock edits/rollback, stale edit protection, customer corrections after collection, cancellation safety.');
  } finally { await db.close(); }
}
main().catch(error=>{console.error(error);process.exitCode=1});
