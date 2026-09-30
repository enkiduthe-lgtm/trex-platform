import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PoolClient } from 'pg';
import { createHash } from 'crypto';
import { DatabaseService } from '../database/database.service';
import { MockPaymentProvider } from './mock-payment.provider';

@Injectable()
export class PaymentsService {
  constructor(private readonly db: DatabaseService, private readonly provider: MockPaymentProvider) {}
  async initialize(checkoutId: string, guestKey: string) {
    const checkout = await this.db.query<{ id: string; total_amount: string; currency: string }>("SELECT s.id,s.total_amount,s.currency FROM checkout_sessions s JOIN carts c ON c.id=s.cart_id WHERE s.id=$1 AND s.status='OPEN' AND s.expires_at>now() AND c.session_key_hash=$2", [checkoutId,createHash('sha256').update(guestKey).digest('hex')]);
    if (!checkout.rows[0]) throw new NotFoundException('Open checkout not found');
    const existing = await this.db.query<{ id: string; provider_reference: string; status: string }>('SELECT id,provider_reference,status FROM payments WHERE checkout_id=$1', [checkoutId]);
    if (existing.rows[0]) return { paymentId: existing.rows[0].id, providerReference: existing.rows[0].provider_reference, status: existing.rows[0].status };
    const external = await this.provider.initialize({ amount: checkout.rows[0].total_amount, currency: checkout.rows[0].currency, reference: checkoutId });
    const payment = await this.db.query<{ id: string }>('INSERT INTO payments (checkout_id,provider,provider_reference,amount,currency) VALUES ($1,$2,$3,$4,$5) RETURNING id', [checkoutId, 'mock', external.providerReference, checkout.rows[0].total_amount, checkout.rows[0].currency]);
    await this.db.query('INSERT INTO payment_attempts (payment_id,provider_request_id) VALUES ($1,$2)', [payment.rows[0].id, external.providerReference]);
    return { paymentId: payment.rows[0].id, providerReference: external.providerReference, status: 'PENDING' };
  }
  async verify(paymentId: string) {
    return this.db.transaction(async (client: PoolClient) => {
      const payment = await client.query<{ id: string; checkout_id: string; provider_reference: string; status: string }>('SELECT id,checkout_id,provider_reference,status FROM payments WHERE id=$1 FOR UPDATE', [paymentId]);
      if (!payment.rows[0]) throw new NotFoundException('Payment not found');
      if (payment.rows[0].status === 'SUCCEEDED') return { status: 'SUCCEEDED', replayed: true };
      const result = await this.provider.verify(payment.rows[0].provider_reference);
      if (result !== 'SUCCEEDED') { await client.query('UPDATE payments SET status=$1 WHERE id=$2', [result, paymentId]); throw new ConflictException('Payment is not successful'); }
      const checkout = await client.query<{ total_amount: string; currency: string; cart_id: string; coupon_id:string|null; discount_amount:string }>("SELECT total_amount,currency,cart_id,coupon_id,discount_amount FROM checkout_sessions WHERE id=$1 AND status='OPEN' AND expires_at > now() FOR UPDATE", [payment.rows[0].checkout_id]);
      if (!checkout.rows[0]) throw new ConflictException('Checkout is no longer payable');
      const sequence = await client.query<{ value: string }>("SELECT to_char(now(),'YYYYMMDD') || '-' || lpad(nextval('order_number_seq')::text,6,'0') AS value");
      const order = await client.query<{ id: string; order_number: string }>('INSERT INTO orders (order_number,checkout_id,total_amount,currency,status) VALUES ($1,$2,$3,$4,$5) RETURNING id,order_number', [sequence.rows[0].value, payment.rows[0].checkout_id, checkout.rows[0].total_amount, checkout.rows[0].currency, 'PAID']);
      if (checkout.rows[0].coupon_id) {
        const coupon = await client.query<{usage_limit:number|null;used_count:number}>('SELECT usage_limit,used_count FROM coupons WHERE id=$1 FOR UPDATE', [checkout.rows[0].coupon_id]);
        if (!coupon.rows[0] || (coupon.rows[0].usage_limit !== null && coupon.rows[0].used_count >= coupon.rows[0].usage_limit)) throw new ConflictException('Coupon is no longer available');
        await client.query('INSERT INTO coupon_redemptions (coupon_id,order_id,discount_amount) VALUES ($1,$2,$3)', [checkout.rows[0].coupon_id, order.rows[0].id, checkout.rows[0].discount_amount]);
        await client.query('UPDATE coupons SET used_count=used_count+1 WHERE id=$1', [checkout.rows[0].coupon_id]);
      }
      const items = await client.query<{ product_id: string; product_name: string; sku: string; quantity: number; unit_amount: string; currency: string }>('SELECT product_id,product_name,sku,quantity,unit_amount,currency FROM checkout_items WHERE checkout_id=$1', [payment.rows[0].checkout_id]);
      for (const item of items.rows) await client.query('INSERT INTO order_items (order_id,product_id,product_name,sku,quantity,unit_amount,currency) VALUES ($1,$2,$3,$4,$5,$6,$7)', [order.rows[0].id, item.product_id, item.product_name, item.sku, item.quantity, item.unit_amount, item.currency]);
      const address = await client.query<{ recipient_name: string; phone: string; city: string; district: string; address_line: string; postal_code: string | null }>('SELECT recipient_name,phone,city,district,address_line,postal_code FROM checkout_addresses WHERE checkout_id=$1', [payment.rows[0].checkout_id]);
      if (!address.rows[0]) throw new ConflictException('Checkout address is missing');
      await client.query('INSERT INTO order_addresses (order_id,recipient_name,phone,city,district,address_line,postal_code) VALUES ($1,$2,$3,$4,$5,$6,$7)', [order.rows[0].id, address.rows[0].recipient_name, address.rows[0].phone, address.rows[0].city, address.rows[0].district, address.rows[0].address_line, address.rows[0].postal_code]);
      await client.query("UPDATE payments SET status='SUCCEEDED',verified_at=now() WHERE id=$1", [paymentId]); await client.query("UPDATE payment_attempts SET status='SUCCEEDED' WHERE payment_id=$1", [paymentId]); await client.query("UPDATE checkout_sessions SET status='COMPLETED',completed_at=now() WHERE id=$1", [payment.rows[0].checkout_id]); await client.query('INSERT INTO order_status_history (order_id,status) VALUES ($1,$2)', [order.rows[0].id, 'PAID']);
      return { status: 'SUCCEEDED', orderId: order.rows[0].id, orderNumber: order.rows[0].order_number, replayed: false };
    });
  }
}
