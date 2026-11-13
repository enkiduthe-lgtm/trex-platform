import { OrdersService } from './orders.service';

describe('OrdersService operational summary', () => {
  it('returns return, shipment, and overdue support counts for a bounded period', async () => {
    const query=jest.fn().mockResolvedValue({ rows: [{ returns_open: 2, returns_refunded: 1, shipments_active: 4, shipments_failed: 1, support_overdue: 3 }] });
    const service=new OrdersService({query} as never);
    await expect(service.operationalSummary(30,'2026-10-10','2026-11-08')).resolves.toEqual({ returns_open: 2, returns_refunded: 1, shipments_active: 4, shipments_failed: 1, support_overdue: 3 });
    expect(query).toHaveBeenCalledWith(expect.stringContaining('support_tickets'),['2026-10-10','2026-11-08']);
    expect(query.mock.calls[0][0].match(/o\.archived_at IS NULL/g)).toHaveLength(5);
  });

  it('caps an operation report period at one year', async () => {
    const query=jest.fn().mockResolvedValue({ rows: [{}] });
    await new OrdersService({query} as never).operationalSummary(9999,undefined,'2026-11-08');
    expect(query).toHaveBeenCalledWith(expect.any(String),['2025-11-09','2026-11-08']);
  });
});
