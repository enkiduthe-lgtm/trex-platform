import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ShippingProvider } from './shipping-provider.interface';
@Injectable()
export class MockShippingProvider implements ShippingProvider {
  async createShipment(_input: { orderId: string; recipientName: string; phone: string; city: string; district: string; addressLine: string }): Promise<{ reference: string; trackingNumber: string }> { const id = randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase(); return { reference: `mock_ship_${id}`, trackingNumber: `TRX${id}` }; }
}
