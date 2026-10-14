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
    await expect(new ReturnsService(db as never).inspect('return', { warehouseId: 'warehouse', disposition: 'SELLABLE', notes: 'Uygun' }, 'user')).resolves.toEqual({ returnId: 'return', status: 'INSPECTED', dispositions: [{ returnItemId: 'return-item', disposition: 'SELLABLE' }] });
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('physical_quantity=inventory.physical_quantity+EXCLUDED.physical_quantity'), ['product', 'warehouse', 1]);
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining("'RECEIPT'"), ['product', 'warehouse', 'RECEIPT', 1, 'return', 'user']);
  });

  it('uses each item disposition when recording a mixed return', async () => {
    const client = { query: jest.fn((sql: string) => {
      if (sql.includes("UPDATE returns SET status='INSPECTED'")) return Promise.resolve({ rowCount: 1, rows: [{ order_id: 'order' }] });
      if (sql.includes('SELECT id FROM warehouses')) return Promise.resolve({ rowCount: 1, rows: [{ id: 'warehouse' }] });
      if (sql.includes('SELECT ri.id AS return_item_id')) return Promise.resolve({ rows: [
        { return_item_id: 'sellable', product_id: 'tea-1', quantity: 1 },
        { return_item_id: 'damaged', product_id: 'tea-2', quantity: 2 },
      ] });
      return Promise.resolve({ rows: [] });
    }) };
    const db = { transaction: jest.fn((work) => work(client)) };
    await new ReturnsService(db as never).inspect('return', {
      warehouseId: 'warehouse',
      items: [
        { returnItemId: 'sellable', disposition: 'SELLABLE' },
        { returnItemId: 'damaged', disposition: 'DAMAGED' },
      ],
    }, 'user');
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining("'RECEIPT'"), ['tea-1', 'warehouse', 'RECEIPT', 1, 'return', 'user']);
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining("'RETURN_DAMAGED'"), ['tea-2', 'warehouse', 'RETURN_DAMAGED', 0, 'return', 'user']);
  });
});
