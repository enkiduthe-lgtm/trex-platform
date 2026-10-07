import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { ReceiveStockDto } from './dto/receive-stock.dto';
@Injectable()
export class WarehouseService {
  constructor(private readonly db: DatabaseService) {}
  async deleteStock(warehouseId:string,productId:string,userId:string) {
    return this.db.transaction(async client=>{
      await client.query('SELECT id FROM warehouses WHERE id=$1 FOR UPDATE',[warehouseId]);
      const stock=await client.query<{physical_quantity:number;reserved_quantity:number}>('SELECT physical_quantity,reserved_quantity FROM inventory WHERE warehouse_id=$1 AND product_id=$2 FOR UPDATE',[warehouseId,productId]);
      if(!stock.rows[0]) throw new NotFoundException('Stok kaydı bulunamadı');
      const reservations=await client.query("SELECT 1 FROM stock_reservations WHERE warehouse_id=$1 AND product_id=$2 AND status='ACTIVE' LIMIT 1",[warehouseId,productId]);
      if(stock.rows[0].reserved_quantity>0 || reservations.rowCount) throw new ConflictException('Siparişe rezerve stok silinemez. Önce ilgili siparişi tamamlayın veya iptal edin.');
      await client.query('UPDATE inventory_lots SET available_quantity=0 WHERE warehouse_id=$1 AND product_id=$2',[warehouseId,productId]);
      await client.query("INSERT INTO inventory_movements(product_id,warehouse_id,movement_type,quantity_delta,reference_type,created_by) VALUES ($1,$2,'ADJUSTMENT',$3,'stock_deleted',$4)",[productId,warehouseId,-stock.rows[0].physical_quantity,userId]);
      await client.query('DELETE FROM inventory WHERE warehouse_id=$1 AND product_id=$2',[warehouseId,productId]);
      await client.query('INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata) VALUES ($1,$2,$3,$4,$5)',[userId,'inventory.deleted','inventory',`${productId}:${warehouseId}`,JSON.stringify(stock.rows[0])]);
      return {deleted:true};
    });
  }
  async deleteLocation(id:string,userId:string) {
    try { return await this.db.transaction(async client=>{
      const warehouse=await client.query('SELECT * FROM warehouses WHERE id=$1 FOR UPDATE',[id]);
      if(!warehouse.rows[0]) throw new NotFoundException('Depo bulunamadı');
      const dependencies=await client.query("SELECT 1 FROM inventory WHERE warehouse_id=$1 AND (physical_quantity>0 OR reserved_quantity>0) UNION ALL SELECT 1 FROM stock_reservations WHERE warehouse_id=$1 AND status='ACTIVE' UNION ALL SELECT 1 FROM picking_sessions WHERE warehouse_id=$1 LIMIT 1",[id]);
      if(dependencies.rowCount) throw new ConflictException('Depoda stok, rezervasyon veya sipariş toplama kaydı var. Stokları önce silin; sipariş geçmişine bağlı depolar silinemez.');
      const lots=await client.query('SELECT 1 FROM inventory_lots WHERE warehouse_id=$1 AND available_quantity>0 LIMIT 1',[id]);
      if(lots.rowCount) throw new ConflictException('Depoda kullanılabilir lot stoğu var. Önce stokları silin.');
      const movements=await client.query('SELECT * FROM inventory_movements WHERE warehouse_id=$1',[id]);
      const reservations=await client.query('SELECT * FROM stock_reservations WHERE warehouse_id=$1',[id]);
      const lotRows=await client.query('SELECT * FROM inventory_lots WHERE warehouse_id=$1',[id]);
      await client.query('INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata) VALUES ($1,$2,$3,$4,$5)',[userId,'warehouse.deleted','warehouse',id,JSON.stringify({warehouse:warehouse.rows[0],movements:movements.rows,reservations:reservations.rows,lots:lotRows.rows})]);
      await client.query('DELETE FROM inventory WHERE warehouse_id=$1',[id]);
      await client.query('DELETE FROM inventory_lots WHERE warehouse_id=$1',[id]);
      await client.query('DELETE FROM inventory_movements WHERE warehouse_id=$1',[id]);
      await client.query('DELETE FROM stock_reservations WHERE warehouse_id=$1',[id]);
      await client.query('DELETE FROM warehouses WHERE id=$1',[id]);
      return {deleted:true};
    }); } catch(error:unknown) {
      if((error as {code?:string}).code==='23503') throw new ConflictException('Depo başka kayıtlara bağlı; geçmiş kayıtları korumak için silme geri alındı.');
      throw error;
    }
  }
  async dashboard() {
    const result = await this.db.query<{ waiting: string; picking: string; packing: string; critical_stock: string; returns_pending: string }>(`SELECT (SELECT count(*)::text FROM orders WHERE status='PAID') waiting, (SELECT count(*)::text FROM picking_sessions WHERE status IN ('OPEN','IN_PROGRESS')) picking, (SELECT count(*)::text FROM picking_sessions ps JOIN packing_sessions pk ON pk.picking_session_id=ps.id WHERE ps.status='COMPLETED' AND pk.packed_at IS NULL) packing, (SELECT count(*)::text FROM inventory WHERE physical_quantity-reserved_quantity <= 5) critical_stock, (SELECT count(*)::text FROM returns WHERE status NOT IN ('REFUNDED','REJECTED','CANCELLED')) returns_pending`);
    return result.rows[0];
  }
  async listLocations() { return (await this.db.query<{id:string;code:string;name:string;is_active:boolean}>('SELECT id,code,name,is_active FROM warehouses ORDER BY is_active DESC,name')).rows; }
  async listStock() { return (await this.db.query(`SELECT i.product_id,i.warehouse_id,p.name AS product_name,p.sku,w.name AS warehouse_name,i.physical_quantity,i.reserved_quantity,i.physical_quantity-i.reserved_quantity AS available_quantity FROM inventory i JOIN products p ON p.id=i.product_id JOIN warehouses w ON w.id=i.warehouse_id ORDER BY p.name,w.name`)).rows; }
  async createLocation(dto:CreateWarehouseDto,userId:string) {
    try {
      const row=await this.db.query<{id:string;code:string;name:string;is_active:boolean}>('INSERT INTO warehouses(code,name,is_active) VALUES ($1,$2,$3) RETURNING id,code,name,is_active',[dto.code.trim().toUpperCase(),dto.name.trim(),dto.isActive ?? true]);
      await this.db.query('INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata) VALUES ($1,$2,$3,$4,$5)',[userId,'warehouse.created','warehouse',row.rows[0].id,JSON.stringify({code:row.rows[0].code})]);
      return row.rows[0];
    } catch (error:unknown) { if ((error as {code?:string}).code==='23505') throw new ConflictException('Bu depo kodu zaten kullanılıyor'); throw error; }
  }
  async receiveStock(dto:ReceiveStockDto,userId:string) { return this.db.transaction(async client=>{
    const exists=await client.query('SELECT 1 FROM products WHERE id=$1',[dto.productId]); if(!exists.rowCount) throw new NotFoundException('Ürün bulunamadı');
    const warehouse=await client.query('SELECT 1 FROM warehouses WHERE id=$1 AND is_active=true',[dto.warehouseId]); if(!warehouse.rowCount) throw new NotFoundException('Aktif depo bulunamadı');
    const inventory=await client.query<{physical_quantity:number}>('INSERT INTO inventory(product_id,warehouse_id,physical_quantity) VALUES ($1,$2,$3) ON CONFLICT(product_id,warehouse_id) DO UPDATE SET physical_quantity=inventory.physical_quantity+EXCLUDED.physical_quantity,updated_at=now() RETURNING physical_quantity',[dto.productId,dto.warehouseId,dto.quantity]);
    await client.query('INSERT INTO inventory_lots(product_id,warehouse_id,lot_code,expiry_date,available_quantity,location_code) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT(product_id,warehouse_id,lot_code) DO UPDATE SET available_quantity=inventory_lots.available_quantity+EXCLUDED.available_quantity,expiry_date=COALESCE(EXCLUDED.expiry_date,inventory_lots.expiry_date),location_code=COALESCE(EXCLUDED.location_code,inventory_lots.location_code)',[dto.productId,dto.warehouseId,dto.lotCode.trim(),dto.expiryDate ?? null,dto.quantity,dto.locationCode?.trim() || null]);
    await client.query("INSERT INTO inventory_movements(product_id,warehouse_id,movement_type,quantity_delta,reference_type,created_by) VALUES ($1,$2,'RECEIPT',$3,$4,$5)",[dto.productId,dto.warehouseId,dto.quantity,'stock_receipt',userId]);
    await client.query('INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata) VALUES ($1,$2,$3,$4,$5)',[userId,'inventory.received','inventory',`${dto.productId}:${dto.warehouseId}`,JSON.stringify({quantity:dto.quantity,lotCode:dto.lotCode,expiryDate:dto.expiryDate ?? null,locationCode:dto.locationCode ?? null,note:dto.note ?? null})]);
    return inventory.rows[0];
  }); }
  async listPicks() { return (await this.db.query(`SELECT ps.id, ps.status, ps.created_at, o.order_number, w.name AS warehouse_name, u.email AS assigned_email, COALESCE(SUM(pi.expected_quantity),0) AS expected_items, COALESCE(SUM(pi.picked_quantity),0) AS picked_items FROM picking_sessions ps JOIN orders o ON o.id=ps.order_id JOIN warehouses w ON w.id=ps.warehouse_id LEFT JOIN users u ON u.id=ps.assigned_to LEFT JOIN picking_items pi ON pi.picking_session_id=ps.id GROUP BY ps.id,o.order_number,w.name,u.email ORDER BY ps.created_at DESC LIMIT 50`)).rows; }
  async getPick(id:string) {
    const pick = await this.db.query<{id:string;status:string;order_number:string;warehouse_name:string}>(`SELECT ps.id,ps.status,o.order_number,w.name AS warehouse_name FROM picking_sessions ps JOIN orders o ON o.id=ps.order_id JOIN warehouses w ON w.id=ps.warehouse_id WHERE ps.id=$1`,[id]);
    if (!pick.rows[0]) throw new NotFoundException('Toplama listesi bulunamadı');
    const items = await this.db.query<{id:string;product_name:string;sku:string;barcode:string|null;expected_quantity:number;picked_quantity:number;lot_code:string|null;expiry_date:string|null;location_code:string|null}>(`SELECT pi.id,oi.product_name,oi.sku,p.barcode,pi.expected_quantity,pi.picked_quantity,l.lot_code,l.expiry_date,l.location_code FROM picking_items pi JOIN order_items oi ON oi.id=pi.order_item_id LEFT JOIN products p ON p.id=oi.product_id LEFT JOIN LATERAL (SELECT lot_code,expiry_date,location_code FROM inventory_lots WHERE product_id=oi.product_id AND warehouse_id=(SELECT warehouse_id FROM picking_sessions WHERE id=pi.picking_session_id) AND available_quantity>0 ORDER BY expiry_date ASC NULLS LAST LIMIT 1) l ON true WHERE pi.picking_session_id=$1 ORDER BY oi.product_name`,[id]);
    return { ...pick.rows[0], items: items.rows };
  }
  async criticalStock() { return (await this.db.query(`SELECT p.id, p.name, w.name AS warehouse_name, i.physical_quantity, i.reserved_quantity, i.physical_quantity-i.reserved_quantity AS available_quantity FROM inventory i JOIN products p ON p.id=i.product_id JOIN warehouses w ON w.id=i.warehouse_id WHERE i.physical_quantity-i.reserved_quantity <= 5 ORDER BY available_quantity ASC, p.name LIMIT 100`)).rows; }
  async createPick(orderId:string,warehouseId:string,userId:string) { const order=await this.db.query("SELECT id FROM orders WHERE id=$1 AND status='PAID'",[orderId]); if(!order.rowCount) throw new NotFoundException('Paid order not found'); const pick=await this.db.query<{id:string}>('INSERT INTO picking_sessions (order_id,warehouse_id,assigned_to,status) VALUES ($1,$2,$3,$4) RETURNING id',[orderId,warehouseId,userId,'IN_PROGRESS']); const items=await this.db.query<{id:string;quantity:number}>('SELECT id,quantity FROM order_items WHERE order_id=$1',[orderId]); for(const item of items.rows) await this.db.query('INSERT INTO picking_items (picking_session_id,order_item_id,expected_quantity) VALUES ($1,$2,$3)',[pick.rows[0].id,item.id,item.quantity]); return pick.rows[0]; }
  async updatePickedQuantity(pickId:string,itemId:string,pickedQuantity:number,userId:string) { return this.db.transaction(async client=>{
    const item=await client.query<{id:string;expected_quantity:number;status:string}>(`SELECT pi.id,pi.expected_quantity,ps.status FROM picking_items pi JOIN picking_sessions ps ON ps.id=pi.picking_session_id WHERE pi.id=$1 AND pi.picking_session_id=$2 FOR UPDATE`,[itemId,pickId]);
    const row=item.rows[0];
    if(!row) throw new NotFoundException('Toplama kalemi bulunamadı');
    if(!['OPEN','IN_PROGRESS'].includes(row.status)) throw new ConflictException('Bu toplama listesi artık düzenlenemez');
    if(pickedQuantity>row.expected_quantity) throw new ConflictException('Toplanan adet, sipariş adedini geçemez');
    await client.query('UPDATE picking_items SET picked_quantity=$1 WHERE id=$2',[pickedQuantity,itemId]);
    await client.query('INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata) VALUES ($1,$2,$3,$4,$5)',[userId,'warehouse.pick_item.updated','picking_item',itemId,JSON.stringify({pickId,pickedQuantity})]);
    return {id:itemId,pickId,pickedQuantity,expectedQuantity:row.expected_quantity};
  }); }
  async completePick(id:string,userId:string) { return this.db.transaction(async client=>{ const pick=await client.query<{id:string}>('SELECT id FROM picking_sessions WHERE id=$1 AND status IN (\'OPEN\',\'IN_PROGRESS\') FOR UPDATE',[id]); if(!pick.rowCount) throw new NotFoundException('Aktif toplama listesi bulunamadı'); const missing=await client.query('SELECT 1 FROM picking_items WHERE picking_session_id=$1 AND picked_quantity<expected_quantity LIMIT 1',[id]); if(missing.rowCount) throw new Error('Tüm ürünler toplanmadan liste tamamlanamaz'); await client.query('UPDATE picking_sessions SET status=\'COMPLETED\',completed_at=now() WHERE id=$1',[id]); await client.query('INSERT INTO packing_sessions(picking_session_id,packed_by) VALUES ($1,$2)',[id,userId]); return {id,status:'COMPLETED'}; }); }
  async completePacking(pickId:string,userId:string) { return this.db.transaction(async client=>{ const packing=await client.query<{id:string;order_id:string;checkout_id:string}>(`SELECT pk.id,ps.order_id,o.checkout_id FROM packing_sessions pk JOIN picking_sessions ps ON ps.id=pk.picking_session_id JOIN orders o ON o.id=ps.order_id WHERE pk.picking_session_id=$1 AND pk.packed_at IS NULL FOR UPDATE`,[pickId]); if(!packing.rowCount) throw new NotFoundException('Açık paketleme kaydı bulunamadı'); const reservations=await client.query<{id:string;product_id:string;warehouse_id:string;quantity:number}>(`SELECT id,product_id,warehouse_id,quantity FROM stock_reservations WHERE reference_type='checkout' AND reference_id=$1 AND status='ACTIVE' FOR UPDATE`,[packing.rows[0].checkout_id]); for(const reservation of reservations.rows){const stock=await client.query<{physical_quantity:number}>(`UPDATE inventory SET physical_quantity=physical_quantity-$1,reserved_quantity=reserved_quantity-$1,updated_at=now() WHERE product_id=$2 AND warehouse_id=$3 AND physical_quantity >= $1 AND reserved_quantity >= $1 RETURNING physical_quantity`,[reservation.quantity,reservation.product_id,reservation.warehouse_id]);if(!stock.rowCount)throw new ConflictException('Paketleme için rezerve stok bulunamadı');let remaining=reservation.quantity;const lots=await client.query<{id:string;available_quantity:number}>(`SELECT id,available_quantity FROM inventory_lots WHERE product_id=$1 AND warehouse_id=$2 AND available_quantity>0 ORDER BY expiry_date ASC NULLS LAST,created_at ASC FOR UPDATE`,[reservation.product_id,reservation.warehouse_id]);for(const lot of lots.rows){if(remaining<=0)break;const consumed=Math.min(remaining,lot.available_quantity);await client.query('UPDATE inventory_lots SET available_quantity=available_quantity-$1 WHERE id=$2',[consumed,lot.id]);remaining-=consumed;}await client.query(`UPDATE stock_reservations SET status='CONSUMED' WHERE id=$1`,[reservation.id]);await client.query(`INSERT INTO inventory_movements(product_id,warehouse_id,movement_type,quantity_delta,reference_type,reference_id,created_by) VALUES ($1,$2,'FULFILLMENT',$3,'order',$4,$5)`,[reservation.product_id,reservation.warehouse_id,-reservation.quantity,packing.rows[0].order_id,userId]);} await client.query('UPDATE packing_sessions SET packed_by=$1,packed_at=now(),verification_code=$2 WHERE id=$3',[userId,`TRX-${Date.now()}`,packing.rows[0].id]); await client.query(`UPDATE orders SET status='PROCESSING' WHERE id=$1 AND status='PAID'`,[packing.rows[0].order_id]); return {pickId,status:'READY_FOR_SHIPMENT'}; }); }
}
