import { DealerPortalController } from './dealer-portal.controller';

describe('DealerPortalController', () => {
  const request = { user: { id: 'dealer-user', email: 'dealer@example.com', role: 'DEALER', sessionId: 'session' } } as never;

  it('restricts ledger movements to the authenticated dealer account', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [{ id: 'ledger' }] });
    const controller = new DealerPortalController({ query } as never, {} as never, {} as never);
    await expect(controller.ledger(request)).resolves.toEqual([{ id: 'ledger' }]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('WHERE dua.user_id=$1'), ['dealer-user']);
  });

  it('restricts shipment records to orders created by the authenticated dealer', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const controller = new DealerPortalController({ query } as never, {} as never, {} as never);
    await expect(controller.shipments(request)).resolves.toEqual([]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('al.actor_user_id=$1'), ['dealer-user']);
    expect(query.mock.calls[0][0]).toContain('al.entity_id=o.id');
  });

  it('allows an active dealer to accept the agreement without bank details', async () => {
    const query = jest.fn().mockResolvedValue({ rowCount: 1, rows: [{ dealer_id: 'dealer' }] });
    const controller = new DealerPortalController({ query } as never, {} as never, {} as never);
    await expect(controller.acceptAgreement(request)).resolves.toEqual({ accepted: true });
    expect(query.mock.calls[0][0]).not.toContain('dealer_bank_accounts');
    expect(query.mock.calls[0][0]).toContain("d.status='ACTIVE'");
    expect(query.mock.calls[0][1]).toEqual(['dealer-user']);
  });

  it('creates a dealer order without requiring bank details and preserves dealer pricing scope', async () => {
    const query = jest.fn().mockResolvedValue({ rowCount: 1, rows: [{ dealer_id: 'dealer' }] });
    const create = jest.fn().mockResolvedValue({ id: 'order' });
    const controller = new DealerPortalController({ query } as never, {} as never, { create } as never);
    await expect(controller.createOrder({ salesChannel: 'RETAIL', customerId: 'other' } as never, 'key', request)).resolves.toEqual({ id: 'order' });
    expect(query.mock.calls[0][0]).not.toContain('dealer_bank_accounts');
    expect(query.mock.calls[0][0]).toContain("d.status='ACTIVE' AND dua.agreement_accepted_at IS NOT NULL");
    expect(query.mock.calls[0][1]).toEqual(['dealer-user']);
    expect(create).toHaveBeenCalledWith({ salesChannel: 'DEALER_PORTAL', customerId: undefined, priceChangeReason: 'Bayi portalı fiyatı' }, 'key', (request as any).user, 'dealer');
  });

  it('does not create an order when the active account or accepted agreement is missing', async () => {
    const query = jest.fn().mockResolvedValue({ rowCount: 0, rows: [] });
    const create = jest.fn();
    const controller = new DealerPortalController({ query } as never, {} as never, { create } as never);
    await expect(controller.createOrder({} as never, 'key', request)).rejects.toThrow('Bayi hesabı bulunamadı');
    expect(create).not.toHaveBeenCalled();
    await expect(controller.acceptAgreement(request)).rejects.toThrow('Aktif Bir Bayi Hesabı');
  });

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
