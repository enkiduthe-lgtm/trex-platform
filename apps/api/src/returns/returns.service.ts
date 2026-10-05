import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { RequestReturnDto } from './dto/request-return.dto';
@Injectable()
export class ReturnsService {
  constructor(private readonly db: DatabaseService) {}
  async request(dto: RequestReturnDto) {
    return this.db.transaction(async client => {
      const order = await client.query("SELECT 1 FROM orders WHERE id=$1 AND status IN ('PAID','PROCESSING','SHIPPED','DELIVERED') FOR UPDATE", [dto.orderId]); if (!order.rowCount) throw new NotFoundException('Return-eligible order not found');
      for (const item of dto.items) {
        const orderItem = await client.query<{ quantity: number }>('SELECT quantity FROM order_items WHERE id=$1 AND order_id=$2', [item.orderItemId, dto.orderId]);
        if (!orderItem.rows[0] || item.quantity > orderItem.rows[0].quantity) throw new ConflictException('Invalid return item quantity');
        const alreadyRequested = await client.query<{ quantity: string }>(`SELECT COALESCE(SUM(ri.quantity),0)::text AS quantity FROM return_items ri JOIN returns r ON r.id=ri.return_id WHERE ri.order_item_id=$1 AND r.status NOT IN ('REJECTED','CANCELLED')`, [item.orderItemId]);
        if (Number(alreadyRequested.rows[0]?.quantity ?? 0) + item.quantity > orderItem.rows[0].quantity) throw new ConflictException('Requested return quantity exceeds the remaining eligible quantity');
      }
      const created = await client.query<{ id: string }>('INSERT INTO returns (order_id,reason) VALUES ($1,$2) RETURNING id', [dto.orderId, dto.reason]);
      for (const item of dto.items) await client.query('INSERT INTO return_items (return_id,order_item_id,quantity) VALUES ($1,$2,$3)', [created.rows[0].id, item.orderItemId, item.quantity]);
      return { returnId: created.rows[0].id, status: 'REQUESTED' };
    });
  }
  async listAdmin() { return (await this.db.query(`SELECT r.id,r.status,r.reason,r.requested_at,r.received_at,o.order_number,COALESCE(SUM(ri.quantity),0) AS item_count FROM returns r JOIN orders o ON o.id=r.order_id LEFT JOIN return_items ri ON ri.return_id=r.id GROUP BY r.id,o.order_number ORDER BY r.requested_at DESC LIMIT 100`)).rows; }
  async inspect(returnId: string, accepted: boolean, notes: string | undefined, actorId: string) {
    return this.db.transaction(async client => {
      const updated = await client.query<{order_id:string}>("UPDATE returns SET status=$1,received_at=COALESCE(received_at,now()) WHERE id=$2 AND status IN ('REQUESTED','APPROVED','RECEIVED') RETURNING order_id", [accepted ? 'INSPECTED' : 'REJECTED', returnId]); if (!updated.rowCount) throw new NotFoundException('Return is not inspectable');
      await client.query('INSERT INTO return_inspections (return_id,accepted,notes,inspected_by) VALUES ($1,$2,$3,$4)', [returnId, accepted, notes ?? null, actorId]);
      if (accepted) {
        const items = await client.query<{product_id:string;quantity:number}>(`SELECT oi.product_id,ri.quantity FROM return_items ri JOIN order_items oi ON oi.id=ri.order_item_id WHERE ri.return_id=$1`,[returnId]);
        const checkout = await client.query<{checkout_id:string}>(`SELECT checkout_id FROM orders WHERE id=$1`,[updated.rows[0].order_id]);
        if (checkout.rows[0]) for (const item of items.rows) {
          const reservation = await client.query<{warehouse_id:string}>(`SELECT warehouse_id FROM stock_reservations WHERE reference_type='checkout' AND reference_id=$1 AND product_id=$2 AND status='CONSUMED' ORDER BY created_at ASC LIMIT 1`,[checkout.rows[0].checkout_id,item.product_id]);
          if (!reservation.rows[0]) continue;
          await client.query(`UPDATE inventory SET physical_quantity=physical_quantity+$1,updated_at=now() WHERE product_id=$2 AND warehouse_id=$3`,[item.quantity,item.product_id,reservation.rows[0].warehouse_id]);
          await client.query(`INSERT INTO inventory_movements(product_id,warehouse_id,movement_type,quantity_delta,reference_type,reference_id,created_by) VALUES ($1,$2,'RECEIPT',$3,'return',$4,$5)`,[item.product_id,reservation.rows[0].warehouse_id,item.quantity,returnId,actorId]);
        }
      }
      await client.query('INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata) VALUES ($1,$2,$3,$4,$5)',[actorId,accepted?'return.inspected_accepted':'return.inspected_rejected','return',returnId,JSON.stringify({restocked:accepted})]);
      return { returnId, status: accepted ? 'INSPECTED' : 'REJECTED' };
    });
  }
}
