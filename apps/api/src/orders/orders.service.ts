import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { RequestUser } from '../auth/auth.types';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
@Injectable()
export class OrdersService { constructor(private readonly db: DatabaseService) {} async list(channel?:string) { const normalized=channel?.trim().toUpperCase(); const allowed=['PUBLIC_WEB','ADMIN_ORDER','DEALER_PORTAL','WHOLESALE','MARKETPLACE']; if(normalized&&!allowed.includes(normalized)) throw new BadRequestException('Geçersiz satış kanalı'); return (await this.db.query(`SELECT o.id,o.order_number,o.status,o.total_amount,o.currency,o.created_at,o.sales_channel,o.marketplace_name,o.commission_amount,o.shipping_cost_amount,COALESCE(c.email,cs.contact_email) AS customer_email,COALESCE(SUM(oi.quantity),0) AS item_count FROM orders o LEFT JOIN customers c ON c.id=o.customer_id LEFT JOIN checkout_sessions cs ON cs.id=o.checkout_id LEFT JOIN order_items oi ON oi.order_id=o.id WHERE ($1::sales_channel_code IS NULL OR o.sales_channel=$1::sales_channel_code) GROUP BY o.id,c.email,cs.contact_email ORDER BY o.created_at DESC LIMIT 100`,[normalized ?? null])).rows; }
  async detail(id:string) {
    const result=await this.db.query(`SELECT o.id,o.order_number,o.status,o.sales_channel,o.total_amount,o.currency,o.created_at,COALESCE(c.email,cs.contact_email) AS customer_email,cs.contact_name FROM orders o LEFT JOIN customers c ON c.id=o.customer_id LEFT JOIN checkout_sessions cs ON cs.id=o.checkout_id WHERE o.id=$1`,[id]);
    if(!result.rows[0]) throw new NotFoundException('Sipariş bulunamadı');
    const [address,items,payments]=await Promise.all([
      this.db.query('SELECT recipient_name,phone,city,district,address_line,postal_code FROM order_addresses WHERE order_id=$1',[id]),
      this.db.query('SELECT id,product_name,sku,quantity,unit_amount,currency FROM order_items WHERE order_id=$1 ORDER BY id',[id]),
      this.db.query('SELECT p.id,p.provider,p.status,p.amount,p.currency,p.created_at,p.verified_at FROM payments p JOIN orders o ON o.checkout_id=p.checkout_id WHERE o.id=$1 ORDER BY p.created_at DESC',[id]),
    ]);
    return {...result.rows[0],address:address.rows[0]??null,items:items.rows,payments:payments.rows};
  }
  async track(number:string,email:string) { const result=await this.db.query<{order_number:string;status:string;total_amount:string;currency:string;created_at:string;shipment_status:string|null;tracking_number:string|null}>(`SELECT o.order_number,o.status,o.total_amount,o.currency,o.created_at,s.status AS shipment_status,s.tracking_number FROM orders o JOIN checkout_sessions cs ON cs.id=o.checkout_id LEFT JOIN shipments s ON s.order_id=o.id WHERE o.order_number=$1 AND lower(cs.contact_email)=lower($2)`,[number.trim(),email.trim()]); if(!result.rows[0]) throw new NotFoundException('Sipariş bulunamadı'); return result.rows[0]; }
  async updateStatus(id:string,dto:UpdateOrderStatusDto,actor:RequestUser){return this.db.transaction(async client=>{const row=await client.query<{id:string}>('UPDATE orders SET status=$1 WHERE id=$2 RETURNING id',[dto.status,id]);if(!row.rowCount)throw new Error('Sipariş bulunamadı');await client.query('INSERT INTO order_status_history(order_id,status) VALUES ($1,$2)',[id,dto.status]);await client.query('INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id) VALUES ($1,$2,$3,$4)',[actor.id,`order.status.${dto.status.toLowerCase()}`,'order',id]);return {id,status:dto.status};});} }
