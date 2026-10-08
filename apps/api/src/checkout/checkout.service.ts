import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service';
import { PricingService } from '../pricing/pricing.service';
import { SalesChannel } from '../pricing/dto/create-price.dto';
import { CreateCheckoutDto } from './dto/create-checkout.dto';

interface CartItem { product_id: string; quantity: number; name: string; sku: string; status: string; }
@Injectable()
export class CheckoutService {
  constructor(private readonly db: DatabaseService, private readonly pricing: PricingService) {}
  async fulfillment() {
    const warehouse = await this.db.query<{ id: string; name: string }>('SELECT id,name FROM warehouses WHERE is_active=true ORDER BY created_at ASC LIMIT 1');
    if (!warehouse.rows[0]) throw new NotFoundException('Teslimat için aktif depo bulunamadı');
    return warehouse.rows[0];
  }
  async create(dto: CreateCheckoutDto, idempotencyKey: string) {
    if (!idempotencyKey || idempotencyKey.length > 200) throw new ConflictException('Idempotency-Key header required');
    const requestHash = createHash('sha256').update(JSON.stringify(dto)).digest('hex');
    return this.db.transaction(async (client: PoolClient) => {
      const prior = await client.query<{ request_hash: string; resource_id: string | null }>('SELECT request_hash, resource_id FROM idempotency_records WHERE key=$1 AND expires_at > now() FOR UPDATE', [idempotencyKey]);
      if (prior.rows[0]) { if (prior.rows[0].request_hash !== requestHash) throw new ConflictException('Idempotency key reused with different data'); return { checkoutId: prior.rows[0].resource_id, replayed: true }; }
      const cart = await client.query('SELECT id FROM carts WHERE id=$1 AND session_key_hash=$2 AND expires_at > now() FOR UPDATE', [dto.cartId, createHash('sha256').update(dto.guestKey).digest('hex')]);
      if (!cart.rowCount) throw new NotFoundException('Cart not found');
      const items = (await client.query<CartItem>("SELECT ci.product_id, ci.quantity, p.name, p.sku, p.status FROM cart_items ci JOIN products p ON p.id=ci.product_id WHERE ci.cart_id=$1 ORDER BY ci.product_id FOR SHARE OF p", [dto.cartId])).rows;
      if (!items.length) throw new ConflictException('Cart is empty');
      if (items.some(item => item.status !== 'ACTIVE')) throw new ConflictException('Sepette satışa kapalı ürün var. Sepetinizi güncelleyin.');
      const priced = await Promise.all(items.map(async (item) => ({ ...item, price: await this.pricing.resolve(item.product_id, { channel: SalesChannel.PUBLIC_WEB }) })));
      if (priced.some((item) => !item.price)) throw new ConflictException('An item has no effective price');
      if (priced.some(item => item.price!.currency !== 'TRY')) throw new ConflictException('Mağaza siparişi için ürün fiyatları TL olmalıdır. Yönetim panelindeki mağaza fiyatını kontrol edin.');
      const subtotal = priced.reduce((sum, item) => sum + Number(item.price!.amount) * item.quantity, 0);
      let couponId: string | null = null; let discount = 0;
      if (dto.couponCode) {
        const coupon = await client.query<{id:string;discount_type:'FIXED_TRY'|'PERCENT';discount_value:string;usage_limit:number|null;used_count:number}>("SELECT c.id,c.discount_type,c.discount_value,c.usage_limit,c.used_count FROM coupons c JOIN campaigns p ON p.id=c.campaign_id WHERE upper(c.code)=upper($1) AND p.status='ACTIVE' AND (c.starts_at IS NULL OR c.starts_at<=now()) AND (c.ends_at IS NULL OR c.ends_at>now()) AND (p.starts_at IS NULL OR p.starts_at<=now()) AND (p.ends_at IS NULL OR p.ends_at>now()) FOR UPDATE", [dto.couponCode]);
        const row=coupon.rows[0]; if (!row || (row.usage_limit !== null && row.used_count >= row.usage_limit)) throw new ConflictException('Coupon is not available');
        couponId=row.id; const raw=row.discount_type==='PERCENT' ? subtotal * Number(row.discount_value) / 100 : Number(row.discount_value); discount=Math.min(subtotal,Math.round(raw*100)/100);
      }
      const total = subtotal - discount;
      const warehouse = await client.query('SELECT id FROM warehouses WHERE id=$1 AND is_active=true FOR SHARE', [dto.warehouseId]);
      if (!warehouse.rows[0]) throw new ConflictException('Teslimat için aktif depo bulunamadı');
      for (const item of priced) {
        const inventory = await client.query<{ physical_quantity: number; reserved_quantity: number }>('SELECT physical_quantity, reserved_quantity FROM inventory WHERE product_id=$1 AND warehouse_id=$2 FOR UPDATE', [item.product_id, dto.warehouseId]);
        if (!inventory.rows[0] || inventory.rows[0].physical_quantity - inventory.rows[0].reserved_quantity < item.quantity) throw new ConflictException(`Insufficient stock for ${item.sku}`);
        await client.query('UPDATE inventory SET reserved_quantity=reserved_quantity+$1, updated_at=now() WHERE product_id=$2 AND warehouse_id=$3', [item.quantity, item.product_id, dto.warehouseId]);
      }
      const checkout = await client.query<{ id: string }>("INSERT INTO checkout_sessions (cart_id,total_amount,coupon_id,discount_amount,contact_email,contact_name,expires_at) VALUES ($1,$2,$3,$4,$5,$6,now() + ($7 * interval '1 minute')) RETURNING id", [dto.cartId, total, couponId, discount, dto.contactEmail.trim().toLowerCase(), dto.recipientName.trim(), dto.reservationMinutes]);
      await client.query('INSERT INTO checkout_addresses (checkout_id,recipient_name,phone,city,district,address_line,postal_code) VALUES ($1,$2,$3,$4,$5,$6,$7)', [checkout.rows[0].id, dto.recipientName, dto.phone, dto.city, dto.district, dto.addressLine, dto.postalCode ?? null]);
      for (const item of priced) {
        await client.query('INSERT INTO checkout_items (checkout_id,product_id,product_name,sku,quantity,unit_amount,currency) VALUES ($1,$2,$3,$4,$5,$6,$7)', [checkout.rows[0].id, item.product_id, item.name, item.sku, item.quantity, item.price!.amount, item.price!.currency]);
        const reservation = await client.query<{id:string}>("INSERT INTO stock_reservations (product_id,warehouse_id,quantity,reference_type,reference_id,expires_at) VALUES ($1,$2,$3,'checkout',$4,now() + ($5 * interval '1 minute')) RETURNING id", [item.product_id, dto.warehouseId, item.quantity, checkout.rows[0].id, dto.reservationMinutes]);
        await client.query("INSERT INTO inventory_movements(product_id,warehouse_id,movement_type,quantity_delta,reference_type,reference_id) VALUES ($1,$2,'RESERVATION',0,'stock_reservation',$3)", [item.product_id,dto.warehouseId,reservation.rows[0].id]);
      }
      await client.query('INSERT INTO idempotency_records (key,request_hash,resource_type,resource_id,expires_at) VALUES ($1,$2,$3,$4,now() + interval \'24 hours\')', [idempotencyKey, requestHash, 'checkout', checkout.rows[0].id]);
      return { checkoutId: checkout.rows[0].id, subtotal: subtotal.toFixed(2), discount: discount.toFixed(2), total: total.toFixed(2), currency: 'TRY', replayed: false };
    });
  }
}
