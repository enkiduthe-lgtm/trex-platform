import { validate } from 'class-validator';
import { CreateCheckoutDto } from './create-checkout.dto';

function request(postalCode?:unknown) {
  return Object.assign(new CreateCheckoutDto(), {
    cartId:'cfb29322-1b9f-47d4-8d78-e5eb16fa6fb8', guestKey:'guest',
    warehouseId:'9f886414-bafe-4503-a1c6-8829bde37cfc', recipientName:'Test',
    contactEmail:'test@example.com',phone:'555',city:'Bursa',district:'Nilufer',
    addressLine:'Test address',reservationMinutes:20,postalCode,
  });
}
describe('Checkout address validation',()=>{
  it('accepts checkout without an optional postal code',async()=>{
    expect(await validate(request())).toHaveLength(0);
  });
  it('accepts a supplied postal code',async()=>{
    expect(await validate(request('16000'))).toHaveLength(0);
  });
  it('rejects an invalid supplied postal code',async()=>{
    expect((await validate(request(16000))).map(error=>error.property)).toContain('postalCode');
    expect((await validate(request('1'.repeat(21)))).map(error=>error.property)).toContain('postalCode');
  });
});
