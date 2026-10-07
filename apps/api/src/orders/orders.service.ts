import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { RequestUser } from '../auth/auth.types';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
@Injectable()
export class OrdersService { constructor(private readonly db: DatabaseService) {} async list(channel?:string) { const normalized=channel?.trim().toUpperCase(); const allowed=['PUBLIC_WEB','ADMIN_ORDER','DEALER_PORTAL','WHOLESALE','MARKETPLACE']; if(normalized&&!allowed.includes(normalized)) throw new BadRequestException('Geçersiz satış kanalı'); return (await this.db.query(`SELECT o.id,o.order_number,o.status,o.total_amount,o.currency,o.created_at,o.sales_channel,o.marketplace_name,o.commission_amount,o.shipping_cost_amount,COALESCE(c.email,cs.contact_email) AS customer_email,COALESCE(NULLIF(trim(concat_ws(' ',c.first_name,c.last_name)),''),NULLIF(trim(cs.contact_name),''),oa.recipient_name) AS customer_name,COALESCE(SUM(oi.quantity),0) AS item_count FROM orders o LEFT JOIN customers c ON c.id=o.customer_id LEFT JOIN checkout_sessions cs ON cs.id=o.checkout_id LEFT JOIN order_addresses oa ON oa.order_id=o.id LEFT JOIN order_items oi ON oi.order_id=o.id WHERE ($1::sales_channel_code IS NULL OR o.sales_channel=$1::sales_channel_code) GROUP BY o.id,c.id,cs.id,oa.id ORDER BY o.created_at DESC LIMIT 100`,[normalized ?? null])).rows; }
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
  async cancel(id:string,actor:RequestUser) {
    if(!['ADMIN','SUPER_ADMIN'].includes(actor.role)) throw new ForbiddenException('Sipariş iptali için yönetici yetkisi gerekli');
    return this.db.transaction(async client=>{
      const order=(await client.query<{checkout_id:string;status:string;sales_channel:string}>('SELECT checkout_id,status,sales_channel FROM orders WHERE id=$1 FOR UPDATE',[id])).rows[0];
      if(!order) throw new NotFoundException('Sipariş bulunamadı');
      if(order.status==='CANCELLED') return {id,status:'CANCELLED',replayed:true};
      if(order.sales_channel!=='ADMIN_ORDER'||!['PENDING_PAYMENT','PROCESSING'].includes(order.status)) throw new ConflictException('Bu sipariş güvenli iptal kapsamı dışında; iade akışını kullanın');
      await client.query('SELECT id FROM checkout_sessions WHERE id=$1 FOR UPDATE',[order.checkout_id]);
      const payment=(await client.query<{id:string;status:string;provider:string}>('SELECT id,status,provider FROM payments WHERE checkout_id=$1 FOR UPDATE',[order.checkout_id])).rows[0];
      if(!payment||payment.status!=='PENDING'||!['bank_transfer','cash','cash_on_delivery_card','cash_on_delivery_cash'].includes(payment.provider)) throw new ConflictException('Tahsil edilmiş sipariş için iade işlemi gerekli');
      const collected=await client.query('SELECT id FROM finance_transactions WHERE order_id=$1 AND approved_at IS NOT NULL LIMIT 1',[id]);
      if(collected.rowCount) throw new ConflictException('Kısmi tahsilat yapılmış sipariş için iade işlemi gerekli');
      await client.query('SELECT id FROM picking_sessions WHERE order_id=$1 FOR UPDATE',[id]);
      const packed=await client.query('SELECT pk.id FROM packing_sessions pk JOIN picking_sessions ps ON ps.id=pk.picking_session_id WHERE ps.order_id=$1 AND pk.packed_at IS NOT NULL LIMIT 1',[id]);
      if(packed.rowCount) throw new ConflictException('Paketlenmiş sipariş için iade işlemi gerekli');
      const reservations=(await client.query<{id:string;product_id:string;warehouse_id:string;quantity:number}>(
        "SELECT id,product_id,warehouse_id,quantity FROM stock_reservations WHERE reference_type='checkout' AND reference_id=$1 AND status='ACTIVE' ORDER BY product_id,warehouse_id,id FOR UPDATE",[order.checkout_id])).rows;
      let releasedQuantity=0;
      for(const reservation of reservations) {
        const stock=await client.query('UPDATE inventory SET reserved_quantity=reserved_quantity-$1,updated_at=now() WHERE product_id=$2 AND warehouse_id=$3 AND reserved_quantity>=$1 RETURNING product_id',[reservation.quantity,reservation.product_id,reservation.warehouse_id]);
        if(!stock.rowCount) throw new ConflictException('Ayrılan stok doğrulanamadı; iptal uygulanmadı');
        await client.query("UPDATE stock_reservations SET status='RELEASED',released_at=now() WHERE id=$1",[reservation.id]);
        await client.query("INSERT INTO inventory_movements(product_id,warehouse_id,movement_type,quantity_delta,reference_type,reference_id,created_by) VALUES ($1,$2,'RELEASE',0,'order_cancel',$3,$4)",[reservation.product_id,reservation.warehouse_id,id,actor.id]);
        releasedQuantity+=reservation.quantity;
      }
      await client.query("UPDATE picking_sessions SET status='CANCELLED' WHERE order_id=$1 AND status IN ('OPEN','IN_PROGRESS','COMPLETED')",[id]);
      await client.query("UPDATE payments SET status='FAILED' WHERE id=$1",[payment.id]);
      await client.query("UPDATE payment_attempts SET status='FAILED' WHERE payment_id=$1",[payment.id]);
      await client.query("UPDATE checkout_sessions SET status='EXPIRED' WHERE id=$1",[order.checkout_id]);
      await client.query("UPDATE orders SET status='CANCELLED' WHERE id=$1",[id]);
      await client.query("INSERT INTO order_status_history(order_id,status,actor_user_id) VALUES ($1,'CANCELLED',$2)",[id,actor.id]);
      await client.query('INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata) VALUES ($1,$2,$3,$4,$5)',[actor.id,'order.cancelled','order',id,JSON.stringify({previousStatus:order.status,releasedQuantity})]);
      return {id,status:'CANCELLED',releasedQuantity,replayed:false};
    });
  }
  async updateStatus(id:string,dto:UpdateOrderStatusDto,actor:RequestUser){if(dto.status==='CANCELLED')return this.cancel(id,actor);return this.db.transaction(async client=>{const row=await client.query<{id:string}>('UPDATE orders SET status=$1 WHERE id=$2 RETURNING id',[dto.status,id]);if(!row.rowCount)throw new Error('Sipariş bulunamadı');await client.query('INSERT INTO order_status_history(order_id,status) VALUES ($1,$2)',[id,dto.status]);await client.query('INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id) VALUES ($1,$2,$3,$4)',[actor.id,`order.status.${dto.status.toLowerCase()}`,'order',id]);return {id,status:dto.status};});}
}
