import { BadRequestException } from '@nestjs/common';
import { PricingController } from './pricing.controller';
import { SalesChannel } from './dto/create-price.dto';
describe('Public pricing channel boundary', () => {
  it.each([SalesChannel.ADMIN_ORDER, SalesChannel.DEALER_PORTAL, 'UNKNOWN', ''])('rejects channel %s before resolving prices', channel => {
    const pricing = { resolve: jest.fn() };
    expect(() => new PricingController(pricing as never).resolve('product', channel as SalesChannel)).toThrow(BadRequestException);
    expect(pricing.resolve).not.toHaveBeenCalled();
  });
  it('defaults to public storefront pricing', () => {
    const pricing = { resolve: jest.fn().mockReturnValue({ amount:'10.00' }) };
    expect(new PricingController(pricing as never).resolve('product')).toEqual({ amount:'10.00' });
    expect(pricing.resolve).toHaveBeenCalledWith('product', { channel:SalesChannel.PUBLIC_WEB });
  });
});
