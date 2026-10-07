import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { DatabaseService } from '../database/database.service';
import { RequestUser } from '../auth/auth.types';
import { CreateAdminOrderDto } from './dto/create-admin-order.dto';
import { UpdateAdminOrderPricesDto } from './dto/update-admin-order-prices.dto';

const effectivePrice = `SELECT amount,currency FROM product_prices
  WHERE product_id=$1 AND starts_at<=now() AND (ends_at IS NULL OR ends_at>now())
    AND (scope='GLOBAL' OR (scope='CHANNEL' AND channel='ADMIN_ORDER'))
  ORDER BY CASE WHEN scope='CHANNEL' THEN 0 ELSE 1 END,starts_at DESC,id DESC LIMIT 1`;

@Injectable()
export class AdminOrderService {
  constructor(private readonly db: DatabaseService) {}
  async options() {
    const [products, warehouses, customers] = await Promise.all([
      this.db.query(`SELECT p.id,p.name,p.sku,price.amount,price.currency FROM products p
        LEFT JOIN LATERAL (SELECT amount,currency FROM product_prices pp
          WHERE pp.product_id=p.id AND starts_at<=now() AND (ends_at IS NULL OR ends_at>now())
            AND (scope='GLOBAL' OR (scope='CHANNEL' AND channel='ADMIN_ORDER'))
          ORDER BY CASE WHEN scope='CHANNEL' THEN 0 ELSE 1 END,starts_at DESC,id DESC LIMIT 1) price ON true
        WHERE p.status='ACTIVE' ORDER BY p.name`),
      this.db.query('SELECT id,name FROM warehouses WHERE is_active=true ORDER BY name'),
      this.db.query('SELECT id,email,first_name,last_name,phone FROM customers WHERE is_active=true ORDER BY first_name,last_name'),
    ]);
    return { products: products.rows, warehouses: warehouses.rows, customers: customers.rows };
  }
  async create(dto: CreateAdminOrderDto, key: string, actor: RequestUser) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key ?? '')) {
      throw new BadRequestException('Sipariş işlem anahtarı gerekli');
    }
    if ([dto.recipientName,dto.phone,dto.city,dto.district,dto.addressLine].some(value => !value.trim())) {
      throw new BadRequestException('Teslimat bilgileri boş bırakılamaz');
    }
    const items = [...dto.items].sort((a,b) => a.productId.localeCompare(b.productId));
    const currency = dto.currency ?? 'TRY';
    if (!['TRY','EUR','USD'].includes(currency)) throw new BadRequestException('Geçersiz para birimi');
    if (currency !== 'TRY' && !['TRANSFER','HAND_CASH'].includes(dto.paymentMethod)) throw new BadRequestException('Kapıda ödeme yalnız TL olabilir');
    if (currency !== 'TRY' && items.some(item=>item.unitAmount===undefined)) throw new BadRequestException('Dövizli siparişte her ürünün birim fiyatını elle girin');
    if (new Set(items.map(item => item.productId)).size !== items.length) {
      throw new BadRequestException('Aynı ürün için tek satır kullanın');
    }
    if(items.some(item=>item.unitAmount!==undefined)&&!dto.priceChangeReason?.trim()) throw new BadRequestException('Özel fiyat için değişiklik nedeni gerekli');
    const identity = `admin-order:${actor.id}:${key.toLowerCase()}`;
    const hash = createHash('sha256').update(JSON.stringify(dto)).digest('hex');
    return this.db.transaction(async client => {
      // Serialize retries before checking the unique idempotency record.
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [identity]);
      const prior = await client.query<{ request_hash: string; resource_id: string }>(
        "SELECT request_hash,resource_id FROM idempotency_records WHERE key=$1 AND resource_type='admin_order'", [identity]);
      if (prior.rows[0]) {
        if (prior.rows[0].request_hash !== hash) throw new ConflictException('Bu işlem anahtarı farklı siparişte kullanılmış');
        const order = await client.query('SELECT id,order_number,status,total_amount,currency FROM orders WHERE id=$1', [prior.rows[0].resource_id]);
        return { ...order.rows[0], replayed: true };
      }
      const warehouse = await client.query('SELECT id FROM warehouses WHERE id=$1 AND is_active=true FOR SHARE', [dto.warehouseId]);
      if (!warehouse.rowCount) throw new NotFoundException('Aktif depo bulunamadı');
      if (dto.customerId) {
        const customer = await client.query('SELECT id FROM customers WHERE id=$1 AND is_active=true FOR SHARE', [dto.customerId]);
        if (!customer.rowCount) throw new NotFoundException('Aktif müşteri bulunamadı');
      }
      const priced: { productId: string; quantity: number; name: string; sku: string; amount: string; originalAmount: string }[] = [];
      let totalCents = 0n;
      for (const item of items) {
        const product = await client.query<{ name: string; sku: string }>("SELECT name,sku FROM products WHERE id=$1 AND status='ACTIVE' FOR SHARE", [item.productId]);
        if (!product.rows[0]) throw new NotFoundException('Aktif ürün bulunamadı');
        const price = (await client.query<{ amount: string; currency: string }>(effectivePrice, [item.productId])).rows[0];
        if (!price || price.currency.trim() !== 'TRY') throw new ConflictException(`${product.rows[0].name} için geçerli TL fiyatı gerekli`);
        const amount = item.unitAmount === undefined ? price.amount : item.unitAmount.toFixed(2);
        const [whole, fraction = ''] = amount.split('.');
        totalCents += (BigInt(whole) * 100n + BigInt(fraction.padEnd(2,'0'))) * BigInt(item.quantity);
        if (totalCents > 999999999999n) throw new BadRequestException('Sipariş tutarı kayıt sınırını aşıyor');
        const stock = await client.query('UPDATE inventory SET reserved_quantity=reserved_quantity+$1,updated_at=now() WHERE product_id=$2 AND warehouse_id=$3 AND physical_quantity-reserved_quantity>=$1 RETURNING product_id', [item.quantity,item.productId,dto.warehouseId]);
        if (!stock.rowCount) throw new ConflictException(`${product.rows[0].name} için yeterli stok yok`);
        priced.push({ ...item, ...product.rows[0], amount, originalAmount:price.amount });
      }
      if (totalCents <= 0n) throw new BadRequestException('Sipariş toplamı sıfırdan büyük olmalı');
      const total = `${totalCents / 100n}.${(totalCents % 100n).toString().padStart(2,'0')}`;
      // COD may be prepared before collection, but its payment stays PENDING.
      const isCod = dto.paymentMethod === 'COD_CARD' || dto.paymentMethod === 'COD_CASH';
      const orderStatus = isCod ? 'PROCESSING' : 'PENDING_PAYMENT';
      const cart = await client.query<{ id: string }>("INSERT INTO carts(customer_id,session_key_hash,currency,expires_at) VALUES ($1,$2,$3,now()+interval '30 days') RETURNING id", [dto.customerId ?? null,createHash('sha256').update(randomBytes(48)).digest('hex'),currency]);
      const checkout = await client.query<{ id: string }>("INSERT INTO checkout_sessions(cart_id,status,total_amount,contact_email,contact_name,currency,expires_at,completed_at) VALUES ($1,'COMPLETED',$2,$3,$4,$5,now()+interval '30 days',now()) RETURNING id", [cart.rows[0].id,total,dto.contactEmail.trim().toLowerCase(),dto.recipientName.trim(),currency]);
      const checkoutId = checkout.rows[0].id;
      const sequence = await client.query<{ value: string }>("SELECT to_char(now(),'YYYYMMDD') || '-' || lpad(nextval('order_number_seq')::text,6,'0') AS value");
      const order = await client.query<{ id: string; order_number: string; status: string; total_amount: string; currency: string }>("INSERT INTO orders(order_number,checkout_id,customer_id,status,total_amount,currency,sales_channel) VALUES ($1,$2,$3,$5,$4,$6,'ADMIN_ORDER') RETURNING id,order_number,status,total_amount,currency", [sequence.rows[0].value,checkoutId,dto.customerId ?? null,total,orderStatus,currency]);
      const orderId = order.rows[0].id;
      const address = [dto.recipientName.trim(),dto.phone.trim(),dto.city.trim(),dto.district.trim(),dto.addressLine.trim(),dto.postalCode?.trim() || null];
      await client.query('INSERT INTO checkout_addresses(checkout_id,recipient_name,phone,city,district,address_line,postal_code) VALUES ($1,$2,$3,$4,$5,$6,$7)', [checkoutId,...address]);
      await client.query('INSERT INTO order_addresses(order_id,recipient_name,phone,city,district,address_line,postal_code) VALUES ($1,$2,$3,$4,$5,$6,$7)', [orderId,...address]);
      for (const item of priced) {
        const values = [item.productId,item.name,item.sku,item.quantity,item.amount];
        await client.query("INSERT INTO checkout_items(checkout_id,product_id,product_name,sku,quantity,unit_amount,currency) VALUES ($1,$2,$3,$4,$5,$6,$7)", [checkoutId,...values,currency]);
        await client.query("INSERT INTO order_items(order_id,product_id,product_name,sku,quantity,unit_amount,currency) VALUES ($1,$2,$3,$4,$5,$6,$7)", [orderId,...values,currency]);
        await client.query("INSERT INTO stock_reservations(product_id,warehouse_id,quantity,reference_type,reference_id,expires_at) VALUES ($1,$2,$3,'checkout',$4,now()+interval '30 days')", [item.productId,dto.warehouseId,item.quantity,checkoutId]);
        await client.query("INSERT INTO inventory_movements(product_id,warehouse_id,movement_type,quantity_delta,reference_type,reference_id,created_by) VALUES ($1,$2,'RESERVATION',0,'order',$3,$4)", [item.productId,dto.warehouseId,orderId,actor.id]);
      }
      if (isCod) {
        const pick = await client.query<{ id:string }>("INSERT INTO picking_sessions(order_id,warehouse_id,status) VALUES ($1,$2,'OPEN') RETURNING id", [orderId,dto.warehouseId]);
        await client.query('INSERT INTO picking_items(picking_session_id,order_item_id,expected_quantity) SELECT $1,id,quantity FROM order_items WHERE order_id=$2', [pick.rows[0].id,orderId]);
      }
      const provider = dto.paymentMethod === 'TRANSFER' ? 'bank_transfer' : dto.paymentMethod === 'HAND_CASH' ? 'cash' : dto.paymentMethod === 'COD_CARD' ? 'cash_on_delivery_card' : 'cash_on_delivery_cash';
      const reference = `${provider}_${randomUUID()}`;
      const payment = await client.query<{ id: string }>("INSERT INTO payments(checkout_id,provider,provider_reference,amount,currency) VALUES ($1,$2,$3,$4,$5) RETURNING id", [checkoutId,provider,reference,total,currency]);
      await client.query('INSERT INTO payment_attempts(payment_id,provider_request_id) VALUES ($1,$2)', [payment.rows[0].id,reference]);
      await client.query('INSERT INTO order_status_history(order_id,status,actor_user_id) VALUES ($1,$3,$2)', [orderId,actor.id,orderStatus]);
      await client.query('INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata) VALUES ($1,$2,$3,$4,$5)', [actor.id,'order.admin.created','order',orderId,JSON.stringify({ currency,originalCurrency:'TRY',paymentMethod: dto.paymentMethod, warehouseId: dto.warehouseId, total,priceChangeReason:dto.priceChangeReason?.trim(),prices:priced.map(item=>({productId:item.productId,originalAmount:item.originalAmount,unitAmount:item.amount})) })]);
      await client.query("INSERT INTO idempotency_records(key,request_hash,resource_type,resource_id,expires_at) VALUES ($1,$2,'admin_order',$3,now()+interval '30 days')", [identity,hash,orderId]);
      return { ...order.rows[0], replayed: false };
    });
  }
  async updatePrices(id:string,dto:UpdateAdminOrderPricesDto,actor:RequestUser) {
    if(!dto.reason.trim()) throw new BadRequestException('Fiyat değişiklik nedeni gerekli');
    if(new Set(dto.items.map(item=>item.itemId)).size!==dto.items.length) throw new BadRequestException('Tekrarlanan sipariş satırı');
    return this.db.transaction(async client=>{
      const order=(await client.query<{checkout_id:string;status:string;sales_channel:string;total_amount:string}>(
        'SELECT checkout_id,status,sales_channel,total_amount FROM orders WHERE id=$1 FOR UPDATE',[id])).rows[0];
      if(!order) throw new NotFoundException('Sipariş bulunamadı');
      if(order.sales_channel!=='ADMIN_ORDER'||!['PENDING_PAYMENT','PROCESSING'].includes(order.status)) throw new ConflictException('Yalnız gönderilmemiş yönetici siparişinin fiyatı değiştirilebilir');
      const payment=(await client.query<{id:string;status:string;provider:string}>(
        'SELECT id,status,provider FROM payments WHERE checkout_id=$1 FOR UPDATE',[order.checkout_id])).rows[0];
      if(!payment||payment.status!=='PENDING'||!['bank_transfer','cash','cash_on_delivery_card','cash_on_delivery_cash'].includes(payment.provider)) throw new ConflictException('Tahsil edilmiş siparişin fiyatı değiştirilemez');
      const collection=await client.query('SELECT id FROM finance_transactions WHERE order_id=$1 AND approved_at IS NOT NULL LIMIT 1',[id]);
      if(collection.rowCount) throw new ConflictException('Kısmi tahsilat yapılmış siparişin fiyatı değiştirilemez');
      const packed=await client.query('SELECT pk.id FROM packing_sessions pk JOIN picking_sessions ps ON ps.id=pk.picking_session_id WHERE ps.order_id=$1 AND pk.packed_at IS NOT NULL LIMIT 1',[id]);
      if(packed.rowCount) throw new ConflictException('Paketlenmiş siparişin fiyatı değiştirilemez');
      const lines=(await client.query<{id:string;product_id:string;quantity:number;unit_amount:string}>('SELECT id,product_id,quantity,unit_amount FROM order_items WHERE order_id=$1 FOR UPDATE',[id])).rows;
      if(lines.length!==dto.items.length||lines.some(line=>!dto.items.some(item=>item.itemId===line.id))) throw new BadRequestException('Siparişin bütün ürün satırları gerekli');
      const changes=lines.map(line=>({...line,newAmount:dto.items.find(item=>item.itemId===line.id)!.unitAmount.toFixed(2)}));
      const cents=changes.reduce((sum,line)=>sum+BigInt(line.newAmount.replace('.',''))*BigInt(line.quantity),0n);
      if(cents<=0n||cents>999999999999n) throw new BadRequestException('Geçersiz sipariş toplamı');
      const total=`${cents/100n}.${(cents%100n).toString().padStart(2,'0')}`;
      for(const line of changes) {
        await client.query('UPDATE order_items SET unit_amount=$1 WHERE id=$2',[line.newAmount,line.id]);
        await client.query('UPDATE checkout_items SET unit_amount=$1 WHERE checkout_id=$2 AND product_id=$3',[line.newAmount,order.checkout_id,line.product_id]);
      }
      await client.query('UPDATE orders SET total_amount=$1 WHERE id=$2',[total,id]);
      await client.query('UPDATE checkout_sessions SET total_amount=$1 WHERE id=$2',[total,order.checkout_id]);
      await client.query('UPDATE payments SET amount=$1 WHERE id=$2',[total,payment.id]);
      await client.query('INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata) VALUES ($1,$2,$3,$4,$5)',[actor.id,'order.admin.prices.updated','order',id,JSON.stringify({reason:dto.reason.trim(),previousTotal:order.total_amount,total,items:changes.map(line=>({itemId:line.id,previous:line.unit_amount,current:line.newAmount}))})]);
      return {id,total_amount:total};
    });
  }
}
