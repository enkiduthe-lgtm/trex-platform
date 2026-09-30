import { PricingService } from './pricing.service';
import { PriceScope, SalesChannel } from './dto/create-price.dto';
describe('PricingService', () => {
  it('returns the highest-priority effective price selected by the database', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [{ id: 'rule', amount: '99.90', currency: 'TRY', scope: 'DEALER', starts_at: new Date('2026-01-01') }] }) };
    const service = new PricingService(db as never);
    await expect(service.resolve('product', { channel: SalesChannel.DEALER_PORTAL, dealerId: 'dealer' })).resolves.toMatchObject({ source: PriceScope.DEALER, amount: '99.90' });
  });
});
