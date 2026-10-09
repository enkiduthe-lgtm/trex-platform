import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ShippingProvider, ShippingProviderInput, ShippingProviderResult } from './shipping-provider.interface';
@Injectable()
export class MockShippingProvider implements ShippingProvider {
  async createShipment(_input: ShippingProviderInput): Promise<ShippingProviderResult> { const id = randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase(); return { reference: `mock_ship_${id}`, trackingNumber: `TRX${id}` }; }
}
