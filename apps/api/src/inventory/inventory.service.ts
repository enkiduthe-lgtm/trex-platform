import { ConflictException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service';
import { RequestUser } from '../auth/auth.types';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { ReserveStockDto } from './dto/reserve-stock.dto';

@Injectable()
export class InventoryService implements OnModuleInit, OnModuleDestroy {
  private timer?:ReturnType<typeof setInterval>;
  private cleaning=false;
  private readonly logger=new Logger(InventoryService.name);
  constructor(private readonly db: DatabaseService) {}
  onModuleInit(){void this.cleanExpiredReservations();this.timer=setInterval(()=>{void this.cleanExpiredReservations()},60_000);this.timer.unref();}
  onModuleDestroy(){if(this.timer)clearInterval(this.timer);}
  async cleanExpiredReservations(){
    if(this.cleaning)return;
    this.cleaning=true;
    try{await this.db.query('SELECT release_expired_checkout_reservations()');}
    catch{this.logger.error('Süresi dolan rezervasyon kontrolü başarısız; kayıtlar korunuyor.');}
    finally{this.cleaning=false;}
  }
  async adjust(dto: AdjustStockDto, actor: RequestUser) {
    return this.db.transaction(async (client: PoolClient) => {
      const row = await client.query<{ physical_quantity: number }>('UPDATE inventory SET physical_quantity=physical_quantity+$1, updated_at=now() WHERE product_id=$2 AND warehouse_id=$3 RETURNING physical_quantity', [dto.quantity, dto.productId, dto.warehouseId]);
      if (!row.rows[0]) throw new NotFoundException('Inventory record not found');
      await client.query('INSERT INTO inventory_movements (product_id, warehouse_id, movement_type, quantity_delta, reference_type, created_by) VALUES ($1,$2,$3,$4,$5,$6)', [dto.productId, dto.warehouseId, 'ADJUSTMENT', dto.quantity, dto.reason, actor.id]);
      await client.query('INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata) VALUES ($1,$2,$3,$4,$5)', [actor.id, 'inventory.adjusted', 'inventory', `${dto.productId}:${dto.warehouseId}`, JSON.stringify({ quantity: dto.quantity, reason: dto.reason })]);
      return row.rows[0];
    });
  }
  async reserve(dto: ReserveStockDto) {
    return this.db.transaction(async (client: PoolClient) => {
      const inventory = await client.query<{ physical_quantity: number; reserved_quantity: number }>('SELECT physical_quantity, reserved_quantity FROM inventory WHERE product_id=$1 AND warehouse_id=$2 FOR UPDATE', [dto.productId, dto.warehouseId]);
      const stock = inventory.rows[0]; if (!stock) throw new NotFoundException('Inventory record not found');
      if (stock.physical_quantity - stock.reserved_quantity < dto.quantity) throw new ConflictException('Insufficient available stock');
      await client.query('UPDATE inventory SET reserved_quantity=reserved_quantity+$1, updated_at=now() WHERE product_id=$2 AND warehouse_id=$3', [dto.quantity, dto.productId, dto.warehouseId]);
      const reservation = await client.query<{ id: string; expires_at: Date }>("INSERT INTO stock_reservations (product_id, warehouse_id, quantity, reference_type, reference_id, expires_at) VALUES ($1,$2,$3,'checkout',$4,now() + ($5 * interval '1 minute')) RETURNING id, expires_at", [dto.productId, dto.warehouseId, dto.quantity, dto.referenceId, dto.ttlMinutes]);
      await client.query('INSERT INTO inventory_movements (product_id, warehouse_id, movement_type, quantity_delta, reference_type, reference_id) VALUES ($1,$2,$3,$4,$5,$6)', [dto.productId, dto.warehouseId, 'RESERVATION', 0, 'stock_reservation', reservation.rows[0].id]);
      return reservation.rows[0];
    });
  }
}
