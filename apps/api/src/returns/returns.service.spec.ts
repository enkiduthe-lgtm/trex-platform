import { ReturnsService } from './returns.service';
describe('ReturnsService', () => {
  it('rejects a return whose quantity exceeds the ordered quantity', async () => {
    const client = { query: jest.fn().mockResolvedValueOnce({ rowCount: 1 }).mockResolvedValueOnce({ rows: [{ quantity: 1 }] }) };
    const db = { transaction: jest.fn((work) => work(client)) };
    const service = new ReturnsService(db as never);
    await expect(service.request({ orderId: 'order', reason: 'Test', items: [{ orderItemId: 'item', quantity: 2 }] })).rejects.toThrow('Invalid return item quantity');
  });

  it('returns accepted, previously fulfilled items to their original warehouse stock', async () => {
    const client = { query: jest.fn()
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ order_id: 'order' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ product_id: 'product', quantity: 1 }] })
      .mockResolvedValueOnce({ rows: [{ checkout_id: 'checkout' }] })
      .mockResolvedValueOnce({ rows: [{ warehouse_id: 'warehouse' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] }) };
    const db = { transaction: jest.fn((work) => work(client)) };
    await expect(new ReturnsService(db as never).inspect('return', true, 'Uygun', 'user')).resolves.toEqual({ returnId: 'return', status: 'INSPECTED' });
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('physical_quantity=physical_quantity+$1'), [1, 'product', 'warehouse']);
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining("'RECEIPT'"), ['product', 'warehouse', 1, 'return', 'user']);
  });
});
