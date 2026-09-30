import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PaymentProvider } from './payment-provider.interface';
@Injectable()
export class MockPaymentProvider implements PaymentProvider {
  async initialize(_input: { amount: string; currency: string; reference: string }): Promise<{ providerReference: string }> { return { providerReference: `mock_${randomUUID()}` }; }
  // Production adapters must verify signed provider callbacks; mock always approves explicit verification.
  async verify(_providerReference: string): Promise<'SUCCEEDED'> { return 'SUCCEEDED'; }
}
