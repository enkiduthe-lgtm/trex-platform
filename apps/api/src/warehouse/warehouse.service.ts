import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { ReceiveStockDto } from './dto/receive-stock.dto';
import { UpdateReorderLevelDto } from './dto/update-reorder-level.dto';
import { CreateInventoryCountDto } from './dto/create-inventory-count.dto';
import { CreateInventoryTransferDto } from './dto/create-inventory-transfer.dto';
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
  async listInventoryMovements() { return (await this.db.query(`SELECT m.id,m.movement_type,m.quantity_delta,m.reference_type,m.reference_id,m.created_at,p.name AS product_name,p.sku,w.name AS warehouse_name,u.email AS created_by_email
    FROM inventory_movements m
    JOIN products p ON p.id=m.product_id
    JOIN warehouses w ON w.id=m.warehouse_id
    LEFT JOIN users u ON u.id=m.created_by
    ORDER BY m.created_at DESC LIMIT 100`)).rows; }
  async expiryAlerts() { return (await this.db.query(`SELECT l.id,l.lot_code,l.expiry_date,l.available_quantity,l.location_code,p.name AS product_name,p.sku,w.name AS warehouse_name,
      (l.expiry_date-current_date)::int AS days_remaining
    FROM inventory_lots l
    JOIN products p ON p.id=l.product_id
    JOIN warehouses w ON w.id=l.warehouse_id
    WHERE l.available_quantity>0 AND l.expiry_date IS NOT NULL AND l.expiry_date<=current_date+interval '60 days'
    ORDER BY l.expiry_date ASC,p.name LIMIT 100`)).rows; }
  async listInventoryCounts() { return (await this.db.query(`SELECT c.id,c.product_id,c.warehouse_id,p.name AS product_name,w.name AS warehouse_name,c.expected_quantity,c.actual_quantity,c.difference_quantity,c.reason,c.counted_at,u.email AS counted_by_email
    FROM inventory_counts c JOIN products p ON p.id=c.product_id JOIN warehouses w ON w.id=c.warehouse_id JOIN users u ON u.id=c.counted_by
    ORDER BY c.counted_at DESC LIMIT 50`)).rows; }
  async listInventoryTransfers() { return (await this.db.query(`SELECT t.id,t.product_id,t.quantity,t.note,t.transferred_at,p.name AS product_name,p.sku,source.name AS source_warehouse_name,destination.name AS destination_warehouse_name,u.email AS transferred_by_email
    FROM inventory_transfers t JOIN products p ON p.id=t.product_id JOIN warehouses source ON source.id=t.source_warehouse_id JOIN warehouses destination ON destination.id=t.destination_warehouse_id JOIN users u ON u.id=t.transferred_by
    ORDER BY t.transferred_at DESC LIMIT 50`)).rows; }
  async createInventoryTransfer(dto:CreateInventoryTransferDto,userId:string) {
    if(dto.sourceWarehouseId===dto.destinationWarehouseId) throw new ConflictException('Kaynak ve hedef depo aynı olamaz');
    return this.db.transaction(async client=>{
      const warehouses=await client.query<{id:string}>(`SELECT id FROM warehouses WHERE id=ANY($1::uuid[]) AND is_active=true ORDER BY id FOR UPDATE`,[[dto.sourceWarehouseId,dto.destinationWarehouseId]]);
      if(warehouses.rowCount!==2) throw new NotFoundException('Kaynak veya hedef aktif depo bulunamadı');
      const source=await client.query<{physical_quantity:number;reserved_quantity:number}>(`SELECT physical_quantity,reserved_quantity FROM inventory WHERE product_id=$1 AND warehouse_id=$2 FOR UPDATE`,[dto.productId,dto.sourceWarehouseId]);
      const available=(source.rows[0]?.physical_quantity??0)-(source.rows[0]?.reserved_quantity??0);
      if(available<dto.quantity) throw new ConflictException(`Transfer için kullanılabilir stok yetersiz. Kullanılabilir adet: ${Math.max(available,0)}`);
      const lots=await client.query<{id:string;lot_code:string;expiry_date:string|null;location_code:string|null;available_quantity:number}>(`SELECT id,lot_code,expiry_date,location_code,available_quantity FROM inventory_lots WHERE product_id=$1 AND warehouse_id=$2 AND available_quantity>0 ORDER BY expiry_date ASC NULLS LAST,created_at ASC FOR UPDATE`,[dto.productId,dto.sourceWarehouseId]);
      let remaining=dto.quantity; const allocations:Array<{lotCode:string;expiryDate:string|null;locationCode:string|null;quantity:number}>=[];
      for(const lot of lots.rows){if(remaining<=0) break;const quantity=Math.min(remaining,lot.available_quantity);await client.query('UPDATE inventory_lots SET available_quantity=available_quantity-$1 WHERE id=$2',[quantity,lot.id]);allocations.push({lotCode:lot.lot_code,expiryDate:lot.expiry_date,locationCode:lot.location_code,quantity});remaining-=quantity;}
      if(remaining>0) throw new ConflictException('Lot stokları transfer adedini karşılamıyor; transfer kaydedilmedi');
      const transfer=await client.query<{id:string}>(`INSERT INTO inventory_transfers(product_id,source_warehouse_id,destination_warehouse_id,quantity,note,transferred_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,[dto.productId,dto.sourceWarehouseId,dto.destinationWarehouseId,dto.quantity,dto.note?.trim()||null,userId]);
      await client.query('UPDATE inventory SET physical_quantity=physical_quantity-$1,updated_at=now() WHERE product_id=$2 AND warehouse_id=$3',[dto.quantity,dto.productId,dto.sourceWarehouseId]);
      await client.query(`INSERT INTO inventory(product_id,warehouse_id,physical_quantity) VALUES($1,$2,$3) ON CONFLICT(product_id,warehouse_id) DO UPDATE SET physical_quantity=inventory.physical_quantity+EXCLUDED.physical_quantity,updated_at=now()`,[dto.productId,dto.destinationWarehouseId,dto.quantity]);
      for(const allocation of allocations) await client.query(`INSERT INTO inventory_lots(product_id,warehouse_id,lot_code,expiry_date,available_quantity,location_code) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(product_id,warehouse_id,lot_code) DO UPDATE SET available_quantity=inventory_lots.available_quantity+EXCLUDED.available_quantity,expiry_date=COALESCE(EXCLUDED.expiry_date,inventory_lots.expiry_date),location_code=COALESCE(EXCLUDED.location_code,inventory_lots.location_code)`,[dto.productId,dto.destinationWarehouseId,allocation.lotCode,allocation.expiryDate,allocation.quantity,allocation.locationCode]);
      await client.query(`INSERT INTO inventory_movements(product_id,warehouse_id,movement_type,quantity_delta,reference_type,reference_id,created_by) VALUES($1,$2,'TRANSFER_OUT',$3,'inventory_transfer',$4,$5),($1,$6,'TRANSFER_IN',$7,'inventory_transfer',$4,$5)`,[dto.productId,dto.sourceWarehouseId,-dto.quantity,transfer.rows[0].id,userId,dto.destinationWarehouseId,dto.quantity]);
      await client.query('INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5)',[userId,'inventory.transferred','inventory_transfer',transfer.rows[0].id,JSON.stringify({...dto,allocations})]);
      return {id:transfer.rows[0].id,quantity:dto.quantity,allocations};
    });
  }
  async createInventoryCount(dto:CreateInventoryCountDto,userId:string) { return this.db.transaction(async client=>{
    const inventory=await client.query<{physical_quantity:number;reserved_quantity:number}>(`SELECT physical_quantity,reserved_quantity FROM inventory WHERE product_id=$1 AND warehouse_id=$2 FOR UPDATE`,[dto.productId,dto.warehouseId]);
    const row=inventory.rows[0];
    if(!row) throw new NotFoundException('Sayım yapılacak stok kaydı bulunamadı');
    if(dto.actualQuantity<row.reserved_quantity) throw new ConflictException(`Fiili adet, rezerve stoktan (${row.reserved_quantity}) düşük olamaz`);
    const difference=dto.actualQuantity-row.physical_quantity;
    if(difference<0){
      let remaining=Math.abs(difference);
      const lots=await client.query<{id:string;available_quantity:number}>(`SELECT id,available_quantity FROM inventory_lots WHERE product_id=$1 AND warehouse_id=$2 AND available_quantity>0 ORDER BY expiry_date DESC NULLS FIRST,created_at DESC FOR UPDATE`,[dto.productId,dto.warehouseId]);
      for(const lot of lots.rows){if(remaining<=0)break;const deducted=Math.min(remaining,lot.available_quantity);await client.query('UPDATE inventory_lots SET available_quantity=available_quantity-$1 WHERE id=$2',[deducted,lot.id]);remaining-=deducted;}
      if(remaining>0) throw new ConflictException('Lot stokları sayım farkını karşılamıyor; sayım kaydedilmedi');
    } else if(difference>0) {
      const lotCode=`COUNT-${new Date().toISOString().slice(0,10).replaceAll('-','')}-${String(Date.now()).slice(-6)}`;
      await client.query('INSERT INTO inventory_lots(product_id,warehouse_id,lot_code,available_quantity,location_code) VALUES($1,$2,$3,$4,$5)',[dto.productId,dto.warehouseId,lotCode,difference,'SAYIM']);
    }
    await client.query('UPDATE inventory SET physical_quantity=$1,updated_at=now() WHERE product_id=$2 AND warehouse_id=$3',[dto.actualQuantity,dto.productId,dto.warehouseId]);
    const count=await client.query<{id:string}>(`INSERT INTO inventory_counts(product_id,warehouse_id,expected_quantity,actual_quantity,difference_quantity,reason,counted_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,[dto.productId,dto.warehouseId,row.physical_quantity,dto.actualQuantity,difference,dto.reason.trim(),userId]);
    await client.query(`INSERT INTO inventory_movements(product_id,warehouse_id,movement_type,quantity_delta,reference_type,reference_id,created_by) VALUES($1,$2,'ADJUSTMENT',$3,'inventory_count',$4,$5)`,[dto.productId,dto.warehouseId,difference,count.rows[0].id,userId]);
    await client.query('INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5)',[userId,'inventory.counted','inventory',`${dto.productId}:${dto.warehouseId}`,JSON.stringify({expectedQuantity:row.physical_quantity,actualQuantity:dto.actualQuantity,difference,reason:dto.reason.trim(),countId:count.rows[0].id})]);
    return {id:count.rows[0].id,expectedQuantity:row.physical_quantity,actualQuantity:dto.actualQuantity,difference};
  }); }
  async reorderSuggestions() { return (await this.db.query(`SELECT
      i.product_id,i.warehouse_id,p.name AS product_name,p.sku,w.name AS warehouse_name,
      i.physical_quantity,i.reserved_quantity,i.physical_quantity-i.reserved_quantity AS available_quantity,
      COALESCE(rl.minimum_quantity,5) AS minimum_quantity,
      COALESCE(rl.target_quantity,20) AS target_quantity,
      GREATEST(0,COALESCE(rl.target_quantity,20)-(i.physical_quantity-i.reserved_quantity)) AS suggested_quantity,
      latest_cost.amount::text AS latest_unit_cost,latest_cost.currency AS latest_cost_currency,latest_cost.supplier_id AS latest_supplier_id,s.name AS latest_supplier_name
    FROM inventory i
    JOIN products p ON p.id=i.product_id
    JOIN warehouses w ON w.id=i.warehouse_id
    LEFT JOIN inventory_reorder_levels rl ON rl.product_id=i.product_id AND rl.warehouse_id=i.warehouse_id
    LEFT JOIN LATERAL (SELECT pc.amount,pc.currency,pc.supplier_id FROM product_costs pc WHERE pc.product_id=i.product_id ORDER BY pc.starts_at DESC,pc.created_at DESC LIMIT 1) latest_cost ON true
    LEFT JOIN suppliers s ON s.id=latest_cost.supplier_id
    WHERE i.physical_quantity-i.reserved_quantity <= COALESCE(rl.minimum_quantity,5)
    ORDER BY available_quantity ASC,p.name,w.name`)).rows; }
  async updateReorderLevel(warehouseId:string,productId:string,dto:UpdateReorderLevelDto,userId:string) {
    if(dto.targetQuantity<dto.minimumQuantity) throw new ConflictException('Hedef stok, minimum stok seviyesinden düşük olamaz');
    return this.db.transaction(async client=>{
      const stock=await client.query('SELECT 1 FROM inventory WHERE warehouse_id=$1 AND product_id=$2 FOR UPDATE',[warehouseId,productId]);
      if(!stock.rowCount) throw new NotFoundException('Bu ürün için depo stoku bulunamadı');
      const level=await client.query<{product_id:string;warehouse_id:string;minimum_quantity:number;target_quantity:number}>(`INSERT INTO inventory_reorder_levels(product_id,warehouse_id,minimum_quantity,target_quantity,updated_by)
        VALUES($1,$2,$3,$4,$5)
        ON CONFLICT(product_id,warehouse_id) DO UPDATE SET minimum_quantity=EXCLUDED.minimum_quantity,target_quantity=EXCLUDED.target_quantity,updated_by=EXCLUDED.updated_by,updated_at=now()
        RETURNING product_id,warehouse_id,minimum_quantity,target_quantity`,[productId,warehouseId,dto.minimumQuantity,dto.targetQuantity,userId]);
      await client.query('INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5)',[userId,'inventory.reorder_level.updated','inventory',`${productId}:${warehouseId}`,JSON.stringify(dto)]);
      return level.rows[0];
    });
  }
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
  async listPickQueue() { return (await this.db.query(`SELECT o.id,o.order_number,w.name AS warehouse_name,COALESCE(SUM(oi.quantity),0) AS item_count
    FROM orders o
    JOIN stock_reservations sr ON sr.reference_type='checkout' AND sr.reference_id=o.checkout_id AND sr.status='ACTIVE'
    JOIN warehouses w ON w.id=sr.warehouse_id
    JOIN order_items oi ON oi.order_id=o.id
    LEFT JOIN picking_sessions ps ON ps.order_id=o.id
    WHERE o.status='PAID' AND ps.id IS NULL
    GROUP BY o.id,w.name
    ORDER BY o.created_at ASC LIMIT 100`)).rows; }
  async getPick(id:string) {
    const pick = await this.db.query<{id:string;status:string;order_number:string;warehouse_name:string}>(`SELECT ps.id,ps.status,o.order_number,w.name AS warehouse_name FROM picking_sessions ps JOIN orders o ON o.id=ps.order_id JOIN warehouses w ON w.id=ps.warehouse_id WHERE ps.id=$1`,[id]);
    if (!pick.rows[0]) throw new NotFoundException('Toplama listesi bulunamadı');
    const items = await this.db.query<{id:string;product_name:string;sku:string;barcode:string|null;expected_quantity:number;picked_quantity:number;lot_code:string|null;expiry_date:string|null;location_code:string|null}>(`SELECT pi.id,oi.product_name,oi.sku,p.barcode,pi.expected_quantity,pi.picked_quantity,l.lot_code,l.expiry_date,l.location_code FROM picking_items pi JOIN order_items oi ON oi.id=pi.order_item_id LEFT JOIN products p ON p.id=oi.product_id LEFT JOIN LATERAL (SELECT lot_code,expiry_date,location_code FROM inventory_lots WHERE product_id=oi.product_id AND warehouse_id=(SELECT warehouse_id FROM picking_sessions WHERE id=pi.picking_session_id) AND available_quantity>0 ORDER BY expiry_date ASC NULLS LAST LIMIT 1) l ON true WHERE pi.picking_session_id=$1 ORDER BY oi.product_name`,[id]);
    return { ...pick.rows[0], items: items.rows };
  }
  async criticalStock() { return (await this.db.query(`SELECT p.id, p.name, w.name AS warehouse_name, i.physical_quantity, i.reserved_quantity, i.physical_quantity-i.reserved_quantity AS available_quantity FROM inventory i JOIN products p ON p.id=i.product_id JOIN warehouses w ON w.id=i.warehouse_id WHERE i.physical_quantity-i.reserved_quantity <= 5 ORDER BY available_quantity ASC, p.name LIMIT 100`)).rows; }
  async createPick(orderId:string,warehouseId:string,userId:string) { const order=await this.db.query("SELECT id FROM orders WHERE id=$1 AND status='PAID'",[orderId]); if(!order.rowCount) throw new NotFoundException('Paid order not found'); const pick=await this.db.query<{id:string}>('INSERT INTO picking_sessions (order_id,warehouse_id,assigned_to,status) VALUES ($1,$2,$3,$4) RETURNING id',[orderId,warehouseId,userId,'IN_PROGRESS']); const items=await this.db.query<{id:string;quantity:number}>('SELECT id,quantity FROM order_items WHERE order_id=$1',[orderId]); for(const item of items.rows) await this.db.query('INSERT INTO picking_items (picking_session_id,order_item_id,expected_quantity) VALUES ($1,$2,$3)',[pick.rows[0].id,item.id,item.quantity]); return pick.rows[0]; }
  async startQueuedPick(orderId:string,userId:string) { return this.db.transaction(async client=>{
    const order=await client.query<{id:string;checkout_id:string}>('SELECT id,checkout_id FROM orders WHERE id=$1 AND status=\'PAID\' FOR UPDATE',[orderId]);
    if(!order.rowCount) throw new NotFoundException('Hazırlanacak onaylı sipariş bulunamadı');
    const existing=await client.query<{id:string}>('SELECT id FROM picking_sessions WHERE order_id=$1',[orderId]);
    if(existing.rows[0]) return {id:existing.rows[0].id,replayed:true};
    const reservations=await client.query<{warehouse_id:string}>('SELECT warehouse_id FROM stock_reservations WHERE reference_type=\'checkout\' AND reference_id=$1 AND status=\'ACTIVE\' FOR UPDATE',[order.rows[0].checkout_id]);
    const warehouseIds=[...new Set(reservations.rows.map((reservation)=>reservation.warehouse_id))];
    if(warehouseIds.length!==1) throw new ConflictException('Sipariş için tek bir depo rezervasyonu gerekli');
    const pick=await client.query<{id:string}>('INSERT INTO picking_sessions(order_id,warehouse_id,assigned_to,status) VALUES($1,$2,$3,\'IN_PROGRESS\') RETURNING id',[orderId,warehouseIds[0],userId]);
    const items=await client.query<{id:string;quantity:number}>('SELECT id,quantity FROM order_items WHERE order_id=$1',[orderId]);
    for(const item of items.rows) await client.query('INSERT INTO picking_items(picking_session_id,order_item_id,expected_quantity) VALUES($1,$2,$3)',[pick.rows[0].id,item.id,item.quantity]);
    await client.query('INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id) VALUES($1,$2,$3,$4)',[userId,'warehouse.pick.started','order',orderId]);
    return {id:pick.rows[0].id,replayed:false};
  }); }
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
  async scanPickBarcode(pickId:string,barcode:string,userId:string) { return this.db.transaction(async client=>{
    const normalizedBarcode=barcode.trim();
    const item=await client.query<{id:string;expected_quantity:number;picked_quantity:number;status:string;product_name:string}>(`SELECT pi.id,pi.expected_quantity,pi.picked_quantity,ps.status,oi.product_name
      FROM picking_sessions ps
      JOIN picking_items pi ON pi.picking_session_id=ps.id
      JOIN order_items oi ON oi.id=pi.order_item_id
      JOIN products p ON p.id=oi.product_id
      WHERE ps.id=$1 AND p.barcode=$2 FOR UPDATE`,[pickId,normalizedBarcode]);
    const row=item.rows[0];
    if(!row) throw new NotFoundException('Bu barkod toplama listesindeki bir ürüne ait değil');
    if(!['OPEN','IN_PROGRESS'].includes(row.status)) throw new ConflictException('Bu toplama listesi artık taranamaz');
    if(row.picked_quantity>=row.expected_quantity) throw new ConflictException('Bu ürünün sipariş adedi zaten tamamlandı');
    const pickedQuantity=row.picked_quantity+1;
    await client.query('UPDATE picking_items SET picked_quantity=$1 WHERE id=$2',[pickedQuantity,row.id]);
    await client.query('INSERT INTO picking_scans(picking_session_id,picking_item_id,barcode,scanned_by) VALUES ($1,$2,$3,$4)',[pickId,row.id,normalizedBarcode,userId]);
    await client.query('INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata) VALUES ($1,$2,$3,$4,$5)',[userId,'warehouse.pick_item.scanned','picking_item',row.id,JSON.stringify({pickId,barcode:normalizedBarcode,pickedQuantity})]);
    return {id:row.id,pickId,productName:row.product_name,pickedQuantity,expectedQuantity:row.expected_quantity};
  }); }
  async completePick(id:string,userId:string) { return this.db.transaction(async client=>{ const pick=await client.query<{id:string}>('SELECT id FROM picking_sessions WHERE id=$1 AND status IN (\'OPEN\',\'IN_PROGRESS\') FOR UPDATE',[id]); if(!pick.rowCount) throw new NotFoundException('Aktif toplama listesi bulunamadı'); const missing=await client.query('SELECT 1 FROM picking_items WHERE picking_session_id=$1 AND picked_quantity<expected_quantity LIMIT 1',[id]); if(missing.rowCount) throw new Error('Tüm ürünler toplanmadan liste tamamlanamaz'); await client.query('UPDATE picking_sessions SET status=\'COMPLETED\',completed_at=now() WHERE id=$1',[id]); await client.query('INSERT INTO packing_sessions(picking_session_id,packed_by) VALUES ($1,$2)',[id,userId]); return {id,status:'COMPLETED'}; }); }
  async completePacking(pickId:string,userId:string) { return this.db.transaction(async client=>{ const packing=await client.query<{id:string;order_id:string;checkout_id:string}>(`SELECT pk.id,ps.order_id,o.checkout_id FROM packing_sessions pk JOIN picking_sessions ps ON ps.id=pk.picking_session_id JOIN orders o ON o.id=ps.order_id WHERE pk.picking_session_id=$1 AND pk.packed_at IS NULL FOR UPDATE`,[pickId]); if(!packing.rowCount) throw new NotFoundException('Açık paketleme kaydı bulunamadı'); const reservations=await client.query<{id:string;product_id:string;warehouse_id:string;quantity:number}>(`SELECT id,product_id,warehouse_id,quantity FROM stock_reservations WHERE reference_type='checkout' AND reference_id=$1 AND status='ACTIVE' FOR UPDATE`,[packing.rows[0].checkout_id]); for(const reservation of reservations.rows){const stock=await client.query<{physical_quantity:number}>(`UPDATE inventory SET physical_quantity=physical_quantity-$1,reserved_quantity=reserved_quantity-$1,updated_at=now() WHERE product_id=$2 AND warehouse_id=$3 AND physical_quantity >= $1 AND reserved_quantity >= $1 RETURNING physical_quantity`,[reservation.quantity,reservation.product_id,reservation.warehouse_id]);if(!stock.rowCount)throw new ConflictException('Paketleme için rezerve stok bulunamadı');let remaining=reservation.quantity;const lots=await client.query<{id:string;available_quantity:number}>(`SELECT id,available_quantity FROM inventory_lots WHERE product_id=$1 AND warehouse_id=$2 AND available_quantity>0 ORDER BY expiry_date ASC NULLS LAST,created_at ASC FOR UPDATE`,[reservation.product_id,reservation.warehouse_id]);for(const lot of lots.rows){if(remaining<=0)break;const consumed=Math.min(remaining,lot.available_quantity);await client.query('UPDATE inventory_lots SET available_quantity=available_quantity-$1 WHERE id=$2',[consumed,lot.id]);remaining-=consumed;}await client.query(`UPDATE stock_reservations SET status='CONSUMED' WHERE id=$1`,[reservation.id]);await client.query(`INSERT INTO inventory_movements(product_id,warehouse_id,movement_type,quantity_delta,reference_type,reference_id,created_by) VALUES ($1,$2,'FULFILLMENT',$3,'order',$4,$5)`,[reservation.product_id,reservation.warehouse_id,-reservation.quantity,packing.rows[0].order_id,userId]);} const packageBarcode=`TRX-PKG-${Date.now()}`; await client.query('UPDATE packing_sessions SET packed_by=$1,packed_at=now(),verification_code=$2,package_barcode=$2 WHERE id=$3',[userId,packageBarcode,packing.rows[0].id]); await client.query(`UPDATE orders SET status='PROCESSING' WHERE id=$1 AND status='PAID'`,[packing.rows[0].order_id]); return {pickId,status:'READY_FOR_SHIPMENT',packageBarcode}; }); }
}
