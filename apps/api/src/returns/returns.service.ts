import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { RequestReturnDto } from './dto/request-return.dto';
@Injectable()
export class ReturnsService {
  constructor(private readonly db: DatabaseService) {}
  async request(dto: RequestReturnDto) {
    const order = await this.db.query("SELECT 1 FROM orders WHERE id=$1 AND status IN ('PAID','PROCESSING','SHIPPED','DELIVERED')", [dto.orderId]); if (!order.rowCount) throw new NotFoundException('Return-eligible order not found');
    const created = await this.db.query<{ id: string }>('INSERT INTO returns (order_id,reason) VALUES ($1,$2) RETURNING id', [dto.orderId, dto.reason]);
    for (const item of dto.items) {
      const orderItem = await this.db.query<{ quantity: number }>('SELECT quantity FROM order_items WHERE id=$1 AND order_id=$2', [item.orderItemId, dto.orderId]);
      if (!orderItem.rows[0] || item.quantity > orderItem.rows[0].quantity) throw new ConflictException('Invalid return item quantity');
      await this.db.query('INSERT INTO return_items (return_id,order_item_id,quantity) VALUES ($1,$2,$3)', [created.rows[0].id, item.orderItemId, item.quantity]);
    }
    return { returnId: created.rows[0].id, status: 'REQUESTED' };
  }
  async inspect(returnId: string, accepted: boolean, notes: string | undefined, actorId: string) {
    const updated = await this.db.query("UPDATE returns SET status=$1,received_at=COALESCE(received_at,now()) WHERE id=$2 AND status IN ('REQUESTED','APPROVED','RECEIVED') RETURNING id", [accepted ? 'INSPECTED' : 'REJECTED', returnId]); if (!updated.rowCount) throw new NotFoundException('Return is not inspectable');
    await this.db.query('INSERT INTO return_inspections (return_id,accepted,notes,inspected_by) VALUES ($1,$2,$3,$4)', [returnId, accepted, notes ?? null, actorId]); return { returnId, status: accepted ? 'INSPECTED' : 'REJECTED' };
  }
}
