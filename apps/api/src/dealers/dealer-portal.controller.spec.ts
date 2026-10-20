import { DealerPortalController } from './dealer-portal.controller';

describe('DealerPortalController', () => {
  const request = { user: { id: 'dealer-user', email: 'dealer@example.com', role: 'DEALER', sessionId: 'session' } } as never;

  it('counts orders written by the current dealer under both portal audit actions', async () => {
    const query = jest.fn().mockResolvedValue({ rowCount: 1, rows: [{ order_count: '2' }] });
    const controller = new DealerPortalController({ query } as never, {} as never, {} as never);
    await expect(controller.summary(request)).resolves.toEqual({ order_count: '2' });
    expect(query.mock.calls[0][0]).toContain("'order.dealer.created','order.admin.created'");
  });

  it('returns only the current dealer commission movements', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [{ id: 'entry', order_number: 'TRX-1' }] });
    const controller = new DealerPortalController({ query } as never, {} as never, {} as never);
    await expect(controller.commissions(request)).resolves.toEqual([{ id: 'entry', order_number: 'TRX-1' }]);
    expect(query.mock.calls[0][0]).toContain('dealer_user_accounts dua JOIN commission_entries e ON e.dealer_id=dua.dealer_id');
    expect(query.mock.calls[0][1]).toEqual(['dealer-user']);
  });
});
