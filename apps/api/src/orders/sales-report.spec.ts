import { OrdersService } from './orders.service';
import { DatabaseService } from '../database/database.service';

describe('Detailed Sales Report', () => {
  const query = jest.fn().mockResolvedValue({ rows: [] });
  const service = new OrdersService({ query } as unknown as DatabaseService);
  beforeEach(() => query.mockClear());

  it.each([
    ['2026-02-30', '2026-03-01'],
    ['invalid', '2026-03-01'],
    ['2026-03-02', '2026-03-01'],
  ])('rejects invalid or reversed dates without querying records', async (from, to) => {
    await expect(service.salesReport(from, to)).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects an unknown status before querying records', async () => {
    await expect(service.salesReport(undefined, undefined, undefined, undefined, 'UNKNOWN')).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });

  it('binds every filter and uses Istanbul date boundaries', async () => {
    await service.salesReport('2026-10-01', '2026-10-29', 'wholesale', ' Coffee ', 'PAID', " O'Neil ", undefined, 'USD');
    expect(query).toHaveBeenCalledWith(expect.stringContaining("AT TIME ZONE 'Europe/Istanbul'"),
      ['2026-10-01', '2026-10-29', 'WHOLESALE', 'Coffee', 'PAID', "O'Neil", null, 'USD']);
    const sql = query.mock.calls[0][0] as string;
    expect(sql).toContain('WHERE o.archived_at IS NULL');
    expect(sql).toContain('oi.id AS item_id');
    expect(sql).toContain('report.status=$5');
    expect(sql).toContain('o.currency=$8');
    expect(sql).toContain("oi.sku ILIKE '%'||$4||'%'");
    expect(sql).not.toContain("O'Neil");
    expect(sql).not.toContain('LIMIT 100');
  });
});
