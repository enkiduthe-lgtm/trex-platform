import { Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { DatabaseService } from '../database/database.service';
import { PricingService } from '../pricing/pricing.service';
import { SalesChannel } from '../pricing/dto/create-price.dto';

interface CartItemRow { product_id: string; quantity: number; slug: string; name: string; }
@Injectable()
export class CartService {
  constructor(private readonly db: DatabaseService, private readonly pricing: PricingService) {}
  async createGuest(sessionHash: string) { return (await this.db.query<{ id: string }>("INSERT INTO carts (session_key_hash, expires_at) VALUES ($1, now() + interval '14 days') RETURNING id", [sessionHash])).rows[0]; }
  async addItem(cartId: string, guestKey: string, productId: string, quantity: number) {
    await this.assertOwnership(cartId, guestKey);
    const product = await this.db.query("SELECT 1 FROM products WHERE id=$1 AND status='ACTIVE'", [productId]); if (!product.rowCount) throw new NotFoundException('Active product not found');
    const updated = await this.db.query('INSERT INTO cart_items (cart_id, product_id, quantity) VALUES ($1,$2,$3) ON CONFLICT (cart_id, product_id) DO UPDATE SET quantity=cart_items.quantity+EXCLUDED.quantity, updated_at=now() RETURNING id', [cartId, productId, quantity]);
    if (!updated.rowCount) throw new NotFoundException('Cart not found'); return updated.rows[0];
  }
  async view(cartId: string, guestKey: string) {
    await this.assertOwnership(cartId, guestKey);
    const items = (await this.db.query<CartItemRow>("SELECT ci.product_id, ci.quantity, p.slug, p.name FROM cart_items ci JOIN products p ON p.id=ci.product_id WHERE ci.cart_id=$1 AND p.status='ACTIVE'", [cartId])).rows;
    const resolved = await Promise.all(items.map(async (item) => ({ ...item, price: await this.pricing.resolve(item.product_id, { channel: SalesChannel.PUBLIC_WEB }) })));
    const total = resolved.reduce((sum, item) => sum + (item.price ? Number(item.price.amount) * item.quantity : 0), 0);
    return { id: cartId, items: resolved, total: total.toFixed(2), currency: 'TRY' };
  }
  private async assertOwnership(cartId:string, guestKey:string) { const cart = await this.db.query('SELECT id FROM carts WHERE id=$1 AND session_key_hash=$2 AND expires_at>now()', [cartId, createHash('sha256').update(guestKey).digest('hex')]); if (!cart.rowCount) throw new NotFoundException('Cart not found'); }
}
