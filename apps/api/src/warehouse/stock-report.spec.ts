import { WarehouseService } from './warehouse.service';

describe('General Stock Report', () => {
  it('includes products without inventory and uses configured stock warning thresholds without a row limit', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [{ id: 'product', available_quantity: '0', is_critical: true }] });
    const service = new WarehouseService({ query } as never);
    await expect(service.stockReport()).resolves.toEqual([{ id: 'product', available_quantity: '0', is_critical: true }]);
    const sql = query.mock.calls[0][0] as string;
    expect(sql).toContain('products p LEFT JOIN inventory');
    expect(sql).toContain('COALESCE(rl.minimum_quantity,5)');
    expect(sql).toContain('GROUP BY p.id');
    expect(sql).not.toContain('LIMIT');
  });
});
