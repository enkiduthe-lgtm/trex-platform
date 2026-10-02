import { PaymentsService } from './payments.service';

describe('PaymentsService', () => {
  it('returns an existing payment instead of creating a duplicate initialization', async () => {
    const db = { query: jest.fn().mockResolvedValueOnce({ rows: [{ id: 'checkout', total_amount: '99.00', currency: 'TRY' }] }).mockResolvedValueOnce({ rows: [{ id: 'payment', provider_reference: 'mock_ref', status: 'PENDING' }] }) };
    const service = new PaymentsService(db as never, {} as never);
    await expect(service.initialize('checkout','guest-key')).resolves.toEqual({ paymentId: 'payment', providerReference: 'mock_ref', status: 'PENDING' });
  });
});
