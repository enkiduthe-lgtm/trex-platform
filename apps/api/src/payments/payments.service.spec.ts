import { PaymentsService } from './payments.service';
import { createHmac } from 'crypto';

describe('PaymentsService', () => {
  it('returns an existing payment instead of creating a duplicate initialization', async () => {
    const db = { query: jest.fn().mockResolvedValueOnce({ rows: [{ id: 'checkout', total_amount: '99.00', currency: 'TRY' }] }).mockResolvedValueOnce({ rows: [{ id: 'payment', provider_reference: 'mock_ref', status: 'PENDING' }] }) };
    const service = new PaymentsService(db as never, {} as never);
    await expect(service.initialize('checkout','guest-key')).resolves.toEqual({ paymentId: 'payment', providerReference: 'mock_ref', status: 'PENDING' });
  });

  it('rejects a PayTR callback whose signature is not valid', async () => {
    const previousKey = process.env.PAYTR_MERCHANT_KEY; const previousSalt = process.env.PAYTR_MERCHANT_SALT;
    process.env.PAYTR_MERCHANT_KEY = 'test-key'; process.env.PAYTR_MERCHANT_SALT = 'test-salt';
    const service = new PaymentsService({ transaction: jest.fn() } as never, {} as never);
    await expect(service.receivePaytrCallback({ merchant_oid: 'order-1', status: 'success', total_amount: '10000', hash: 'invalid' })).rejects.toThrow('Geçersiz PayTR bildirimi');
    process.env.PAYTR_MERCHANT_KEY = previousKey; process.env.PAYTR_MERCHANT_SALT = previousSalt;
  });

  it('accepts a correctly signed PayTR callback without exposing secrets', async () => {
    const previousKey = process.env.PAYTR_MERCHANT_KEY; const previousSalt = process.env.PAYTR_MERCHANT_SALT;
    process.env.PAYTR_MERCHANT_KEY = 'test-key'; process.env.PAYTR_MERCHANT_SALT = 'test-salt';
    const hash = createHmac('sha256', 'test-key').update('order-1test-saltsuccess10000').digest('base64');
    const query = jest.fn().mockResolvedValueOnce({ rowCount: 1 }).mockResolvedValueOnce({ rowCount: 0, rows: [] });
    const service = new PaymentsService({ transaction: async (work: (client: unknown) => Promise<unknown>) => work({ query }) } as never, {} as never);
    await expect(service.receivePaytrCallback({ merchant_oid: 'order-1', status: 'success', total_amount: '10000', hash })).resolves.toEqual({ response: 'OK', accepted: true, matched: false });
    process.env.PAYTR_MERCHANT_KEY = previousKey; process.env.PAYTR_MERCHANT_SALT = previousSalt;
  });
});
