import { ReturnsService } from './returns.service';

describe('ReturnsService', () => {
  it('rejects a return whose quantity exceeds the ordered quantity', async () => {
    const client = { query: jest.fn().mockResolvedValueOnce({ rowCount: 1 }).mockResolvedValueOnce({ rows: [{ quantity: 1 }] }) };
    const db = { transaction: jest.fn((work) => work(client)) };
    await expect(new ReturnsService(db as never).request({ orderId: 'order', contactEmail: 'buyer@example.com', reason: 'Test', items: [{ orderItemId: 'item', quantity: 2 }] })).rejects.toThrow('İade miktarı sipariş miktarını aşıyor');
  });

  it('returns sellable items to the selected warehouse and records their disposition', async () => {
    const client = { query: jest.fn()
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ order_id: 'order' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'warehouse' }] })
      .mockResolvedValueOnce({ rows: [{ return_item_id: 'return-item', product_id: 'product', quantity: 1 }] })
      .mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] }) };
    const db = { transaction: jest.fn((work) => work(client)) };
    await expect(new ReturnsService(db as never).inspect('return', { warehouseId: 'warehouse', disposition: 'SELLABLE', notes: 'Uygun' }, 'user')).resolves.toEqual({ returnId: 'return', status: 'INSPECTED', disposition: 'SELLABLE' });
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('physical_quantity=inventory.physical_quantity+EXCLUDED.physical_quantity'), ['product', 'warehouse', 1]);
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining("'RECEIPT'"), ['product', 'warehouse', 'RECEIPT', 1, 'return', 'user']);
  });
});
