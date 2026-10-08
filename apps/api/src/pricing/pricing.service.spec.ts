import { PricingService } from './pricing.service';
import { BadRequestException } from '@nestjs/common';
import { PriceScope, SalesChannel } from './dto/create-price.dto';
describe('PricingService', () => {
  const actor = { id:'actor',email:'test@example.com',role:'ADMIN' as const,sessionId:'session' };
  const dto = { productId:'product',scope:PriceScope.GLOBAL,amount:100 };
  function setup(query: jest.Mock) {
    const transaction = jest.fn(async work => work({query}));
    return { transaction, service:new PricingService({transaction} as never) };
  }
  it('creates price and audit using one transaction', async () => {
    const query = jest.fn().mockResolvedValueOnce({rows:[{id:'price'}]}).mockResolvedValue({rows:[]});
    const s = setup(query);
    await expect(s.service.create(dto,actor)).resolves.toEqual({id:'price'});
    expect(s.transaction).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[1][1]).toEqual(['actor','price.created','product_price','price']);
  });
  it('fails the transaction if audit cannot be written', async () => {
    const query = jest.fn().mockResolvedValueOnce({rows:[{id:'price'}]}).mockRejectedValueOnce(new Error('audit failed'));
    await expect(setup(query).service.create(dto,actor)).rejects.toThrow('audit failed');
  });
  it('validates target before starting a transaction', async () => {
    const s = setup(jest.fn());
    await expect(s.service.create({...dto,channel:SalesChannel.PUBLIC_WEB},actor)).rejects.toBeInstanceOf(BadRequestException);
    expect(s.transaction).not.toHaveBeenCalled();
  });
  it('rejects invalid date ranges before writing', async () => {
    const s = setup(jest.fn());
    await expect(s.service.create({...dto,startsAt:'2026-10-07T12:00:00Z',endsAt:'2026-10-07T11:00:00Z'},actor)).rejects.toBeInstanceOf(BadRequestException);
    expect(s.transaction).not.toHaveBeenCalled();
  });
  it('returns the highest-priority effective price selected by the database', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [{ id: 'rule', amount: '99.90', currency: 'TRY', scope: 'DEALER', starts_at: new Date('2026-01-01') }] }) };
    const service = new PricingService(db as never);
    await expect(service.resolve('product', { channel: SalesChannel.DEALER_PORTAL, dealerId: 'dealer' })).resolves.toMatchObject({ source: PriceScope.DEALER, amount: '99.90' });
  });
});
