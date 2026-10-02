import { CheckoutService } from './checkout.service';
import { ConflictException } from '@nestjs/common';
import { createHash } from 'crypto';
describe('CheckoutService', () => {
  const dto = { cartId: 'cfb29322-1b9f-47d4-8d78-e5eb16fa6fb8', guestKey: 'guest', warehouseId: '9f886414-bafe-4503-a1c6-8829bde37cfc', recipientName: 'Trex Test', contactEmail: 'test@trextea.com.tr', phone: '555', city: 'Istanbul', district: 'Kadikoy', addressLine: 'Test', reservationMinutes: 10 };
  it('rejects a repeated idempotency key when its request changes', async () => {
    const client = { query: jest.fn().mockResolvedValueOnce({ rows: [{ request_hash: 'different', resource_id: 'existing' }] }) };
    const db = { transaction: async (work: (client: unknown) => unknown) => work(client) };
    const service = new CheckoutService(db as never, {} as never);
    await expect(service.create(dto, 'repeat-key')).rejects.toBeInstanceOf(ConflictException);
  });
  it('replays the original checkout without a second stock reservation', async () => {
    const requestHash = createHash('sha256').update(JSON.stringify(dto)).digest('hex');
    const client = { query: jest.fn().mockResolvedValueOnce({ rows: [{ request_hash: requestHash, resource_id: 'existing' }] }) };
    const db = { transaction: async (work: (client: unknown) => unknown) => work(client) };
    const service = new CheckoutService(db as never, {} as never);
    await expect(service.create(dto, 'repeat-key')).resolves.toEqual({ checkoutId: 'existing', replayed: true });
    expect(client.query).toHaveBeenCalledTimes(1);
  });
});
