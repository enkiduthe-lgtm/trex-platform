import { OrdersService } from './orders.service';

describe('Selected order export lines', () => {
  const id = '7045b6f1-3181-49ce-a919-15ae126507d0';
  it('binds unique selected IDs and excludes archived orders', async () => {
    const rows = [{ id, product_name: 'Product', quantity: 5, unit_amount: '10.00', line_total: '50.00' }];
    const query = jest.fn().mockResolvedValue({ rows });
    expect(await new OrdersService({ query } as never).exportLines([id, id])).toEqual(rows);
    expect(query.mock.calls[0][1]).toEqual([null, null, null, null, null, null, [id]]);
    expect(query.mock.calls[0][0]).toContain('o.id=ANY($7::uuid[]) AND o.archived_at IS NULL');
    expect(query.mock.calls[0][0]).toContain('oi.quantity*oi.unit_amount');
  });
  it.each([{ ids: [] }, { ids: ['invalid'] }, { ids: Array(101).fill(id) }])('rejects invalid or oversized selections before reading orders', async ({ ids }) => {
    const query = jest.fn();
    await expect(new OrdersService({ query } as never).exportLines(ids)).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });
});
