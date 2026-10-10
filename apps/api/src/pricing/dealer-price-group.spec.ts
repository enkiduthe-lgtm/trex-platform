import { BadRequestException } from '@nestjs/common';
import { PricingService } from './pricing.service';
import { PriceScope } from './dto/create-price.dto';

describe('dealer price group pricing', () => {
  it('accepts a price group target without mixing other scopes', () => {
    const service = new PricingService({} as never);
    const validate = (service as unknown as { targetIsValid(dto: unknown): boolean }).targetIsValid.bind(service);
    expect(validate({ scope: PriceScope.DEALER_PRICE_GROUP, dealerPriceGroupId: 'group-id' })).toBe(true);
    expect(validate({ scope: PriceScope.DEALER_PRICE_GROUP, dealerPriceGroupId: 'group-id', dealerId: 'dealer-id' })).toBe(false);
  });
  it('rejects an ambiguous group price before writing', async () => {
    const service = new PricingService({ transaction: jest.fn() } as never);
    await expect(service.create({ productId: 'p', scope: PriceScope.DEALER_PRICE_GROUP, amount: 10, dealerPriceGroupId: 'g', channel: 'DEALER_PORTAL' } as never, { id: 'u' } as never)).rejects.toBeInstanceOf(BadRequestException);
  });
});
