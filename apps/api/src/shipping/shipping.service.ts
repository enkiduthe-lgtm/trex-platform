import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { MockShippingProvider } from './mock-shipping.provider';
import { ArasShippingProvider } from './aras-shipping.provider';
import { ShippingProvider } from './shipping-provider.interface';
import { assertMockIntegrationAllowed } from '../config/mock-integration-policy';
import { UpdateShipmentStatusDto } from './dto/update-shipment-status.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { CommissionsService } from '../commissions/commissions.service';
interface Address { recipient_name: string; phone: string; city: string; district: string; address_line: string; postal_code: string | null; }
@Injectable()
export class ShippingService {
  constructor(private readonly db: DatabaseService, private readonly mock: MockShippingProvider, private readonly aras: ArasShippingProvider, private readonly notifications?: NotificationsService,private readonly commissions?:CommissionsService) {}
  private provider(): { name: 'mock' | 'aras'; client: ShippingProvider } {
    if (process.env.SHIPPING_PROVIDER === 'aras') return { name: 'aras', client: this.aras };
    assertMockIntegrationAllowed('SHIPPING_PROVIDER');
    return { name: 'mock', client: this.mock };
  }
  async status() { const provider = process.env.SHIPPING_PROVIDER === 'aras' ? 'aras' : 'mock'; const fields = ['ARAS_CUSTOMER_CODE','ARAS_SET_ORDER_USERNAME','ARAS_SET_ORDER_PASSWORD','ARAS_SET_ORDER_ENDPOINT']; return { provider, ready: provider === 'aras' && fields.every(field=>Boolean(process.env[field])), missing: provider === 'aras' ? fields.filter(field=>!process.env[field]) : [] }; }
  async list() { return (await this.db.query(`SELECT s.id,s.order_id,s.provider,s.tracking_number,s.status,s.label_url,s.label_format,s.failure_reason,s.created_at,s.updated_at,s.dispatched_at,s.delivered_at,o.order_number,o.total_amount,o.currency,oa.recipient_name,oa.city,oa.district,pk.package_barcode FROM shipments s JOIN orders o ON o.id=s.order_id LEFT JOIN order_addresses oa ON oa.order_id=o.id LEFT JOIN picking_sessions ps ON ps.order_id=o.id LEFT JOIN packing_sessions pk ON pk.picking_session_id=ps.id ORDER BY s.created_at DESC LIMIT 100`)).rows; }
  async readyToShip() { return (await this.db.query(`SELECT o.id AS order_id,o.order_number,o.total_amount,o.currency,oa.recipient_name,oa.city,oa.district,pk.package_barcode
    FROM orders o
    LEFT JOIN order_addresses oa ON oa.order_id=o.id
    LEFT JOIN picking_sessions ps ON ps.order_id=o.id
    LEFT JOIN packing_sessions pk ON pk.picking_session_id=ps.id
    LEFT JOIN shipments s ON s.order_id=o.id
    WHERE o.status='PROCESSING' AND s.id IS NULL
    ORDER BY o.created_at ASC LIMIT 100`)).rows; }
  async detail(orderId: string) { const shipment=await this.db.query(`SELECT s.id,s.order_id,s.provider,s.tracking_number,s.status,s.label_url,s.label_format,s.failure_reason,s.created_at,s.updated_at,s.dispatched_at,s.delivered_at,o.order_number,pk.package_barcode FROM shipments s JOIN orders o ON o.id=s.order_id LEFT JOIN picking_sessions ps ON ps.order_id=o.id LEFT JOIN packing_sessions pk ON pk.picking_session_id=ps.id WHERE s.order_id=$1`,[orderId]); if(!shipment.rows[0]) return null; const events=await this.db.query('SELECT id,status,provider_event_id,description,occurred_at FROM shipment_events WHERE shipment_id=$1 ORDER BY occurred_at DESC,id DESC',[shipment.rows[0].id]); return {...shipment.rows[0],events:events.rows}; }
  async updateStatus(orderId:string,dto:UpdateShipmentStatusDto,userId:string){
    const changed=await this.db.transaction(async client=>{
      const result=await client.query<{id:string;status:string;order_status:string;contact_email:string|null;order_number:string}>('SELECT s.id,s.status,o.status AS order_status,cs.contact_email,o.order_number FROM shipments s JOIN orders o ON o.id=s.order_id LEFT JOIN checkout_sessions cs ON cs.id=o.checkout_id WHERE s.order_id=$1 FOR UPDATE OF s,o',[orderId]);
      const shipment=result.rows[0];if(!shipment)throw new NotFoundException('Gönderi Kaydı Bulunamadı');
      const replayed=shipment.status===dto.status;
      const allowed:Record<string,string[]>={CREATED:['IN_TRANSIT','FAILED','CANCELLED'],IN_TRANSIT:['DELIVERED','FAILED'],FAILED:[],DELIVERED:[],CANCELLED:[]};
      if(!replayed&&!allowed[shipment.status]?.includes(dto.status))throw new ConflictException('Bu Gönderi Durum Geçişine İzin Verilmiyor');
      const nextOrder=dto.status==='IN_TRANSIT'?'SHIPPED':dto.status==='DELIVERED'?'DELIVERED':null;
      if(nextOrder&& !['PROCESSING','SHIPPED','DELIVERED'].includes(shipment.order_status))throw new ConflictException('Ödeme Ve Hazırlık Kontrolü Tamamlanmadan Kargo İlerletilemez');
      if(nextOrder&&shipment.order_status!==nextOrder){
        if(shipment.order_status==='DELIVERED')throw new ConflictException('Teslim Edilmiş Sipariş Geri Alınamaz');
        await client.query('UPDATE orders SET status=$1 WHERE id=$2',[nextOrder,orderId]);
        await client.query('INSERT INTO order_status_history(order_id,status,actor_user_id) VALUES($1,$2,$3)',[orderId,nextOrder,userId]);
      }
      if(!replayed){
        await client.query("UPDATE shipments SET status=$1,dispatched_at=CASE WHEN $1='IN_TRANSIT' THEN COALESCE(dispatched_at,now()) ELSE dispatched_at END,delivered_at=CASE WHEN $1='DELIVERED' THEN COALESCE(delivered_at,now()) ELSE delivered_at END,failure_reason=CASE WHEN $1='FAILED' THEN COALESCE($2,failure_reason,'Teslimat Sorunu') ELSE NULL END,updated_at=now() WHERE id=$3",[dto.status,dto.description?.trim()||null,shipment.id]);
        await client.query('INSERT INTO shipment_events(shipment_id,status,provider_event_id,description) VALUES($1,$2,$3,$4)',[shipment.id,dto.status,'manual:'+dto.status+':'+Date.now(),dto.description?.trim()||'Yönetim Panelinden Durum Güncellendi']);
        await client.query('INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5)',[userId,'shipment.status_updated','shipment',shipment.id,JSON.stringify({from:shipment.status,to:dto.status})]);
      }
      if(dto.status==='DELIVERED'&&this.commissions){
        await this.commissions.awardForDeliveredOrder(orderId,userId,client);
        const dealer=(await client.query<{dealer_id:string}>("SELECT COALESCE((a.metadata->>'dealerId')::uuid,dua.dealer_id) AS dealer_id FROM audit_logs a LEFT JOIN dealer_user_accounts dua ON dua.user_id=a.actor_user_id WHERE a.entity_type='order' AND a.entity_id=$1 AND a.action IN ('order.dealer.created','order.admin.created') ORDER BY a.created_at LIMIT 1",[orderId])).rows[0];
        if(dealer?.dealer_id){const items=await client.query<{id:string;product_id:string;quantity:number}>('SELECT id,product_id,quantity FROM order_items WHERE order_id=$1 ORDER BY id',[orderId]);for(const item of items.rows)await this.commissions.confirmForOrderItem({dealerId:dealer.dealer_id,orderId,orderItemId:item.id,productId:item.product_id,quantity:item.quantity},client);}
      }
      return {id:shipment.id,status:dto.status,recipient:shipment.contact_email,orderNumber:shipment.order_number,replayed};
    });
    const notification=changed.status==='IN_TRANSIT'?'SHIPPED':changed.status==='DELIVERED'?'DELIVERED':changed.status==='FAILED'?'DELIVERY_EXCEPTION':null;
    if(notification&&!changed.replayed)await this.notifications?.recordOrderStatus(changed.recipient,changed.orderNumber,notification);
    return {id:changed.id,status:changed.status};
  }
  async create(orderId: string, userId?: string) {
    const existing = await this.db.query<{ id: string; status: string; tracking_number: string | null }>('SELECT id,status,tracking_number FROM shipments WHERE order_id=$1', [orderId]);
    if (existing.rows[0]?.status === 'CREATED') return { shipmentId: existing.rows[0].id, trackingNumber: existing.rows[0].tracking_number, replayed: true };
    const order = await this.db.query<{ id: string; order_number:string }>("SELECT id,order_number FROM orders WHERE id=$1 AND status='PROCESSING'", [orderId]); if (!order.rows[0]) throw new NotFoundException('Kargolanabilir sipariş bulunamadı. Sipariş önce paketleme adımını tamamlamalıdır.');
    const address = await this.db.query<Address>('SELECT recipient_name,phone,city,district,address_line,postal_code FROM order_addresses WHERE order_id=$1', [orderId]); if (!address.rows[0]) throw new ConflictException('Sipariş teslimat adresi bulunamadı');
    const packed = await this.db.query<{ package_barcode: string | null }>(`SELECT pk.package_barcode FROM packing_sessions pk JOIN picking_sessions ps ON ps.id=pk.picking_session_id WHERE ps.order_id=$1 AND pk.packed_at IS NOT NULL ORDER BY pk.packed_at DESC LIMIT 1`, [orderId]);
    if (!packed.rows[0]?.package_barcode) throw new ConflictException('Kargo kaydı için paketleme tamamlanmalı ve paket barkodu oluşturulmuş olmalı');
    const configured = this.provider();
    try {
      const created = await configured.client.createShipment({ orderId, orderNumber:order.rows[0].order_number, recipientName: address.rows[0].recipient_name, phone: address.rows[0].phone, city: address.rows[0].city, district: address.rows[0].district, addressLine: address.rows[0].address_line, postalCode:address.rows[0].postal_code, packageBarcode: packed.rows[0].package_barcode });
      const shipment = await this.db.query<{ id: string }>(`INSERT INTO shipments (order_id,provider,tracking_number,status,provider_reference,label_url,label_format,provider_payload) VALUES ($1,$2,$3,'CREATED',$4,$5,$6,$7) ON CONFLICT (order_id) DO UPDATE SET provider=EXCLUDED.provider,tracking_number=EXCLUDED.tracking_number,status='CREATED',provider_reference=EXCLUDED.provider_reference,label_url=EXCLUDED.label_url,label_format=EXCLUDED.label_format,provider_payload=EXCLUDED.provider_payload,failure_reason=NULL,updated_at=now() RETURNING id`, [orderId, configured.name, created.trackingNumber, created.reference,created.labelUrl??null,created.labelFormat??null,created.payload?JSON.stringify(created.payload):null]);
      await this.db.query("INSERT INTO shipment_events (shipment_id,status,provider_event_id,description) VALUES ($1,'CREATED',$2,$3) ON CONFLICT DO NOTHING", [shipment.rows[0].id, created.reference,configured.name==='aras'?'Aras Kargo gönderi kaydı oluşturuldu':'Deneme kargo gönderi kaydı oluşturuldu']);
      await this.db.query('INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata) VALUES ($1,$2,$3,$4,$5)',[userId??null,'shipment.created','shipment',shipment.rows[0].id,JSON.stringify({provider:configured.name,orderId,trackingNumber:created.trackingNumber})]);
      return { shipmentId: shipment.rows[0].id, trackingNumber: created.trackingNumber, labelUrl:created.labelUrl, replayed: false };
    } catch (error) {
      await this.db.query("INSERT INTO shipments (order_id,provider,status,failure_reason) VALUES ($1,$2,'FAILED',$3) ON CONFLICT (order_id) DO UPDATE SET provider=EXCLUDED.provider,status='FAILED',failure_reason=EXCLUDED.failure_reason,updated_at=now()", [orderId,configured.name,error instanceof Error ? error.message : 'Bilinmeyen kargo sağlayıcı hatası']);
      await this.db.query('INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata) VALUES ($1,$2,$3,$4,$5)',[userId??null,'shipment.creation_failed','order',orderId,JSON.stringify({provider:configured.name,error:error instanceof Error ? error.message : 'Bilinmeyen kargo sağlayıcı hatası'})]);
      throw error;
    }
  }
}
