import { InventoryService } from './inventory.service';
describe('InventoryService', () => {
  it('rejects reservations that exceed available stock while holding the row lock', async () => {
    const client = { query: jest.fn().mockResolvedValueOnce({ rows: [{ physical_quantity: 3, reserved_quantity: 2 }] }) };
    const db = { transaction: async (work: (client: unknown) => unknown) => work(client) };
    const service = new InventoryService(db as never);
    await expect(service.reserve({ productId: '4bdffd0f-cd9d-4665-aa05-2b1cbb6c224b', warehouseId: '3f37a9a4-83bc-4a1b-98c2-66043c1af27a', referenceId: 'f1ef9cf6-9ee6-453d-a15e-25e9c0573b6c', quantity: 2, ttlMinutes: 10 })).rejects.toThrow('Insufficient available stock');
    expect(client.query.mock.calls[0][0]).toContain('FOR UPDATE');
  });
});
