import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { MockShippingProvider } from './mock-shipping.provider';
interface Address { recipient_name: string; phone: string; city: string; district: string; address_line: string; }
@Injectable()
export class ShippingService {
  constructor(private readonly db: DatabaseService, private readonly provider: MockShippingProvider) {}
  async create(orderId: string) {
    const existing = await this.db.query<{ id: string; status: string; tracking_number: string | null }>('SELECT id,status,tracking_number FROM shipments WHERE order_id=$1', [orderId]);
    if (existing.rows[0]?.status === 'CREATED') return { shipmentId: existing.rows[0].id, trackingNumber: existing.rows[0].tracking_number, replayed: true };
    const order = await this.db.query<{ id: string }>("SELECT id FROM orders WHERE id=$1 AND status IN ('PAID','PROCESSING')", [orderId]); if (!order.rows[0]) throw new NotFoundException('Shippable order not found');
    const address = await this.db.query<Address>('SELECT recipient_name,phone,city,district,address_line FROM order_addresses WHERE order_id=$1', [orderId]); if (!address.rows[0]) throw new ConflictException('Order address missing');
    try {
      const created = await this.provider.createShipment({ orderId, recipientName: address.rows[0].recipient_name, phone: address.rows[0].phone, city: address.rows[0].city, district: address.rows[0].district, addressLine: address.rows[0].address_line });
      const shipment = await this.db.query<{ id: string }>("INSERT INTO shipments (order_id,provider,tracking_number,status,provider_reference) VALUES ($1,'mock',$2,'CREATED',$3) ON CONFLICT (order_id) DO UPDATE SET tracking_number=EXCLUDED.tracking_number,status='CREATED',provider_reference=EXCLUDED.provider_reference,failure_reason=NULL,updated_at=now() RETURNING id", [orderId, created.trackingNumber, created.reference]);
      await this.db.query("INSERT INTO shipment_events (shipment_id,status,provider_event_id,description) VALUES ($1,'CREATED',$2,'Shipment created') ON CONFLICT DO NOTHING", [shipment.rows[0].id, created.reference]);
      await this.db.query("UPDATE orders SET status='PROCESSING' WHERE id=$1 AND status='PAID'", [orderId]);
      return { shipmentId: shipment.rows[0].id, trackingNumber: created.trackingNumber, replayed: false };
    } catch (error) {
      await this.db.query("INSERT INTO shipments (order_id,provider,status,failure_reason) VALUES ($1,'mock','FAILED',$2) ON CONFLICT (order_id) DO UPDATE SET status='FAILED',failure_reason=EXCLUDED.failure_reason,updated_at=now()", [orderId, error instanceof Error ? error.message : 'Unknown provider failure']);
      throw error;
    }
  }
}
