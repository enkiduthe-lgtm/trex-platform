import { PaymentsService } from './payments.service';
import { createHmac } from 'crypto';

describe('PaymentsService', () => {
  it('does not persist a payment when checkout expires during provider initialization',async()=>{
    const previous=process.env.PAYMENT_PROVIDER;process.env.PAYMENT_PROVIDER='paytr';
    try{
      const db={query:jest.fn().mockResolvedValueOnce({rows:[{id:'checkout',total_amount:'10',currency:'TRY'}]}).mockResolvedValueOnce({rows:[]}).mockResolvedValueOnce({rows:[]})};
      const service=new PaymentsService(db as never,{} as never);
      jest.spyOn(service as any,'initializePaytr').mockResolvedValue({providerReference:'reference',redirectUrl:'https://example.com'});
      await expect(service.initialize('checkout','guest')).rejects.toThrow('sepetin süresi doldu');
      expect(db.query).toHaveBeenCalledTimes(3);
      expect(db.query.mock.calls[2][0]).toContain("status='OPEN' AND expires_at>now()");
    }finally{if(previous===undefined)delete process.env.PAYMENT_PROVIDER;else process.env.PAYMENT_PROVIDER=previous;}
  });
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

  it('turns a signed matching PayTR success callback into one order completion', async () => {
    const previousKey = process.env.PAYTR_MERCHANT_KEY; const previousSalt = process.env.PAYTR_MERCHANT_SALT;
    process.env.PAYTR_MERCHANT_KEY = 'test-key'; process.env.PAYTR_MERCHANT_SALT = 'test-salt';
    const hash = createHmac('sha256', 'test-key').update('order-2test-saltsuccess12500').digest('base64');
    const query = jest.fn().mockResolvedValueOnce({ rowCount: 1 }).mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'payment-1', status: 'PENDING' }] });
    const service = new PaymentsService({ transaction: async (work: (client: unknown) => Promise<unknown>) => work({ query }) } as never, {} as never);
    const complete = jest.spyOn(service as any, 'completeSuccessfulPayment').mockResolvedValue({ status: 'SUCCEEDED', orderId: 'order-2', orderNumber: '20261005-000001', replayed: false });
    await expect(service.receivePaytrCallback({ merchant_oid: 'order-2', status: 'success', total_amount: '12500', hash })).resolves.toMatchObject({ response: 'OK', matched: true, orderId: 'order-2' });
    expect(complete).toHaveBeenCalledWith(expect.anything(), 'payment-1');
    process.env.PAYTR_MERCHANT_KEY = previousKey; process.env.PAYTR_MERCHANT_SALT = previousSalt;
  });

  it('does not create a second manual-payment order for the same checkout', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce({ rows: [{ id: 'checkout', total_amount: '125.00', currency: 'TRY' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'payment', provider_reference: 'bank_transfer_ref', status: 'PENDING' }] });
    const service = new PaymentsService({ transaction: async (work: (client: unknown) => Promise<unknown>) => work({ query }) } as never, {} as never);
    await expect(service.initializeManual('checkout', 'guest-key', 'TRANSFER')).resolves.toEqual({ paymentId: 'payment', providerReference: 'bank_transfer_ref', status: 'PENDING', replayed: true });
  });
});
