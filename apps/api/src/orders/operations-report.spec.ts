import { OrdersService } from './orders.service';

describe('OrdersService operational summary', () => {
  it('returns return, shipment, and overdue support counts for a bounded period', async () => {
    const query=jest.fn().mockResolvedValue({ rows: [{ returns_open: 2, returns_refunded: 1, shipments_active: 4, shipments_failed: 1, support_overdue: 3 }] });
    const service=new OrdersService({query} as never);
    await expect(service.operationalSummary(30)).resolves.toEqual({ returns_open: 2, returns_refunded: 1, shipments_active: 4, shipments_failed: 1, support_overdue: 3 });
    expect(query).toHaveBeenCalledWith(expect.stringContaining('support_tickets'),[30]);
  });

  it('caps an operation report period at one year', async () => {
    const query=jest.fn().mockResolvedValue({ rows: [{}] });
    await new OrdersService({query} as never).operationalSummary(9999);
    expect(query).toHaveBeenCalledWith(expect.any(String),[365]);
  });
});
