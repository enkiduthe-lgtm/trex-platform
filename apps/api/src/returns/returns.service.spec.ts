import { ReturnsService } from './returns.service';
describe('ReturnsService', () => {
  it('rejects a return whose quantity exceeds the ordered quantity', async () => {
    const db = { query: jest.fn().mockResolvedValueOnce({ rowCount: 1 }).mockResolvedValueOnce({ rows: [{ id: 'return' }] }).mockResolvedValueOnce({ rows: [{ quantity: 1 }] }) };
    const service = new ReturnsService(db as never);
    await expect(service.request({ orderId: 'order', reason: 'Test', items: [{ orderItemId: 'item', quantity: 2 }] })).rejects.toThrow('Invalid return item quantity');
  });
});
